import { lembrar } from './cache';
import { buscarJson } from './http';

/**
 * Medições e cotas do SIBH para os boletins das salas (porte de
 * acesso/boletim_pcj/dados.php).
 *
 * O SIBH aceita no máximo 10 postos por consulta e fica lento (ou cai) com
 * períodos longos. Por isso: lotes de 10 postos, poucas consultas ao mesmo
 * tempo e cache por pedido (dia fechado fica guardado; dia corrente, 5 min).
 */

const SIBH = 'https://apps.spaguas.sp.gov.br/sibh/api/v2/';
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

const sibh = (url: string, timeoutMs = TIMEOUT_MS) => comVaga(() => buscarJson(url, { timeoutMs }));

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
