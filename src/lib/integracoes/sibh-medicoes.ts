import { lembrar, type Lembrado } from './cache';
import { buscarJson, ErroFonte } from './http';

/**
 * Medições e cotas do SIBH para os boletins das salas (porte de
 * acesso/boletim_pcj/dados.php).
 *
 * O SIBH aceita no máximo 10 postos por consulta e fica lento (ou cai) com
 * períodos longos. Por isso: lotes de 10 postos, poucas consultas ao mesmo
 * tempo e cache por pedido (dia fechado fica guardado; dia corrente, 5 min).
 */

/**
 * Endereços da API do SIBH, os mesmos em todo o sistema. O SIBH também responde
 * em cth.daee.sp.gov.br, com os mesmos dados (conferido em 12/11/2026), mas o
 * servidor de produção só precisa liberar apps.spaguas.sp.gov.br (DOCKER.md).
 */
export const SIBH_API_V1 = 'https://apps.spaguas.sp.gov.br/sibh/api/v1/';
export const SIBH_API_V2 = 'https://apps.spaguas.sp.gov.br/sibh/api/v2/';
const SIBH = SIBH_API_V2;
const CONEXOES = 4;
const TIMEOUT_MS = 60_000;

/** [posto, data em UTC como o SIBH manda, valor, vazão (read_value)] */
export type Medicao = [id: string, data: string, valor: number | null, vazao: number | null];
// Sem 'month' de propósito: agrupado por mês o SIBH leva cerca de 60 s por
// consulta (medido em 05/10/2026); por dia, o mesmo período volta em menos de 1 s.
export type Grupo = 'minute' | 'hour' | 'day';
export type Pedido = { ids: number[]; ini: number; fim: number; grupo: Grupo; ttlSeg: number; timeoutMs?: number };

/** Instante (ms) → texto UTC que o SIBH espera. */
const z = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z';

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// No máximo CONEXOES chamadas ao SIBH ao mesmo tempo, somando todos os pedidos.
let emUso = 0;
const espera: (() => void)[] = [];
async function comVaga<T>(fn: () => Promise<T>): Promise<T> {
  if (emUso >= CONEXOES) await new Promise<void>((ok) => espera.push(ok));
  else emUso++;
  try {
    return await fn();
  } finally {
    const proximo = espera.shift();
    if (proximo) proximo(); // a vaga passa direto para quem esperava
    else emUso--;
  }
}

// Com várias consultas ao mesmo tempo, o SIBH às vezes recusa na hora (HTTP 502, em menos de 1 s;
// medido em 11/11/2026: 53 recusas na montagem de um boletim mensal). Recusa passageira: tenta
// de novo, fora da vaga, com espera crescente. Sem isso, um lote recusado deixava o mês sem chuva.
const TRANSITORIOS = new Set([502, 503, 504]);
const TENTATIVAS = 4;

async function sibh(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await comVaga(() => buscarJson(url, { timeoutMs }));
    } catch (e) {
      const status = e instanceof ErroFonte ? e.status : null;
      if (tentativa >= TENTATIVAS || status === null || !TRANSITORIOS.has(status)) throw e;
      await new Promise((ok) => setTimeout(ok, 1500 * tentativa + Math.random() * 1000));
    }
  }
}

/** GET na API v2 do SIBH (caminho depois de /api/v2/), respeitando o limite de conexões. */
export const buscarSibh = (caminho: string, timeoutMs = 40_000) => sibh(SIBH + caminho, timeoutMs);

async function buscarPedido(p: Pedido): Promise<Medicao[]> {
  const lotes: number[][] = [];
  for (let i = 0; i < p.ids.length; i += 10) lotes.push(p.ids.slice(i, i + 10));
  const partes = await Promise.all(
    lotes.map(async (lote) => {
      const url = `${SIBH}measurements?${lote.map((i) => `station_prefix_ids[]=${i}`).join('&')}&start_date=${z(p.ini)}&end_date=${z(p.fim)}&group_type=${p.grupo}`;
      const j = (await sibh(url, p.timeoutMs)) as { measurements?: Record<string, unknown>[] };
      if (!Array.isArray(j.measurements)) throw new Error('resposta do SIBH sem "measurements"'); // uma parte falhou: não guarda
      return j.measurements.map((m): Medicao => [String(m.station_prefix_id), String(m.date), numero(m.value), numero(m.read_value)]);
    }),
  );
  return partes.flat();
}

/**
 * Medições de vários pedidos, numa passada. Chave → lista, ou null se o SIBH
 * falhou e não havia valor guardado.
 */
export async function medicoes(servico: string, pedidos: Record<string, Pedido>): Promise<Record<string, Medicao[] | null>> {
  const chaves = Object.keys(pedidos);
  const listas = await Promise.all(
    chaves.map(async (chave) => (await lembrar(servico, chave, pedidos[chave]!.ttlSeg, () => buscarPedido(pedidos[chave]!)))?.valor ?? null),
  );
  return Object.fromEntries(chaves.map((c, i) => [c, listas[i]!]));
}

/** Chuva de um pluviômetro na janela (mm) e o código IBGE do município dele. */
export type ChuvaPosto = { mm: number; ibge: string | null };

const HORA_MS = 3_600_000;

/**
 * Chuva acumulada de TODOS os pluviômetros do estado nas `horas` que terminam
 * em `ateMs` (sem ele, agora): station_prefix_id → mm e município. Uma consulta
 * ao SIBH (~700 KB) serve o mapa da Defesa Civil, o boletim diário e os sumários
 * automáticos (Tietê-Pinheiros e Vale do Ribeira), que antes baixavam o mesmo
 * arquivo cada um com o seu cache.
 *
 * Prazo: janela até agora, 3 min; janela que acabou há menos de 3 h, 10 min
 * (ainda chegam leituras atrasadas); até 1 dia, 1 h; depois, 1 dia. Com o SIBH
 * fora, a janela "até agora" usa a última cópia por até 6 h (depois disso, nada:
 * chuva de dias atrás não serve como "últimas horas"); janela fechada, até 30 dias.
 */
