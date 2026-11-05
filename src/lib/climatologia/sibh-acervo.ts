import { z } from 'zod';
import { buscarJson } from '../integracoes/http';

/**
 * Acervo histórico de chuva do SIBH — o mesmo da página pública "Dados
 * Históricos" (https://apps.spaguas.sp.gov.br/sibh/historical_measurements),
 * verificado em 03/11/2026:
 *
 *   GET /sibh/api/v1/historical_measurements?type=2&start=N&length=50&stations_prefix_ids[]=ID…
 *     → { json: { qtd_total, data: [{ station_prefix, year, month, values: ["12.3", "-", …] }] } }
 *
 *  - no máximo 50 linhas (posto × mês) por consulta, seja qual for o `length`;
 *  - `stations_prefix_ids[]` filtra pelo id exato e aceita vários postos;
 *  - não há filtro por data: as linhas vêm na ordem em que foram gravadas (há
 *    blocos acrescentados depois), então cada posto é lido inteiro;
 *  - com vários postos na mesma consulta a paginação não é estável: entre uma
 *    página e outra, linhas se repetem e outras somem, e o total ainda bate
 *    (verificado em 03/11/2026). Por isso a importação lê um posto por consulta
 *    e confere se os `id` distintos das linhas somam `qtd_total`;
 *  - `values` tem 31 posições ("-" = sem leitura); alguns postos vêm com um
 *    valor a menos que os dias do mês (ver diasDoMes em regras.ts).
 *
 * Só é usado pela importação (scripts/clima-importar.ts), nunca pelo painel.
 */

const SIBH = 'https://apps.spaguas.sp.gov.br/sibh/api/';
export const LINHAS_POR_PAGINA = 50;

const texto = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const numeroOuNull = (v: unknown) => (texto(v) === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const dataOuNull = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(texto(v)) ? texto(v).slice(0, 10) : null);

export type PostoAcervo = {
  id: number;
  prefixo: string;
  nome: string | null;
  municipio: string | null;
  dono: string | null;
  ugrhiCadastro: number | null;
  lat: number;
  lon: number;
  inicioOperacao: string | null;
  fimOperacao: string | null;
  situacao: string | null;
};

const esquemaPostoV1 = z.looseObject({
  id: z.union([z.number(), z.string()]),
  prefix: z.string(),
  operation_status: z.string().nullable().optional(),
  date_start_operation: z.string().nullable().optional(),
  date_end_operation: z.string().nullable().optional(),
  station: z
    .looseObject({ name: z.string().nullable().optional(), latitude: z.unknown(), longitude: z.unknown(), city: z.looseObject({ name: z.string().nullable().optional() }).nullable().optional() })
    .nullable()
    .optional(),
  station_owner: z.looseObject({ name: z.string().nullable().optional() }).nullable().optional(),
});

/** Postos pluviométricos com série no acervo (cadastro v1), com o código oficial da UGRHI do cadastro v2. Duas consultas. */
export async function postosComAcervo(): Promise<PostoAcervo[]> {
  const v1 = z.array(esquemaPostoV1).parse(await buscarJson(`${SIBH}v1/station_prefixes?pluviometricas=true&with_historical_measurements=true`, { timeoutMs: 90_000 }));
  const v2 = z
    .array(z.looseObject({ id: z.union([z.number(), z.string()]), ugrhi_cod: z.unknown(), latitude: z.unknown(), longitude: z.unknown() }))
    .parse(await buscarJson(`${SIBH}v2/stations?serializer=complete&station_type_id=2`, { timeoutMs: 90_000 }));
  const cadastro = new Map(v2.map((e) => [String(e.id), e]));
  const postos: PostoAcervo[] = [];
  for (const e of v1) {
    const c = cadastro.get(String(e.id));
    const lat = numeroOuNull(e.station?.latitude) ?? numeroOuNull(c?.latitude);
    const lon = numeroOuNull(e.station?.longitude) ?? numeroOuNull(c?.longitude);
    if (lat === null || lon === null) continue; // sem coordenada não há como situar o posto
    const ugrhi = numeroOuNull(c?.ugrhi_cod);
    postos.push({
      id: Number(e.id),
      prefixo: e.prefix.trim(),
      nome: texto(e.station?.name) || null,
      municipio: texto(e.station?.city?.name) || null,
      dono: texto(e.station_owner?.name) || null,
      ugrhiCadastro: ugrhi !== null && ugrhi >= 1 && ugrhi <= 22 ? ugrhi : null,
      lat,
      lon,
      inicioOperacao: dataOuNull(e.date_start_operation),
      fimOperacao: dataOuNull(e.date_end_operation),
      situacao: texto(e.operation_status) || null,
    });
  }
  return postos;
}

/** Uma linha do acervo; `id` é o da linha no SIBH (único), usado para conferir se a leitura veio completa. */
export type LinhaAcervo = { id: number; prefixo: string; ano: number; mes: number; valores: unknown[] };

const esquemaPagina = z.object({
  json: z.object({
    qtd_total: z.number(),
    data: z.array(z.looseObject({ id: z.number(), station_prefix: z.string(), year: z.number(), month: z.number(), values: z.array(z.unknown()) })),
  }),
});

/** Uma página (até 50 linhas) do acervo dos postos `ids`, a partir da linha `inicio`. */
export async function paginaAcervo(ids: readonly number[], inicio: number, timeoutMs = 60_000): Promise<{ total: number; linhas: LinhaAcervo[] }> {
  const filtro = ids.map((id) => `stations_prefix_ids%5B%5D=${id}`).join('&');
  const r = esquemaPagina.parse(await buscarJson(`${SIBH}v1/historical_measurements?type=2&start=${inicio}&length=${LINHAS_POR_PAGINA}&${filtro}`, { timeoutMs }));
  return {
    total: r.json.qtd_total,
    linhas: r.json.data.map((l) => ({ id: l.id, prefixo: l.station_prefix.trim(), ano: l.year, mes: l.month, valores: l.values })),
  };
}
