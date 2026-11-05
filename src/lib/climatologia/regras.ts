/**
 * Regras do Painel de Climatologia por UGRHI — puras (sem banco nem rede), para
 * a importação, o cálculo e os testes usarem as mesmas.
 *
 *  - leitura do acervo histórico do SIBH (um vetor de chuva diária por posto e mês);
 *  - qualidade de cada mês de cada posto (critérios padrão e estrito);
 *  - estatísticas climatológicas de uma série regional.
 *
 * Referências dos critérios: Guide to Climatological Practices (OMM, 2011) e
 * WMO-No. 1203 (normais climatológicas), conforme a metodologia publicada no painel.
 */

export type Criterio = 'padrao' | 'estrito';
export type Metodo = 'thiessen' | 'aritmetica';
export const CRITERIOS: Criterio[] = ['padrao', 'estrito'];
export const METODOS: Metodo[] = ['thiessen', 'aritmetica'];

/** Período de referência da normal climatológica padrão da OMM. */
export const PERIODO_PADRAO: [number, number] = [1991, 2020];
/** A normal climatológica é de um período de 30 anos (OMM); período mais curto (ex.: 2010 até hoje) só dá média histórica. */
export const ANOS_NORMAL = 30;
/** Fração mínima dos anos do período com o mês válido para a média ser chamada de normal (OMM: 80%, 24 de 30). */
export const FRACAO_NORMAL = 0.8;
/** Abaixo disto não há média: com poucos anos a média mensal de chuva não representa o clima. */
export const MIN_ANOS_MEDIA = 10;
/**
 * Critério padrão: dias sem leitura aceitos no mês quando cada falha termina numa
 * leitura dentro do próprio mês — a chuva dos dias sem leitura foi somada na
 * leitura seguinte (acúmulo, comum no pluviômetro convencional). Fica abaixo dos
 * 11 dias a partir dos quais a OMM descarta um mês.
 */
export const MAX_DIAS_ACUMULO = 10;

export const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Valor diário do acervo: "12.3" → 12,3; "-", vazio, texto ou negativo → null (sem leitura, nunca zero). */
export function valorDia(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v !== 'string' || !/^\s*\d+(\.\d+)?\s*$/.test(v)) return null;
  return Number(v);
}

/**
 * Linha do acervo → um valor por dia do mês. O acervo costuma mandar 31
 * posições: as que passam do fim do mês são descartadas, as que faltam viram
 * null. Alguns postos vêm com um valor a menos que os dias do mês (n − 1): pela
 * comparação com os postos vizinhos, são os dias 2 a n — o dia 1 não está no
 * acervo (`semDia1`) e a chuva dele não foi somada a outra leitura.
 */
export function diasDoMes(ano: number, mes: number, valores: readonly unknown[]): { dias: (number | null)[]; semDia1: boolean } {
  const n = diasNoMes(ano, mes);
  const semDia1 = valores.length === n - 1;
  return { dias: Array.from({ length: n }, (_, i) => (semDia1 ? (i === 0 ? null : valorDia(valores[i - 1])) : valorDia(valores[i]))), semDia1 };
}

export type ResumoMes = { total: number | null; diasFaltando: number; maiorFalta: number; faltaNoFim: boolean };

/** Total (soma dos dias com leitura) e indicadores de falta do mês de um posto. */
export function resumir(dias: readonly (number | null)[]): ResumoMes {
  let total = 0;
  let lidos = 0;
  let faltando = 0;
  let seguida = 0;
  let maior = 0;
  for (const d of dias) {
    if (d === null) {
      faltando++;
      maior = Math.max(maior, ++seguida);
    } else {
      seguida = 0;
      lidos++;
      total += d;
    }
  }
  return { total: lidos ? Math.round(total * 10) / 10 : null, diasFaltando: faltando, maiorFalta: maior, faltaNoFim: dias.length > 0 && dias[dias.length - 1] === null };
}

/** O mesmo mês veio mais de uma vez da fonte: iguais valem como um; diferentes ficam marcados como conflito (o mês não entra no cálculo). */
export function juntarRepetidos(a: (number | null)[], b: (number | null)[]): { dias: (number | null)[]; conflito: boolean } {
  const iguais = a.length === b.length && a.every((v, i) => v === b[i]);
  return { dias: a, conflito: !iguais };
}

export type MesParaValidar = { dias: readonly (number | null)[]; conflito: boolean; semDia1?: boolean };

/**
 * O mês do posto serve para somar chuva?
 *  - estrito: todos os dias com leitura;
 *  - padrão: também com falhas de até MAX_DIAS_ACUMULO dias, desde que nenhuma
 *    chegue ao fim do mês (cada falha termina numa leitura que acumula a chuva dela).
 * Nos dois: inválido se a fonte trouxe o mês em conflito, se não há leitura, se
 * o acervo veio sem o dia 1 (a chuva dele não está em leitura nenhuma), ou se o
 * mês anterior terminou sem leitura (a primeira leitura deste mês pode carregar
 * chuva do mês anterior).
 */
