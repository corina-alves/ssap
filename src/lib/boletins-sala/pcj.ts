import mediasIniciais from '@/conteudo/pcj-medias.json';
import postosJson from '@/conteudo/pcj-postos.json';
import { hojeSp, RE_DATA } from '../integracoes/comum';
import { cotasAlerta, leitura, mediaVazao, medicoes, somar, type Pedido } from '../integracoes/sibh-medicoes';

/**
 * Dados do Boletim Diário PCJ (porte de acesso/boletim_pcj/dados.php), a partir
 * da API do SIBH. "7h" = 07:00 de Brasília.
 *
 * Postos: src/conteudo/pcj-postos.json (config/postos.php do PHP).
 * Médias históricas: as do arquivo pcj-medias.json, até alguém usar "Salvar
 * médias do mês" — aí passam a valer as gravadas no banco (configuracoes).
 */

export const SALA_PCJ = 'pcj';
export const PERMISSAO_PCJ = 'criar_boletim';
export const CHAVE_MEDIAS = 'boletim-pcj.medias';

type PostoChuva = { mapa: string; rio: string; local: string; id: number; recente?: boolean };
type PostoFlu = { mapa: string; rio: string; local: string; codigo: string; id: number; orto?: boolean };
type PostoCota = { mapa: string; nome: string; codigo: string; id: number; orto?: boolean };
export const POSTOS = postosJson as { chuva: PostoChuva[]; fluviometria: PostoFlu[]; cotas: PostoCota[] };

/** grupo → mapa do posto → mês ("1".."12") → valor */
export type Medias = Record<'chuva' | 'vazao' | 'nivel', Record<string, Record<string, number>>>;
export const MEDIAS_INICIAIS = mediasIniciais as unknown as Medias;

const DIA = 86_400_000;
/** Instante (ms) de uma data/hora de Brasília (UTC−3, sem horário de verão desde 2019). */
const local = (ymd: string, hora = 0, minuto = 0) =>
  Date.parse(`${ymd}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00-03:00`);

const arred = (v: number | null | undefined, casas = 2) => (v == null ? null : Math.round(v * 10 ** casas) / 10 ** casas);

/** Mesmo dia do ano anterior (29/02 vira 01/03, como o "-1 year" do PHP). */
function anoAnterior(ymd: string): string {
  const [a, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a - 1, m - 1, d)).toISOString().slice(0, 10);
}

