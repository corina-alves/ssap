import { hojeSp } from '../integracoes/comum';
import { FREQ_MENSAL, idSerieDoSpace, serie } from '../integracoes/ssd';
import { SISTEMAS } from './sistemas-ssd';

/**
 * Séries mensais dos sistemas produtores (SSD, desde 1930) comparadas à MLT.
 * Porte de AnaliseMlt.php e de SsdService::mlt(): a MLT sai da própria série.
 *
 * "Ano do período" = ano em que o período começa: chuvoso 2025 = out/2025 a
 * mar/2026 ("2025/26").
 */

export { SISTEMAS };

/** slug → rótulo, variável e unidade no SSD, agregação no período. */
export const VARIAVEIS = {
  'vazao-natural': { rotulo: 'Vazão natural', ssd: 'Vazão natural', unidade: 'm³/s', agregacao: 'media' },
  chuva: { rotulo: 'Chuva', ssd: 'Chuva', unidade: 'mm', agregacao: 'soma' },
  'vazao-afluente': { rotulo: 'Vazão afluente', ssd: 'Vazão afluente', unidade: 'm³/s', agregacao: 'media' },
  'volume-util': { rotulo: 'Volume útil (%)', ssd: 'Volume útil', unidade: '%', agregacao: 'media' },
} as const;
export type VariavelMlt = keyof typeof VARIAVEIS;
export type Agregacao = 'media' | 'soma';

/** slug → rótulo e meses (1–12) na ordem do período. */
export const PERIODOS = {
  ano: { rotulo: 'Ano civil (jan–dez)', meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  chuvoso: { rotulo: 'Período chuvoso (out–mar)', meses: [10, 11, 12, 1, 2, 3] },
  seco: { rotulo: 'Período seco (abr–set)', meses: [4, 5, 6, 7, 8, 9] },
  hidrologico: { rotulo: 'Ano hidrológico (out–set)', meses: [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
} as const;
export type Periodo = keyof typeof PERIODOS;

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const PRIMEIRO_ANO = 1930;

/** ano → mês (1–12) → valor */
export type PorAno = Record<number, Record<number, number>>;
export type SerieMensal = { porAno: PorAno; inicio: number; fim: number; ultimo: { data: string; valor: number } };

/** Série mensal completa de uma variável de um sistema. Lança erro se o SSD não tem ou não respondeu. */
export async function serieMensal(sistema: string, variavel: VariavelMlt): Promise<SerieMensal> {
  const s = SISTEMAS[sistema];
  if (!s) throw new Error('Sistema desconhecido.');
  const v = VARIAVEIS[variavel];
  const id = await idSerieDoSpace(s.space, v.ssd, v.unidade, FREQ_MENSAL);
  if (!id) throw new Error('Série não encontrada no SSD para este sistema.');
  const r = await serie(id, `${PRIMEIRO_ANO}-01-01`, hojeSp());
  if (!r.ok || !r.dados.pontos.length) throw new Error('O SSD não retornou dados.');
  const porAno: PorAno = {};
  for (const p of r.dados.pontos) (porAno[Number(p.data.slice(0, 4))] ??= {})[Number(p.data.slice(5, 7))] = p.valor;
  const anos = Object.keys(porAno).map(Number);
  return { porAno, inicio: Math.min(...anos), fim: Math.max(...anos), ultimo: r.dados.pontos[r.dados.pontos.length - 1]! };
}

/** MLT mês a mês: média de cada mês nos anos civis de..ate (índice 0 = janeiro). */
export function mltMensal(porAno: PorAno, de?: number | null, ate?: number | null): { mlt: (number | null)[]; de: number | null; ate: number | null } {
  const soma = new Array<number>(12).fill(0);
  const n = new Array<number>(12).fill(0);
  let min: number | null = null;
  let max: number | null = null;
  for (const [a, meses] of Object.entries(porAno)) {
    const ano = Number(a);
    if ((de && ano < de) || (ate && ano > ate)) continue;
    for (const [m, v] of Object.entries(meses)) {
      soma[Number(m) - 1]! += v;
      n[Number(m) - 1]!++;
    }
    min = min === null ? ano : Math.min(min, ano);
    max = max === null ? ano : Math.max(max, ano);
  }
  return { mlt: soma.map((s, i) => (n[i] ? s / n[i]! : null)), de: min, ate: max };
}

/** Ano civil do mês `m` dentro do período que começa no ano `y` (períodos que atravessam o ano). */
export function anoDoMes(periodo: Periodo, y: number, m: number): number {
  const primeiro = PERIODOS[periodo].meses[0];
  return primeiro > m && primeiro >= 10 ? y + 1 : y;
}

export function rotuloAno(periodo: Periodo, y: number): string {
  return PERIODOS[periodo].meses[0] >= 10 ? `${y}/${String(y + 1).slice(2)}` : String(y);
}

/** Valores do período `y` na ordem dos meses (null onde não há dado). */
export function valoresPeriodo(porAno: PorAno, periodo: Periodo, y: number): (number | null)[] {
  return PERIODOS[periodo].meses.map((m) => porAno[anoDoMes(periodo, y, m)]?.[m] ?? null);
}

/** Soma ou média dos valores presentes. */
export function agregar(valores: (number | null | undefined)[], agregacao: Agregacao): number | null {
  const v = valores.filter((x): x is number => x != null);
  if (!v.length) return null;
  const soma = v.reduce((t, x) => t + x, 0);
  return agregacao === 'soma' ? soma : soma / v.length;
}

/**
 * Valor do período `y` e MLT comparável (só dos meses com dado — período em
 * andamento compara com a MLT dos mesmos meses).
 */
export function resumoPeriodo(porAno: PorAno, mlt: (number | null)[], periodo: Periodo, y: number, agregacao: Agregacao) {
  const vals = valoresPeriodo(porAno, periodo, y);
  const mltVals = PERIODOS[periodo].meses.filter((_, i) => vals[i] !== null).map((m) => mlt[m - 1]);
  const valor = agregar(vals, agregacao);
  const ref = agregar(mltVals, agregacao);
  const meses = vals.filter((x) => x !== null).length;
  return { valor, mlt: ref, pct: valor !== null && ref ? (valor / ref) * 100 : null, meses, completo: meses === vals.length };
}

/** Soma corrida, mantendo null depois do último mês com dado. */
export function acumular(valores: (number | null)[]): (number | null)[] {
  const ultimo = valores.reduce<number>((u, v, i) => (v !== null ? i : u), -1);
  let s = 0;
  return valores.map((v, i) => {
    s += v ?? 0;
    return i <= ultimo ? Math.round(s * 100) / 100 : null;
  });
}
