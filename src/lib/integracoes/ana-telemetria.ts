import { lembrar, TTL } from './cache';
import { hojeSp, somarDias } from './comum';
import { arred, buscarTexto, numero } from './http';

/**
 * ANA — telemetria (ServiceANA, o serviço público antigo, sem login):
 *   https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao=&dataInicio=dd/mm/aaaa&dataFim=dd/mm/aaaa
 * Leituras de 15 em 15 min, na hora de Brasília: vazão (m³/s), nível (cm; aqui
 * em m) e chuva do intervalo (mm). Usado nos postos do RJ e de MG do diagrama
 * da bacia do Paraíba do Sul, onde o SIBH não chega.
 *
 * O serviço às vezes responde vazio (ou demora demais) a pedidos simultâneos: no
 * máximo duas consultas ao mesmo tempo, resposta vazia é tentada de novo uma vez
 * e não é guardada como dado.
 */

const BASE = 'https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos';
export const FONTE = 'ANA — Telemetria';

/** Uma leitura; `t` = "AAAA-MM-DD HH:MM" (hora de Brasília). */
export type LeituraAna = { t: string; vazao: number | null; nivel: number | null; chuva: number | null };
/** Um dia: vazão e nível médios, chuva somada (null = sem leitura daquilo no dia). */
export type DiaAna = { data: string; vazao: number | null; nivel: number | null; chuva: number | null };

/** Leituras do XML do ServiceANA, da mais antiga para a mais recente. */
export function lerXmlAna(xml: string): LeituraAna[] {
  const saida: LeituraAna[] = [];
  for (const m of xml.matchAll(/<DadosHidrometereologicos\b[^>]*>([\s\S]*?)<\/DadosHidrometereologicos>/g)) {
    const campo = (n: string) => m[1]!.match(new RegExp(`<${n}>([^<]*)</${n}>`))?.[1]?.trim() ?? null;
    const t = campo('DataHora');
    if (!t || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t)) continue;
    const nivelCm = numero(campo('Nivel'));
    saida.push({ t: t.slice(0, 16), vazao: numero(campo('Vazao')), nivel: nivelCm === null ? null : arred(nivelCm / 100, 2), chuva: numero(campo('Chuva')) });
  }
  return saida.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
}

const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const soma = (v: (number | null)[]) => {
  const n = v.filter((x): x is number => x !== null);
  return n.length ? arred(n.reduce((s, x) => s + Math.max(0, x), 0), 1) : null;
};

/** Leituras agrupadas por dia (vazão e nível médios, chuva somada). */
export function porDia(ls: LeituraAna[]): DiaAna[] {
  const dias = new Map<string, LeituraAna[]>();
  for (const l of ls) dias.set(l.t.slice(0, 10), [...(dias.get(l.t.slice(0, 10)) ?? []), l]);
  return [...dias].map(([data, x]) => {
    const q = media(x.flatMap((l) => (l.vazao === null ? [] : [l.vazao])));
    const h = media(x.flatMap((l) => (l.nivel === null ? [] : [l.nivel])));
    return { data, vazao: q === null ? null : arred(q, 2), nivel: h === null ? null : arred(h, 2), chuva: soma(x.map((l) => l.chuva)) };
  });
}

// no máximo duas consultas ao mesmo tempo ao ServiceANA (mais que isso, ele responde vazio)
const SIMULTANEAS = 2;
let ativas = 0;
const esperando: (() => void)[] = [];
async function naVez<T>(f: () => Promise<T>): Promise<T> {
  if (ativas >= SIMULTANEAS) await new Promise<void>((ok) => esperando.push(ok));
  ativas++;
  try {
    return await f();
  } finally {
    ativas--;
    esperando.shift()?.();
  }
}

const br = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Leituras de `de` a `ate`; resposta vazia é tentada de novo uma vez (o serviço às vezes falha assim). */
async function buscar(cod: string, de: string, ate: string): Promise<LeituraAna[]> {
  const url = `${BASE}?codEstacao=${encodeURIComponent(cod)}&dataInicio=${br(de)}&dataFim=${br(ate)}`;
  for (let tentativa = 0; ; tentativa++) {
    const l = lerXmlAna(await naVez(() => buscarTexto(url, { timeoutMs: 20_000 })));
    if (l.length || tentativa >= 1) return l;
    await espera(800);
  }
}

/** Leituras de hoje e dos 3 dias antes (para a última leitura e a chuva de 24 h e 72 h). Refeitas a cada 10 min. */
function recentes(cod: string, hoje: string) {
  return lembrar('ana-telemetria', `recentes:${cod}:${hoje}`, 10 * 60, async () => {
    const l = await buscar(cod, somarDias(hoje, -3), hoje);
    return l.length ? l : null;
  }, { esperaFalhaSeg: 5 * 60, validadeMaxSeg: 6 * 3600 });
}

