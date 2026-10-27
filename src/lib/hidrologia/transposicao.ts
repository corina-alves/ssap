import 'server-only';
import { hojeSp } from '../integracoes/comum';
import { arred } from '../integracoes/http';
import { leiturasDias, saispConfigurado, type Canal } from '../integracoes/saisp-telemetria';
import { SERIE_TRANSPOSICAO, serie, transposicaoAno } from '../integracoes/ssd';

/**
 * Acompanhamento da transposição Paraíba do Sul → Cantareira (UHE Jaguari →
 * Atibainha), porte de transferencia-paraibaV2.php. Leituras de 10 em 10 min
 * do SAISP (canal 1000734) comparadas com a vazão média diária da Sabesp,
 * lida do SSD SP Águas (série 331 — os mesmos dados), mais a operação no ano
 * e o limite anual de volume. Ano, mês e dia são funções separadas para a
 * tela mostrar cada parte assim que ela fica pronta.
 */

export const CANAL_TRANSPOSICAO: Canal = { canal: '1000734', grupo: 'TELEM', produto: 72, ovl: 'G_ESP', code: 100, min: 0, max: 30 };
/** Vazão de referência operacional (m³/s). */
export const REFERENCIA = 8.5;
/** Leituras esperadas num dia completo (uma a cada 10 min). */
const LEITURAS_DIA = 144;

/** m³/s médios num dia → hm³ no dia. */
export const volumeDiaHm3 = (m3s: number) => (m3s * 86_400) / 1e6;

export type Avaliacao = 'compativel' | 'moderada' | 'verificar' | 'sem';
/** Diferença SAISP − Sabesp: ≥ 0,20 m³/s pede verificação; ≥ 0,05, diferença moderada (critério do PHP). */
export const avaliar = (dif: number | null): Avaliacao => (dif === null ? 'sem' : Math.abs(dif) >= 0.2 ? 'verificar' : Math.abs(dif) >= 0.05 ? 'moderada' : 'compativel');

export type DiaMes = {
  dia: string;
  saisp: number | null;
  sabesp: number | null;
  diferenca: number | null;
  minima: number | null;
  maxima: number | null;
  leituras: number;
  esperadas: number;
  disponibilidade: number;
};

const media = (vs: number[]) => (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null);
const d2 = (n: number) => String(n).padStart(2, '0');

/** Minutos desde a meia-noite em São Paulo (para as leituras esperadas de hoje). */
function minutosAgoraSp(): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':');
  return Number(h) * 60 + Number(m);
}

/** Período do mês até hoje: primeiro dia, último dia consultável e a lista de dias. */
export function periodoMes(ano: number, mes: number) {
  const hoje = hojeSp();
  const ultimoDiaMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const inicio = `${ano}-${d2(mes)}-01`;
  const fimMes = `${ano}-${d2(mes)}-${d2(ultimoDiaMes)}`;
  const fim = fimMes < hoje ? fimMes : hoje;
  const futuro = inicio > hoje;
  const dias = futuro ? [] : Array.from({ length: Number(fim.slice(8, 10)) }, (_, i) => `${ano}-${d2(mes)}-${d2(i + 1)}`);
  return { inicio, fim, ultimoDiaMes, futuro, dias };
}

/** Vazão diária da Sabesp no mês (SSD; a mesma consulta serve ao mês e ao dia, pelo cache). */
async function sabespMes(ano: number, mes: number) {
  const p = periodoMes(ano, mes);
  if (p.futuro) return { porDia: new Map<string, number>(), erro: null };
  const s = await serie(SERIE_TRANSPOSICAO, p.inicio, p.fim);
  return { porDia: new Map((s.ok ? s.dados.pontos : []).map((x) => [x.data, x.valor])), erro: s.ok ? null : s.mensagem };
}

/** Operação no ano corrente e limite anual (só SSD: rápido). */
export const anoTransposicao = () => transposicaoAno(hojeSp());

/** SAISP × Sabesp dia a dia no mês, com as estatísticas do mês. */
export async function mesTransposicao(ano: number, mes: number) {
  const p = periodoMes(ano, mes);
  const hoje = hojeSp();
  const [saisp, sabesp] = await Promise.all([leiturasDias(CANAL_TRANSPOSICAO, p.dias), sabespMes(ano, mes)]);
  const dias: DiaMes[] = p.dias.map((d) => {
    const vs = (saisp.leituras.get(d) ?? []).map((l) => l.valor);
    const esperadas = d === hoje ? Math.max(1, Math.floor(minutosAgoraSp() / 10) + 1) : LEITURAS_DIA;
    const m = media(vs);
    const s = sabesp.porDia.get(d) ?? null;
    return {
      dia: d,
      saisp: m === null ? null : arred(m, 3),
      sabesp: s,
      diferenca: m !== null && s !== null ? arred(m - s, 3) : null,
      minima: vs.length ? Math.min(...vs) : null,
      maxima: vs.length ? Math.max(...vs) : null,
      leituras: vs.length,
      esperadas,
      disponibilidade: arred(Math.min(100, (vs.length / esperadas) * 100), 1),
    };
  });
  const saispValidos = dias.flatMap((d) => (d.saisp === null ? [] : [d.saisp]));
  const sabespValidos = dias.flatMap((d) => (d.sabesp === null ? [] : [d.sabesp]));
  const ultimo = [...saisp.leituras.values()].flat().sort((a, b) => `${a.dia} ${a.hora}`.localeCompare(`${b.dia} ${b.hora}`)).at(-1) ?? null;
  return {
    dias,
    saispErro: saisp.erro,
    sabespErro: sabesp.erro,
    ultimoSaisp: ultimo,
    mediaSaisp: media(saispValidos),
    mediaSabesp: media(sabespValidos),
    maxSaisp: saispValidos.length ? Math.max(...saispValidos) : null,
    diasAcima: saispValidos.filter((v) => v >= REFERENCIA).length,
    volumeHm3: sabespValidos.length ? arred(sabespValidos.reduce((t, v) => t + volumeDiaHm3(v), 0), 2) : null,
  };
}

/** Leituras do SAISP num dia (uma consulta só) e o valor da Sabesp do dia. */
export async function diaTransposicao(ano: number, mes: number, dia: number) {
  const data = `${ano}-${d2(mes)}-${d2(dia)}`;
  const [saisp, sabesp] = await Promise.all([leiturasDias(CANAL_TRANSPOSICAO, [data]), sabespMes(ano, mes)]);
  const leituras = saisp.leituras.get(data) ?? [];
  const vs = leituras.map((l) => l.valor);
  const s = sabesp.porDia.get(data) ?? null;
  return {
    data,
    leituras,
    erro: saisp.erro,
    mediaSaisp: media(vs),
    maxSaisp: vs.length ? Math.max(...vs) : null,
    minSaisp: vs.length ? Math.min(...vs) : null,
    sabesp: s,
    volumeHm3: s === null ? null : arred(volumeDiaHm3(s), 3),
  };
}

export { saispConfigurado };
