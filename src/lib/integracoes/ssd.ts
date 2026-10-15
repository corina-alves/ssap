import { z } from 'zod';
import { lembrar, TTL } from './cache';
import { comoDado, hojeSp, RE_DATA, ttlPorData, type Dado } from './comum';
import { arred, buscarJson, numero } from './http';

/**
 * SSD da SP Águas — séries temporais.
 *   GET https://sssp.spaguas.sp.gov.br/ssdsp/api-private/TimeSeries/{id}/Data/{de}/{ate}
 * Série 331 = transposição UHE Jaguari → Atibainha (Paraíba do Sul → Cantareira), m³/s diária.
 */

const BASE = 'https://sssp.spaguas.sp.gov.br/ssdsp/api-private/';
export const FONTE = 'SP Águas — SSD';
export const SERIE_TRANSPOSICAO = 331;

/**
 * Limite anual da transposição (hm³). Parâmetro regulatório: atualizar quando
 * sair novo comunicado da ANA/SP Águas (valor da referência).
 */
export const LIMITES_TRANSPOSICAO: Record<number, { vigente: number; anterior: number | null; doc: string }> = {
  2026: { vigente: 268.28, anterior: 162.0, doc: 'Comunicado Conjunto Nº 3/2026/DP-SEI' },
};

export type Ponto = { data: string; valor: number };
export type Serie = { id: number; nome: string | null; unidade: string | null; pontos: Ponto[] };

const esquema = z.looseObject({
  id: z.number().optional(),
  space: z.looseObject({ fullName: z.string().nullable().optional() }).nullable().optional(),
  variable: z.looseObject({ unit: z.looseObject({ symbol: z.string().nullable().optional() }).nullable().optional() }).nullable().optional(),
  dataCollection: z.array(z.looseObject({ dateTime: z.string().optional(), value: z.unknown() })).nullable().optional(),
});

/** Pontos (data, valor) da série no intervalo, sem nulos. */
export async function serie(id: number, de: string, ate: string): Promise<Dado<Serie>> {
  if (!Number.isInteger(id) || id <= 0 || !RE_DATA.test(de) || !RE_DATA.test(ate)) throw new Error('Parâmetros de série inválidos.');
  const l = await lembrar('ssd', `serie:${id}:${de}:${ate}`, ttlPorData(ate, TTL.hora, TTL.historico), async () => {
    const r = esquema.safeParse(await buscarJson(`${BASE}TimeSeries/${id}/Data/${de}/${ate}`));
    if (!r.success) throw new Error('formato inesperado do SSD');
    const pontos: Ponto[] = [];
    for (const p of r.data.dataCollection ?? []) {
      const v = numero(p.value);
      const d = (p.dateTime ?? '').slice(0, 10);
      if (v !== null && RE_DATA.test(d)) pontos.push({ data: d, valor: v });
    }
    return { id, nome: r.data.space?.fullName ?? null, unidade: r.data.variable?.unit?.symbol ?? null, pontos };
  });
  return comoDado(FONTE, l);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export type TransposicaoAno = {
  ano: number;
  atualizadoEm: string | null;
  meses: { mes: number; nome: string; mediaM3s: number; volumeHm3: number }[];
  mediaAnoM3s: number | null;
  acumuladoHm3: number;
  limite: { vigente: number; anterior: number | null; doc: string; restanteHm3: number; dentro: boolean } | null;
};

/** Operação da transposição no ano: média e volume mês a mês, acumulado e limite anual. */
export async function transposicaoAno(ate = hojeSp()): Promise<Dado<TransposicaoAno>> {
  const ano = Number(ate.slice(0, 4));
  const s = await serie(SERIE_TRANSPOSICAO, `${ano}-01-01`, ate);
  if (!s.ok) return s;

  const soma = Array<number>(12).fill(0);
  const dias = Array<number>(12).fill(0);
  let atualizadoEm: string | null = null;
  for (const p of s.dados.pontos) {
    const m = Number(p.data.slice(5, 7)) - 1;
    soma[m]! += p.valor;
    dias[m]! += 1;
    if (!atualizadoEm || p.data > atualizadoEm) atualizadoEm = p.data;
  }
  const meses = soma.flatMap((sm, m) =>
    dias[m] ? [{ mes: m + 1, nome: MESES[m]!, mediaM3s: arred(sm / dias[m]!, 2), volumeHm3: arred((sm * 86_400) / 1e6, 2) }] : [],
  );
  const totalDias = dias.reduce((a, b) => a + b, 0);
  const acumulado = (soma.reduce((a, b) => a + b, 0) * 86_400) / 1e6; // m³/s·dia → hm³
  const cfg = LIMITES_TRANSPOSICAO[ano];
  return {
    ...s,
    dados: {
      ano,
      atualizadoEm,
      meses,
      mediaAnoM3s: totalDias ? arred(soma.reduce((a, b) => a + b, 0) / totalDias, 2) : null,
      acumuladoHm3: arred(acumulado, 2),
      limite: cfg
        ? { ...cfg, restanteHm3: arred(Math.max(0, cfg.vigente - acumulado), 2), dentro: acumulado <= cfg.vigente }
        : null,
    },
  };
}

// ---------------------------------------------------------------- catálogo

export const FREQ_DIARIA = 1;
export const FREQ_MENSAL = 2;

export type SerieCatalogo = {
  id: number;
  spaceId: number;
  space: string;
  spaceTipo: string;
  variavel: string;
  unidade: string;
  frequencia: number;
  inicio: string | null;
};

const itemCatalogo = z.looseObject({
  id: z.number(),
  space: z.looseObject({
    id: z.number(),
    shortName: z.string().nullable().optional(),
    fullName: z.string().nullable().optional(),
    spaceType: z.string().nullable().optional(),
  }),
  variable: z.looseObject({ name: z.string(), unit: z.looseObject({ symbol: z.string().nullable().optional() }).nullable().optional() }),
  frequencyPeriod: z.number().nullable().optional(),
  startAt: z.string().nullable().optional(),
});

/** Catálogo completo de séries do SSD (sistemas, reservatórios, ETAs, postos...). Guardado por 1 dia. */
export async function catalogo(): Promise<Dado<SerieCatalogo[]>> {
  const l = await lembrar('ssd', 'catalogo', 86_400, async () => {
    const bruto = await buscarJson(`${BASE}TimeSeries`, { timeoutMs: 20_000 });
    const saida: SerieCatalogo[] = [];
    for (const s of Array.isArray(bruto) ? bruto : [bruto]) {
      const r = itemCatalogo.safeParse(s);
      if (!r.success) continue; // item incompleto: fica de fora, como no PHP
      const d = r.data;
      saida.push({
        id: d.id,
        spaceId: d.space.id,
        space: d.space.shortName ?? d.space.fullName ?? '',
        spaceTipo: d.space.spaceType ?? '',
        variavel: d.variable.name,
        unidade: d.variable.unit?.symbol ?? '',
        frequencia: d.frequencyPeriod ?? FREQ_DIARIA,
        inicio: d.startAt ? d.startAt.slice(0, 10) : null,
      });
    }
    return saida.length ? saida : null;
  });
  return comoDado(FONTE, l);
}

/** Id da série de um local (space) por variável, unidade e frequência; null se o SSD não tem. */
export async function idSerieDoSpace(spaceId: number, variavel: string, unidade: string, frequencia: number): Promise<number | null> {
  const c = await catalogo();
  if (!c.ok) throw new Error(c.mensagem);
  return c.dados.find((s) => s.spaceId === spaceId && s.variavel === variavel && s.unidade === unidade && s.frequencia === frequencia)?.id ?? null;
}
