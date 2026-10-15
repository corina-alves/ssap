import type { Lembrado } from './cache';

/**
 * Resultado de uma integração para a tela: ou há dados (talvez desatualizados,
 * vindos da reserva), ou a fonte está indisponível com uma mensagem clara.
 */
export type Dado<T> =
  | { ok: true; dados: T; fonte: string; obtidoEm: Date; desatualizado: boolean }
  | { ok: false; fonte: string; mensagem: string };

export function comoDado<T>(fonte: string, l: Lembrado<T> | null, mensagem?: string): Dado<T> {
  if (!l) return { ok: false, fonte, mensagem: mensagem ?? `${fonte} indisponível no momento. Tente novamente em alguns minutos.` };
  return { ok: true, dados: l.valor, fonte, obtidoEm: l.obtidoEm, desatualizado: l.desatualizado };
}

const fmtYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Data de hoje em São Paulo (AAAA-MM-DD). */
export function hojeSp(): string {
  return fmtYmd.format(new Date());
}

/** AAAA-MM-DD deslocada `dias` (negativo = passado). */
export function somarDias(ymd: string, dias: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Dia passado não muda: cache "para sempre"; dia corrente: `ttlHoje`. */
export function ttlPorData(ymd: string, ttlHoje: number, ttlPassado: number): number {
  return ymd < hojeSp() ? ttlPassado : ttlHoje;
}

export const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Maiúsculas sem acento, para comparar nomes vindos das fontes. */
export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}
