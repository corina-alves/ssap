import { z } from 'zod';
import { lembrar, TTL } from './cache';
import { comoDado, hojeSp, somarDias, ttlPorData, type Dado } from './comum';
import { buscarJson, numero } from './http';

/**
 * SABESP — Mananciais: resumo diário dos Sistemas Produtores da RMSP.
 *   GET https://mananciais.sabesp.com.br/api/v4/sistemas/dados/resumo-diario/{AAAA-MM-DD}
 * O dia corrente costuma chegar vazio até a SABESP publicar; por isso o recuo.
 */

const BASE = 'https://mananciais.sabesp.com.br/api/v4/sistemas/dados/resumo-diario/';
export const FONTE = 'SABESP — Mananciais';

/** id → nome (74 = agregador e 71 = não identificado: ignorados, como na referência). */
export const SISTEMAS: Record<number, string> = {
  64: 'Cantareira',
  65: 'Alto Tietê',
  66: 'Guarapiranga',
  67: 'Cotia',
  68: 'Rio Grande',
  69: 'Rio Claro',
  72: 'São Lourenço',
  75: 'SIM',
};
export const ID_CANTAREIRA = 64;
export const ID_SIM = 75;

export type SistemaSabesp = {
  id: number;
  nome: string;
  data: string;
  volumePct: number | null;
  volumeHm3: number | null;
  variacaoVolume: number | null;
  chuvaDia: number | null;
  chuvaMes: number | null;
  chuvaMediaHistorica: number | null;
  vazaoNatural: number | null;
  vazaoNaturalMes: number | null;
  vazaoNaturalMediaHistorica: number | null;
  vazaoProduzida: number | null;
  vazaoCaptada: number | null;
  vazaoJusante: number | null;
  vazaoAfluente: number | null;
};

const esquema = z.object({
  data: z.array(z.looseObject({ idSistema: z.number(), date: z.string().optional() })).nullable().optional(),
});

function normalizarSistemas(json: unknown, ymd: string): SistemaSabesp[] | null {
  const r = esquema.safeParse(json);
  if (!r.success) throw new Error('formato inesperado da SABESP');
  const lista = r.data.data ?? [];
  if (!lista.length) return null; // dia ainda não publicado
  return lista
    .filter((s) => SISTEMAS[s.idSistema])
    .map((s) => {
      const n = (k: string) => numero((s as Record<string, unknown>)[k]);
      return {
        id: s.idSistema,
        nome: SISTEMAS[s.idSistema]!,
        data: (s.date ?? ymd).slice(0, 10),
        volumePct: n('volumeUtilArmazenadoPorcentagem'),
        volumeHm3: n('volumeUtilArmazenadoHm3'),
        variacaoVolume: n('variacaoVolumeUtil'),
        chuvaDia: n('chuva'),
        chuvaMes: n('chuvaAcumuladaNoMes'),
        chuvaMediaHistorica: n('chuvaMediaHistorica'),
        vazaoNatural: n('vazaoNatural'),
        vazaoNaturalMes: n('vazaoNaturalNoMes'),
        vazaoNaturalMediaHistorica: n('vazaoNaturalMediaHistorica'),
        vazaoProduzida: n('vazaoProduzida'),
        vazaoCaptada: n('vazaoCaptada'),
        vazaoJusante: n('vazaoJusante'),
        vazaoAfluente: n('vazaoAfluente'),
      };
    });
}

/** Resumo de um dia. null = dia sem dados publicados (ou fonte fora e sem reserva). */
export async function resumoDiario(ymd: string) {
  return lembrar(
    'sabesp',
    `resumo:${ymd}`,
    ttlPorData(ymd, TTL.operacional, TTL.historico),
    async () => normalizarSistemas(await buscarJson(BASE + encodeURIComponent(ymd)), ymd),
    // Dia sem publicação: tenta de novo em 10 min (a SABESP publica ao longo do dia).
    { esperaFalhaSeg: 10 * 60 },
  );
}

/**
 * A SABESP publica o dia aos poucos (de manhã vêm só alguns sistemas, sem
 * volume). O dia só conta quando ao menos 5 dos 7 sistemas têm o volume.
 */
export function diaCompleto(sistemas: SistemaSabesp[]): boolean {
  return sistemas.filter((s) => s.id !== ID_SIM && s.volumePct !== null).length >= 5;
}

/**
 * Dia mais recente com dados completos, recuando até `maxDias`. As datas candidatas são
 * buscadas em paralelo (a SABESP pode estar lenta).
 */
export async function resumoRecente(ymd = hojeSp(), maxDias = 5): Promise<Dado<{ data: string; sistemas: SistemaSabesp[] }>> {
  const datas = Array.from({ length: maxDias + 1 }, (_, i) => somarDias(ymd, -i));
  const resultados = await Promise.all(datas.map((d) => resumoDiario(d)));
  const i = resultados.findIndex((r) => r && diaCompleto(r.valor));
  const r = i >= 0 ? resultados[i]! : null;
  return comoDado(FONTE, r && { ...r, valor: { data: datas[i]!, sistemas: r.valor } });
}

/** Resumos de vários dias (séries: curva de contingência, evolução). Busca em lotes de 10. */
export async function resumosPeriodo(datas: string[]): Promise<Map<string, SistemaSabesp[]>> {
  const saida = new Map<string, SistemaSabesp[]>();
  for (let i = 0; i < datas.length; i += 10) {
    const lote = datas.slice(i, i + 10);
    const rs = await Promise.all(lote.map((d) => resumoDiario(d)));
    rs.forEach((r, j) => r && saida.set(lote[j]!, r.valor));
  }
  return saida;
}