/** Médias e somas por dia de `de` a `ate`. Dias de até 2 dias atrás ainda recebem leituras atrasadas: 6 h; depois, de vez. */
export function diasAna(cod: string, de: string, ate: string) {
  const ttl = ate >= somarDias(hojeSp(), -2) ? 6 * 3600 : TTL.historico;
  return lembrar('ana-telemetria', `dias:${cod}:${de}:${ate}`, ttl, async () => {
    const d = porDia(await buscar(cod, de, ate));
    return d.length ? d : null;
  }, { esperaFalhaSeg: 10 * 60 });
}

/** Valor do posto para o diagrama: a leitura mais recente (hoje) ou a média do dia (dia que já acabou). */
export type ValorAna = { valor: number; data: string; hora?: string };
export type ResumoAna = { vazao: ValorAna | null; nivel: ValorAna | null; chuva24: ValorAna | null; chuva72: ValorAna | null; chuvaMes: ValorAna | null };

const fmtSp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** "AAAA-MM-DD HH:MM" em São Paulo. */
const instanteSp = (ms: number) => fmtSp.format(new Date(ms)).replace(',', '');

/**
 * Resumo de uma estação na `data`: vazão e nível (hoje: a última leitura, com a
 * hora; dia passado: a média do dia), chuva das últimas 24 h e 72 h (dia
 * passado: do dia e dos 3 dias até ele) e acumulada no mês até a data.
 */
export async function resumoEstacao(cod: string, data: string, agoraMs = Date.now()): Promise<ResumoAna | null> {
  const hoje = hojeSp();
  const mes = `${data.slice(0, 8)}01`;
  if (data === hoje) {
    // o mês até ontem (dia 1º: nada antes de hoje) e as leituras dos últimos 4 dias
    const [r, f] = await Promise.all([recentes(cod, hoje), data > mes ? diasAna(cod, mes, somarDias(data, -1)) : Promise.resolve(null)]);
    const ls = r?.valor ?? [];
    if (!ls.length && !f) return null;
    const ultima = (k: 'vazao' | 'nivel'): ValorAna | null => {
      const l = ls.findLast((x) => x[k] !== null);
      return l ? { valor: l[k]!, data: l.t.slice(0, 10), hora: l.t.slice(11, 16) } : null;
    };
    const desde = (h: number) => {
      const lim = instanteSp(agoraMs - h * 3_600_000);
      const s = soma(ls.filter((l) => l.t > lim).map((l) => l.chuva));
      const u = ls.findLast((l) => l.chuva !== null);
      return s === null || !u ? null : { valor: s, data: u.t.slice(0, 10), hora: u.t.slice(11, 16) };
    };
    const hojeChuva = soma(ls.filter((l) => l.t.startsWith(hoje)).map((l) => l.chuva));
    const antes = (f?.valor ?? []).filter((d) => d.data >= mes).map((d) => d.chuva);
    const mesTotal = soma([...antes, hojeChuva]);
    return { vazao: ultima('vazao'), nivel: ultima('nivel'), chuva24: desde(24), chuva72: desde(72), chuvaMes: mesTotal === null ? null : { valor: mesTotal, data } };
  }
  const de = somarDias(data, -2) < mes ? somarDias(data, -2) : mes;
  const f = await diasAna(cod, de, data);
  if (!f) return null;
  const dia = f.valor.find((d) => d.data === data);
  const v = (x: number | null | undefined): ValorAna | null => (x == null ? null : { valor: x, data });
  return {
    vazao: v(dia?.vazao),
    nivel: v(dia?.nivel),
    chuva24: v(dia?.chuva),
    chuva72: v(soma(f.valor.filter((d) => d.data >= somarDias(data, -2)).map((d) => d.chuva))),
    chuvaMes: v(soma(f.valor.filter((d) => d.data >= mes).map((d) => d.chuva))),
  };
}

/**
 * Os 30 dias até `data` (vazão e nível médios, chuva do dia) para os gráficos do
 * posto; hoje entra com as leituras até agora.
 */
export async function trintaDias(cod: string, data: string): Promise<{ dias: DiaAna[]; atual: { vazao: number | null; nivel: number | null; hora: string } | null; semDados: boolean }> {
  const hoje = hojeSp();
  const de = somarDias(data, -29);
  const ehHoje = data === hoje;
  const [f, r] = await Promise.all([diasAna(cod, de, ehHoje ? somarDias(data, -1) : data), ehHoje ? recentes(cod, hoje) : Promise.resolve(null)]);
  const ls = r?.valor ?? [];
  const deHoje = ehHoje ? porDia(ls.filter((l) => l.t.startsWith(hoje))) : [];
  const todos = [...(f?.valor ?? []), ...deHoje];
  const periodo = Array.from({ length: 30 }, (_, k) => somarDias(data, k - 29));
  const u = ls.findLast((l) => l.vazao !== null || l.nivel !== null);
  return {
    dias: periodo.map((d) => todos.find((x) => x.data === d) ?? { data: d, vazao: null, nivel: null, chuva: null }),
    atual: u ? { vazao: u.vazao, nivel: u.nivel, hora: u.t.slice(11, 16) } : null,
    semDados: !f && !r,
  };
}
