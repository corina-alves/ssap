import 'server-only';
import { query } from '../db';
import { anoAtual } from './selecao';

/**
 * Aba "Chuva do mês": cada UGRHI e cada município com o acumulado do mês, a chuva
 * máxima e a média histórica do mesmo mês. Lê só o que já está no banco.
 *
 *  - acumulado do mês: soma dos totais dos postos da área com o mês válido
 *    (critério padrão) ÷ número desses postos;
 *  - chuva máxima: o maior total entre esses postos;
 *  - média histórica: para cada ano de INICIO_HISTORICO até hoje, a mesma conta
 *    do acumulado; a média é a desses anos. Usa os dados que houver — acervo
 *    (até 2023) e telemetria (depois) —, sem mínimo de anos nem de cobertura,
 *    sem o mês em andamento (ainda incompleto) e sem o próprio mês avaliado (não
 *    se compara um mês com uma média que o inclui).
 */

export const INICIO_HISTORICO = 2015;
export type Escala = 'ugrhi' | 'municipio';
const AREA: Record<Escala, string> = { ugrhi: 'p.ugrhi', municipio: 'p.cod_ibge' };

export type LinhaMes = {
  codigo: number;
  acumulado: number | null;
  maxima: number | null;
  postoMaxima: { prefixo: string; nome: string | null; municipio: string | null } | null;
  postos: number;
  /** Mês em andamento: acumulado do dia 1 até este dia. */
  ateDia: number | null;
  historica: number | null;
  anos: number[];
  /** Acumulado ÷ média histórica × 100. */
  percentual: number | null;
};

export async function chuvaDoMes(escala: Escala, ano: number, mes: number): Promise<Map<number, LinhaMes>> {
  const area = AREA[escala];
  const [observado, historica] = await Promise.all([
    query<{ codigo: number; maxima: string; prefixo: string; nome: string | null; municipio: string | null; acumulado: string; postos: number; ate_dia: number | null }>(
      `SELECT DISTINCT ON (${area}) ${area} AS codigo, c.total AS maxima, p.prefixo, p.nome, p.municipio,
              round(avg(c.total) OVER w, 1) AS acumulado, (count(*) OVER w)::int AS postos, max(c.ate_dia) OVER w AS ate_dia
         FROM clima_chuva_mes c JOIN clima_postos p ON p.id = c.posto_id
        WHERE c.ano = $1 AND c.mes = $2 AND c.valido_padrao AND c.total IS NOT NULL AND ${area} IS NOT NULL
       WINDOW w AS (PARTITION BY ${area})
        ORDER BY ${area}, c.total DESC, p.prefixo`,
      [ano, mes],
    ),
    query<{ codigo: number; media: string; anos: number[] }>(
      `SELECT codigo, round(avg(chuva), 1) AS media, array_agg(ano ORDER BY ano) AS anos
         FROM (SELECT ${area} AS codigo, c.ano, avg(c.total) AS chuva
                 FROM clima_chuva_mes c JOIN clima_postos p ON p.id = c.posto_id
                WHERE c.mes = $1 AND c.ano BETWEEN $2 AND $3 AND c.ano <> $4 AND c.valido_padrao AND c.total IS NOT NULL AND c.ate_dia IS NULL AND ${area} IS NOT NULL
                GROUP BY 1, 2) anual
        GROUP BY codigo`,
      [mes, INICIO_HISTORICO, anoAtual(), ano],
    ),
  ]);
  const r = new Map<number, LinhaMes>();
  const linha = (codigo: number): LinhaMes => {
    let l = r.get(codigo);
    if (!l) r.set(codigo, (l = { codigo, acumulado: null, maxima: null, postoMaxima: null, postos: 0, ateDia: null, historica: null, anos: [], percentual: null }));
    return l;
  };
  for (const o of observado) {
    Object.assign(linha(o.codigo), {
      acumulado: Number(o.acumulado),
      maxima: Number(o.maxima),
      postoMaxima: { prefixo: o.prefixo, nome: o.nome, municipio: o.municipio },
      postos: o.postos,
      ateDia: o.ate_dia,
    });
  }
  for (const h of historica) Object.assign(linha(h.codigo), { historica: Number(h.media), anos: h.anos });
  for (const l of r.values()) {
    if (l.acumulado !== null && l.historica) l.percentual = Math.round((1000 * l.acumulado) / l.historica) / 10;
  }
  return r;
}

/** Mês mais recente com algum posto válido, e os anos (desde INICIO_HISTORICO) que têm dado. */
export async function mesesDisponiveis(): Promise<{ recente: { ano: number; mes: number } | null; anos: number[] }> {
  const [recente, anos] = await Promise.all([
    query<{ ano: number; mes: number }>('SELECT ano, mes FROM clima_chuva_mes WHERE valido_padrao ORDER BY ano DESC, mes DESC LIMIT 1'),
    query<{ ano: number }>('SELECT DISTINCT ano FROM clima_chuva_mes WHERE ano >= $1 AND valido_padrao ORDER BY ano DESC', [INICIO_HISTORICO]),
  ]);
  return { recente: recente[0] ?? null, anos: anos.map((a) => a.ano) };
}