export function validade(m: MesParaValidar, anteriorTerminouSemLeitura: boolean): Record<Criterio, boolean> {
  const r = resumir(m.dias);
  if (m.conflito || m.semDia1 || r.total === null || anteriorTerminouSemLeitura) return { padrao: false, estrito: false };
  return { estrito: r.diasFaltando === 0, padrao: r.diasFaltando === 0 || (!r.faltaNoFim && r.diasFaltando <= MAX_DIAS_ACUMULO) };
}

// ---------------------------------------------------------------------------
// Estatísticas climatológicas
// ---------------------------------------------------------------------------

export type TipoMedia = 'normal' | 'media_historica' | 'insuficiente';

export type Estatistica = {
  tipo: TipoMedia;
  media: number | null;
  anosValidos: number;
  anos: number[];
  mediana: number | null;
  desvio: number | null;
  minimo: number | null;
  anoMinimo: number | null;
  maximo: number | null;
  anoMaximo: number | null;
};

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Tipo da média pelo número de anos válidos no período (OMM: normal num período de 30 anos, com 80% dos anos). */
export function tipoMedia(anosValidos: number, periodo: readonly [number, number]): TipoMedia {
  const n = periodo[1] - periodo[0] + 1;
  if (n >= ANOS_NORMAL && anosValidos >= Math.ceil(FRACAO_NORMAL * n)) return 'normal';
  return anosValidos >= MIN_ANOS_MEDIA ? 'media_historica' : 'insuficiente';
}

/** Média, mediana, desvio-padrão amostral e extremos de valores anuais. */
export function estatistica(pontos: { ano: number; valor: number }[], periodo: readonly [number, number]): Estatistica {
  const v = [...pontos].sort((a, b) => a.ano - b.ano);
  const tipo = tipoMedia(v.length, periodo);
  const vazio: Estatistica = { tipo, media: null, anosValidos: v.length, anos: v.map((p) => p.ano), mediana: null, desvio: null, minimo: null, anoMinimo: null, maximo: null, anoMaximo: null };
  if (!v.length || tipo === 'insuficiente') return vazio;
  const valores = v.map((p) => p.valor);
  const media = valores.reduce((s, x) => s + x, 0) / v.length;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  const mediana = ord.length % 2 ? ord[meio]! : (ord[meio - 1]! + ord[meio]!) / 2;
  const desvio = v.length > 1 ? Math.sqrt(valores.reduce((s, x) => s + (x - media) ** 2, 0) / (v.length - 1)) : null;
  const min = v.reduce((a, b) => (b.valor < a.valor ? b : a));
  const max = v.reduce((a, b) => (b.valor > a.valor ? b : a));
  return { ...vazio, media: r1(media), mediana: r1(mediana), desvio: desvio === null ? null : r1(desvio), minimo: r1(min.valor), anoMinimo: min.ano, maximo: r1(max.valor), anoMaximo: max.ano };
}

export type PontoSerie = { ano: number; mes: number; chuva: number | null; valido: boolean };

/**
 * Climatologia de uma série regional no período: índice 1–12 = mês; 0 = ano.
 * Mês: média dos anos com o mês válido. Ano: soma das 12 médias mensais (só
 * quando os 12 meses têm média), "normal" se os 12 forem normais; mínimo,
 * máximo, mediana e desvio vêm dos totais dos anos com os 12 meses válidos.
 */
export function climatologia(serie: readonly PontoSerie[], periodo: readonly [number, number]): Estatistica[] {
  const dentro = serie.filter((p) => p.ano >= periodo[0] && p.ano <= periodo[1] && p.valido && p.chuva !== null);
  const meses = Array.from({ length: 12 }, (_, i) => estatistica(dentro.filter((p) => p.mes === i + 1).map((p) => ({ ano: p.ano, valor: p.chuva! })), periodo));

  const porAno = new Map<number, number[]>();
  for (const p of dentro) porAno.set(p.ano, [...(porAno.get(p.ano) ?? []), p.chuva!]);
  const anosCompletos = [...porAno].filter(([, v]) => v.length === 12).map(([ano, v]) => ({ ano, valor: v.reduce((s, x) => s + x, 0) }));
  const anual = estatistica(anosCompletos, periodo);
  const todos = meses.every((m) => m.media !== null);
  const anualTipo: TipoMedia = !todos ? 'insuficiente' : meses.every((m) => m.tipo === 'normal') ? 'normal' : 'media_historica';
  const anualMedia = todos ? r1(meses.reduce((s, m) => s + m.media!, 0)) : null;
  return [{ ...anual, tipo: anualTipo, media: anualMedia }, ...meses];
}