export async function chuvaAcumuladaPostos(horas: number, ateMs?: number): Promise<Lembrado<Record<string, ChuvaPosto>> | null> {
  const fechada = ateMs !== undefined;
  const idade = fechada ? Date.now() - ateMs : 0;
  const ttl = !fechada ? 180 : idade < 3 * HORA_MS ? 600 : idade < 24 * HORA_MS ? 3600 : 86_400;
  const ate = fechada ? `&from_date=${new Date(ateMs).toISOString().slice(0, 19)}Z` : '';
  const chave = `acumulada:${horas}h:${fechada ? Math.round(ateMs / 60_000) : 'agora'}`;
  return lembrar(
    'sibh',
    chave,
    ttl,
    async () => {
      const j = (await sibh(`${SIBH}measurements/now?station_type_id=2&hours=${horas}${ate}`, 40_000)) as {
        measurements?: { station_prefix_id?: unknown; cod_ibge?: unknown; value?: unknown }[];
      };
      if (!Array.isArray(j.measurements)) throw new Error('resposta do SIBH sem "measurements"');
      const saida: Record<string, ChuvaPosto> = {};
      for (const m of j.measurements) {
        const v = numero(m.value);
        if (v !== null && m.station_prefix_id != null) saida[String(m.station_prefix_id)] = { mm: v, ibge: m.cod_ibge == null || m.cod_ibge === '' ? null : String(m.cod_ibge) };
      }
      return saida;
    },
    { validadeMaxSeg: fechada ? 30 * 86_400 : 6 * 3600 },
  );
}

/** Média da chuva dos postos que passam no `filtro` (negativo conta 0). null sem nenhum posto com leitura. */
export function mediaChuva(postos: Record<string, ChuvaPosto> | null | undefined, filtro: (id: string, c: ChuvaPosto) => boolean): { media: number; postos: number } | null {
  const valores = Object.entries(postos ?? {}).flatMap(([id, c]) => (filtro(id, c) ? [Math.max(0, c.mm)] : []));
  return valores.length ? { media: valores.reduce((a, b) => a + b, 0) / valores.length, postos: valores.length } : null;
}

export type Cotas = { atencao: number | null; alerta: number | null; emergencia: number | null; extravasamento: number | null };

/** Cotas de alerta dos postos (parameters; cm → m). Guardadas por 1 dia. */
export async function cotasAlerta(servico: string, ids: number[]): Promise<Record<string, Cotas> | null> {
  const unicos = [...new Set(ids)];
  const l = await lembrar(servico, `parametros:${unicos.join(',')}`, 86_400, async () => {
    const url = `${SIBH}parameters?parameterizable_type=StationPrefix&${unicos.map((i) => `parameterizable_ids[]=${i}`).join('&')}`;
    const r = await sibh(url);
    if (!Array.isArray(r)) return null;
    const cotas: Record<string, Cotas> = {};
    for (const p of r as Record<string, unknown>[]) {
      if (String(p.parameter_type_id ?? '') !== '2') continue;
      const v = (p.values ?? {}) as Record<string, unknown>;
      const m = (k: string) => {
        const n = numero(v[k]);
        return n === null ? null : Math.round(n * 10) / 1000;
      };
      cotas[String(p.parameterizable_id)] = { atencao: m('attention'), alerta: m('alert'), emergencia: m('emergency'), extravasamento: m('extravasation') };
    }
    return cotas;
  });
  return l?.valor ?? null;
}

/** Data do SIBH ("2026/09/26 10" ou "2026/09/26 10:20", em UTC) → ms. */
export function instante(d: string): number {
  const t = d.replace(/\//g, '-');
  return Date.parse(`${t.replace(' ', 'T')}${t.length === 13 ? ':00:00' : ':00'}Z`);
}

/** Soma (chuva) de cada posto no intervalo [ini, fim). */
export function somar(med: Medicao[] | null, ini: number, fim: number): Record<string, number> {
  const s: Record<string, number> = {};
  for (const [id, d, v] of med ?? []) {
    const t = instante(d);
    if (t >= ini && t < fim && v !== null) s[id] = (s[id] ?? 0) + v;
  }
  return s;
}

/** Média da vazão de cada posto no intervalo [ini, fim). */
export function mediaVazao(med: Medicao[] | null, ini: number, fim: number): Record<string, number> {
  const s: Record<string, number> = {};
  const n: Record<string, number> = {};
  for (const [id, d, , q] of med ?? []) {
    const t = instante(d);
    if (t >= ini && t < fim && q !== null) {
      s[id] = (s[id] ?? 0) + q;
      n[id] = (n[id] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(s).map(([id, soma]) => [id, soma / n[id]!]));
}

/** Leitura mais próxima do instante alvo (até 10 min de diferença): nível em m e vazão em m³/s. */
export function leitura(med: Medicao[] | null, alvo: number): Record<string, { nivel: number; vazao: number | null }> {
  const melhor: Record<string, { dif: number; nivel: number; vazao: number | null }> = {};
  for (const [id, d, v, q] of med ?? []) {
    const dif = Math.abs(instante(d) - alvo);
    if (dif <= 600_000 && v !== null && (!melhor[id] || dif < melhor[id].dif)) melhor[id] = { dif, nivel: v / 100, vazao: q };
  }
  return Object.fromEntries(Object.entries(melhor).map(([id, m]) => [id, { nivel: m.nivel, vazao: m.vazao }]));
}