export async function dadosPcj(dataPedida: string, medias: Medias) {
  const inicio = Date.now();
  const hoje = hojeSp();
  const dia = RE_DATA.test(dataPedida) && !Number.isNaN(Date.parse(dataPedida)) && dataPedida <= hoje ? dataPedida : hoje;
  const ehHoje = dia === hoje;
  const ttlDia = ehHoje ? 300 : DIA / 1000;

  const idsPlu = POSTOS.chuva.map((p) => p.id);
  const idsFlu = POSTOS.fluviometria.map((p) => p.id);
  const mes = Number(dia.slice(5, 7));
  const h7 = local(dia, 7);
  const h7Ontem = h7 - DIA;
  const iniMes = local(`${dia.slice(0, 8)}01`);
  const diaAnoAnt = anoAnterior(dia);
  const h7AnoAnt = local(diaAnoAnt, 7);
  const tag = dia.replace(/-/g, '');
  const chaveAnoAnt = `flu_7h_${diaAnoAnt.replace(/-/g, '')}`;
  const dezMin = 600_000;

  const pedidos: Record<string, Pedido> = {
    // chuva do mês até as 7h (e as 24 h anteriores, que podem começar no mês anterior)
    [`plu_hora_${tag}`]: { ids: idsPlu, ini: Math.min(iniMes, h7Ontem), fim: h7, grupo: 'hour', ttlSeg: ttlDia },
    [`flu_hora_${tag}`]: { ids: idsFlu, ini: iniMes, fim: h7, grupo: 'hour', ttlSeg: ttlDia },
    [`flu_7h_${tag}`]: { ids: idsFlu, ini: h7 - dezMin, fim: h7 + dezMin, grupo: 'minute', ttlSeg: ttlDia },
    [chaveAnoAnt]: { ids: idsFlu, ini: h7AnoAnt - dezMin, fim: h7AnoAnt + dezMin, grupo: 'minute', ttlSeg: 30 * 86_400 },
  };
  // Chuva de cada mês fechado do ano (jan até o mês anterior): um pedido por
  // mês, por dia, somado aqui. O PHP pedia o ano todo agrupado por mês, mas
  // assim o SIBH leva mais de 60 s; um mês por dia volta em menos de 1 s.
  const mesesAno = Array.from({ length: mes - 1 }, (_, i) => i + 1);
  const ano = dia.slice(0, 4);
  const inicioDoMes = (m: number) => local(`${ano}-${String(m).padStart(2, '0')}-01`);
  const chaveMes = (m: number) => `plu_mes_${ano}${String(m).padStart(2, '0')}`;
  for (const m of mesesAno) {
    const fim = m === mes - 1 ? iniMes : inicioDoMes(m + 1);
    // Nos 3 primeiros dias depois do fechamento o total do mês ainda pode mudar.
    // Limite de 20 s: às vezes o SIBH demora na primeira consulta de um mês
    // antigo; o mês que faltar sai com "*" e vem ao carregar de novo.
    pedidos[chaveMes(m)] = {
      ids: idsPlu, ini: inicioDoMes(m), fim, grupo: 'day', timeoutMs: 20_000,
      ttlSeg: fim + 3 * DIA < Date.now() ? 30 * 86_400 : 3600,
    };
  }

  const [med, cotas] = await Promise.all([
    medicoes('pcj', pedidos),
    cotasAlerta('pcj', [...idsFlu, ...POSTOS.cotas.map((p) => p.id)]),
  ]);
  const avisos = Object.keys(med).filter((k) => med[k] === null);
  if (cotas === null) avisos.push('parametros');

  // ---- Chuva ----
  const pluHora = med[`plu_hora_${tag}`] ?? null;
  const chuva24 = somar(pluHora, h7Ontem, h7);
  const chuvaMes = somar(pluHora, iniMes, h7);
  const porMes = mesesAno.map((m) => {
    const soma: Record<string, number> = {};
    for (const [id, , v] of med[chaveMes(m)] ?? []) if (v !== null) soma[id] = (soma[id] ?? 0) + v;
    return soma;
  });
  const chuva = POSTOS.chuva.map((p) => ({
    mapa: p.mapa, rio: p.rio, local: p.local, recente: !!p.recente,
    meses: porMes.map((s) => arred(s[p.id])),
    h24: pluHora === null ? null : arred(chuva24[p.id]),
    mes: pluHora === null ? null : arred(chuvaMes[p.id]),
    media: arred(medias.chuva?.[p.mapa]?.[mes]),
  }));

  // ---- Vazão e nível ----
  const vazaoMes = mediaVazao(med[`flu_hora_${tag}`] ?? null, iniMes, h7 + 1000);
  const l7 = leitura(med[`flu_7h_${tag}`] ?? null, h7);
  const l7Ant = leitura(med[chaveAnoAnt] ?? null, h7AnoAnt);
  const fluviometria = POSTOS.fluviometria.map((p) => ({
    mapa: p.mapa, rio: p.rio, local: p.local, codigo: p.codigo, orto: !!p.orto,
    vazao_mes: arred(vazaoMes[p.id]),
    vazao_7h: arred(l7[p.id]?.vazao),
    nivel_7h: arred(l7[p.id]?.nivel),
    vazao_media: arred(medias.vazao?.[p.mapa]?.[mes]),
    nivel_medio: arred(medias.nivel?.[p.mapa]?.[mes]),
    vazao_ano_ant: arred(l7Ant[p.id]?.vazao),
    nivel_ano_ant: arred(l7Ant[p.id]?.nivel),
    cotas: cotas?.[p.id] ?? null,
  }));

  const semCota = { atencao: null, alerta: null, emergencia: null, extravasamento: null };
  return {
    data: dia,
    mes,
    ano: Number(dia.slice(0, 4)),
    data_ano_anterior: diaAnoAnt,
    meses_fechados: mesesAno,
    chuva,
    fluviometria,
    cotas: POSTOS.cotas.map((p) => ({ mapa: p.mapa, nome: p.nome, codigo: p.codigo, orto: !!p.orto, ...(cotas?.[p.id] ?? semCota) })),
    avisos,
    tempo_ms: Date.now() - inicio,
  };
}

/**
 * Aplica as médias de UM mês enviadas pela tela ("Salvar médias do mês").
 * Devolve as médias novas e quantos valores mudaram (0 = nada a gravar).
 */
export function aplicarMedias(atual: Medias, entrada: unknown): { erro: string } | { medias: Medias; alterados: number; mes: number } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const mes = Number(e.mes);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { erro: 'Mês inválido.' };

  const validos: Record<keyof Medias, Set<string>> = {
    chuva: new Set(POSTOS.chuva.map((p) => p.mapa)),
    vazao: new Set(POSTOS.fluviometria.map((p) => p.mapa)),
    nivel: new Set(POSTOS.fluviometria.map((p) => p.mapa)),
  };
  const medias = structuredClone(atual);
  let alterados = 0;
  for (const grupo of ['chuva', 'vazao', 'nivel'] as const) {
    medias[grupo] ??= {};
    const enviados = e[grupo];
    if (!enviados || typeof enviados !== 'object') continue;
    for (const [mapa, valor] of Object.entries(enviados as Record<string, unknown>)) {
      if (!validos[grupo].has(mapa)) continue;
      if (valor === null || valor === '') {
        if (medias[grupo][mapa]?.[mes] !== undefined) {
          delete medias[grupo][mapa][mes];
          alterados++;
        }
        continue;
      }
      const n = Number(valor);
      if (!Number.isFinite(n) || n < 0 || n > 100_000) continue;
      const v = Math.round(n * 1000) / 1000;
      if (medias[grupo][mapa]?.[mes] !== v) {
        (medias[grupo][mapa] ??= {})[mes] = v;
        alterados++;
      }
    }
  }
  return { medias, alterados, mes };
}
