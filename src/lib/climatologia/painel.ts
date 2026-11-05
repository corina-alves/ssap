import 'server-only';
import { query } from '../db';
import { climatologia, PERIODO_PADRAO, type Criterio, type Estatistica, type Metodo, type PontoSerie, type TipoMedia } from './regras';
import { compararLocal, periodoTodoAcervo, type Acumulado, type ComparacaoLocal, type Fonte, type MesLocal } from './selecao';
import { UGRHIS } from '../hidrologia/situacao-rios';

/**
 * Dados do Painel de Climatologia. Só lê o que a importação e o cálculo deixaram
 * prontos no banco (clima_*); nunca consulta o SIBH. A chuva observada pode vir
 * do acervo ou da telemetria (`fonte`); a climatologia vem sempre do acervo.
 */

export type Filtro = { criterio: Criterio; metodo: Metodo; periodo: [number, number]; fonte: Fonte };

type LinhaSerie = { ugrhi: number; ano: number; mes: number; chuva: string | null; valido: boolean; postos: number; cobertura: string; ate_dia: number | null };
/** ateDia: mês em andamento (telemetria), chuva do dia 1 até esse dia. */
export type MesSerie = { ugrhi: number; ano: number; mes: number; chuva: number | null; valido: boolean; postos: number; cobertura: number; ateDia: number | null };

const n = (v: string | null) => (v === null ? null : Number(v));
const coluna = (criterio: Criterio) => (criterio === 'estrito' ? 'valido_estrito' : 'valido_padrao');

/** Série regional (todas as UGRHIs, todos os anos) no critério, método e fonte escolhidos. */
export async function serieRegional(f: Pick<Filtro, 'criterio' | 'metodo' | 'fonte'>): Promise<MesSerie[]> {
  const linhas = await query<LinhaSerie>(
    'SELECT ugrhi, ano, mes, chuva, valido, postos, cobertura, ate_dia FROM clima_serie_ugrhi WHERE criterio = $1 AND metodo = $2 AND fonte = $3 ORDER BY ugrhi, ano, mes',
    [f.criterio, f.metodo, f.fonte],
  );
  return linhas.map(({ ate_dia, ...l }) => ({ ...l, chuva: n(l.chuva), cobertura: Number(l.cobertura), ateDia: ate_dia }));
}

/** Anos com algum mês de UGRHI válido, por fonte (para a fonte automática e a lista de anos). */
export async function anosPorFonte(): Promise<Record<Fonte, number[]>> {
  const linhas = await query<{ fonte: Fonte; ano: number }>(
    "SELECT fonte, ano FROM clima_serie_ugrhi WHERE valido AND criterio = 'padrao' AND metodo = 'thiessen' GROUP BY fonte, ano ORDER BY ano",
  );
  return { acervo: linhas.filter((l) => l.fonte === 'acervo').map((l) => l.ano), telemetria: linhas.filter((l) => l.fonte === 'telemetria').map((l) => l.ano) };
}

/**
 * Climatologia de cada UGRHI no período: índice 0 = ano, 1–12 = meses. O período
 * padrão (1991–2020) já vem calculado (clima_normais); outro período é calculado
 * na hora a partir da série regional do ACERVO (`serieAcervo`), já pronta no banco.
 */
export async function climatologias(f: Omit<Filtro, 'fonte'>, serieAcervo: MesSerie[]): Promise<Map<number, Estatistica[]>> {
  const r = new Map<number, Estatistica[]>();
  if (f.periodo[0] === PERIODO_PADRAO[0] && f.periodo[1] === PERIODO_PADRAO[1]) {
    const linhas = await query<{ ugrhi: number; mes: number; tipo: Estatistica['tipo']; media: string | null; anos_validos: number; anos: number[]; mediana: string | null; desvio: string | null; minimo: string | null; ano_minimo: number | null; maximo: string | null; ano_maximo: number | null }>(
      'SELECT * FROM clima_normais WHERE periodo_ini = $1 AND periodo_fim = $2 AND criterio = $3 AND metodo = $4 ORDER BY ugrhi, mes',
      [...f.periodo, f.criterio, f.metodo],
    );
    for (const l of linhas) {
      const lista = r.get(l.ugrhi) ?? [];
      lista[l.mes] = { tipo: l.tipo, media: n(l.media), anosValidos: l.anos_validos, anos: l.anos, mediana: n(l.mediana), desvio: n(l.desvio), minimo: n(l.minimo), anoMinimo: l.ano_minimo, maximo: n(l.maximo), anoMaximo: l.ano_maximo };
      r.set(l.ugrhi, lista);
    }
    if (r.size) return r;
  }
  const porUgrhi = new Map<number, PontoSerie[]>();
  for (const s of serieAcervo) porUgrhi.set(s.ugrhi, [...(porUgrhi.get(s.ugrhi) ?? []), s]);
  for (const [u, pontos] of porUgrhi) r.set(u, climatologia(pontos, f.periodo));
  return r;
}

export type PostoUsado = { id: number; prefixo: string; nome: string | null; municipio: string | null; ugrhi: number | null; dono: string | null; peso: number | null; chuva: number | null };

/** Postos usados na média de uma UGRHI num mês, com o peso de cada um (Thiessen) e a chuva do posto. */
export async function postosDoMes(f: Pick<Filtro, 'criterio' | 'metodo' | 'fonte'>, ugrhi: number, ano: number, mes: number): Promise<PostoUsado[]> {
  if (f.metodo === 'thiessen') {
    return query<PostoUsado>(
      `SELECT p.id, p.prefixo, p.nome, p.municipio, p.ugrhi, p.dono, (w.value)::float8 AS peso, c.total::float8 AS chuva
         FROM clima_serie_ugrhi s
         CROSS JOIN LATERAL jsonb_each_text(s.pesos) w
         JOIN clima_postos p ON p.id = w.key::int
         LEFT JOIN clima_chuva_mes c ON c.posto_id = p.id AND c.ano = s.ano AND c.mes = s.mes AND c.fonte = s.fonte
        WHERE s.ugrhi = $1 AND s.ano = $2 AND s.mes = $3 AND s.criterio = $4 AND s.metodo = 'thiessen' AND s.fonte = $5
        ORDER BY (w.value)::float8 DESC`,
      [ugrhi, ano, mes, f.criterio, f.fonte],
    );
  }
  return query<PostoUsado>(
    `SELECT p.id, p.prefixo, p.nome, p.municipio, p.ugrhi, p.dono, NULL::float8 AS peso, c.total::float8 AS chuva
       FROM clima_chuva_mes c JOIN clima_postos p ON p.id = c.posto_id
      WHERE p.ugrhi = $1 AND c.ano = $2 AND c.mes = $3 AND c.fonte = $4 AND c.${coluna(f.criterio)}
      ORDER BY p.prefixo`,
    [ugrhi, ano, mes, f.fonte],
  );
}

export type ResumoUgrhi = {
  ugrhi: number;
  /** Maior acumulado do mês entre os postos da UGRHI com o mês válido, e o posto dele. */
  maxima: number | null;
  postoMaxima: { prefixo: string; nome: string | null; municipio: string | null } | null;
  /** Soma dos acumulados desses postos ÷ número de postos. */
  media: number | null;
  postos: number;
  /** Mês em andamento (telemetria): acumulado do dia 1 até este dia. */
  ateDia: number | null;
  /** Média de cada posto da UGRHI no mês, com todos os anos que ele tem no acervo (mín. 10), somadas ÷ número de postos. */
  historica: number | null;
  postosHistorica: number;
  anosHistorica: [number, number] | null;
};

/**
 * Chuva do mês em todas as UGRHIs no formato do boletim: chuva máxima, média mensal
 * e média histórica mensal. A média histórica não depende do período de referência:
 * vem de todo o acervo, para nenhuma UGRHI ficar sem valor quando há dado.
 */
export async function resumoUgrhis(f: Pick<Filtro, 'criterio' | 'fonte'>, ano: number, mes: number): Promise<ResumoUgrhi[]> {
  const [observado, historica] = await Promise.all([
    query<{ ugrhi: number; maxima: string; prefixo: string; nome: string | null; municipio: string | null; media: string; postos: number; ate_dia: number | null }>(
      `SELECT DISTINCT ON (p.ugrhi) p.ugrhi, c.total AS maxima, p.prefixo, p.nome, p.municipio,
              round(avg(c.total) OVER w, 1) AS media, (count(*) OVER w)::int AS postos, max(c.ate_dia) OVER w AS ate_dia
         FROM clima_chuva_mes c JOIN clima_postos p ON p.id = c.posto_id
        WHERE c.ano = $1 AND c.mes = $2 AND c.fonte = $3 AND c.${coluna(f.criterio)} AND c.total IS NOT NULL AND p.ugrhi IS NOT NULL
       WINDOW w AS (PARTITION BY p.ugrhi)
        ORDER BY p.ugrhi, c.total DESC, p.prefixo`,
      [ano, mes, f.fonte],
    ),
    query<{ ugrhi: number; media: string; postos: number; ini: number; fim: number }>(
      `SELECT p.ugrhi, round(avg(n.media), 1) AS media, count(*)::int AS postos, min(n.anos[1]) AS ini, max(n.anos[cardinality(n.anos)]) AS fim
         FROM clima_normais_local n JOIN clima_postos p ON p.id = n.codigo
        WHERE n.escala = 'posto' AND n.periodo_ini = $1 AND n.mes = $3 AND n.criterio = $4 AND n.media IS NOT NULL AND p.ugrhi IS NOT NULL
          AND n.periodo_fim = (SELECT max(periodo_fim) FROM clima_normais_local WHERE escala = 'posto' AND periodo_ini = $1 AND periodo_fim <= $2)
        GROUP BY p.ugrhi`,
      [...periodoTodoAcervo(), mes, f.criterio],
    ),
  ]);
  return Object.keys(UGRHIS).map(Number).map((u) => {
    const o = observado.find((x) => x.ugrhi === u);
    const h = historica.find((x) => x.ugrhi === u);
    return {
      ugrhi: u,
      maxima: o ? Number(o.maxima) : null,
      postoMaxima: o ? { prefixo: o.prefixo, nome: o.nome, municipio: o.municipio } : null,
      media: o ? Number(o.media) : null,
      postos: o?.postos ?? 0,
      ateDia: o?.ate_dia ?? null,
      historica: h ? Number(h.media) : null,
      postosHistorica: h?.postos ?? 0,
      anosHistorica: h ? [h.ini, h.fim] : null,
    };
  });
}

/** Rede do acervo ao longo do tempo: postos com pelo menos um mês válido em cada ano, por UGRHI. */
export async function redePorAno(criterio: Criterio): Promise<{ ugrhi: number; ano: number; postos: number }[]> {
  return query(
    `SELECT p.ugrhi, c.ano, count(DISTINCT c.posto_id)::int AS postos
       FROM clima_chuva_mes c JOIN clima_postos p ON p.id = c.posto_id
      WHERE c.fonte = 'acervo' AND c.${coluna(criterio)} AND p.ugrhi IS NOT NULL
      GROUP BY p.ugrhi, c.ano ORDER BY p.ugrhi, c.ano`,
  );
}

export type Atualizacao = {
  importacao: Date | null;
  calculo: Date | null;
  postos: number;
  meses: number;
  anos: [number, number] | null;
  telemetria: { coleta: Date | null; dias: number; postos: number; periodo: [string, string] | null };
};

/**
 * Última importação e último cálculo concluídos, o tamanho do acervo e o que já
 * veio da telemetria. Sem varrer clima_chuva_mes (centenas de milhares de linhas
 * com o vetor de dias): o total de meses vem de clima_postos.meses_acervo (igual
 * à contagem, conferido na importação) e os anos, da série regional.
 */
export async function atualizacao(): Promise<Atualizacao> {
  const [r] = await query<{ importacao: Date | null; calculo: Date | null; postos: number; meses: number; ini: number | null; fim: number | null; coleta: Date | null; dias: number; tpostos: number; dia_ini: string | null; dia_fim: string | null }>(
    `SELECT (SELECT max(terminado_em) FROM clima_execucoes WHERE tipo = 'acervo' AND situacao = 'concluida') AS importacao,
            (SELECT max(terminado_em) FROM clima_execucoes WHERE tipo = 'calculo' AND situacao = 'concluida') AS calculo,
            (SELECT count(*)::int FROM clima_postos WHERE importado_em IS NOT NULL) AS postos,
            (SELECT coalesce(sum(meses_acervo), 0)::int FROM clima_postos WHERE importado_em IS NOT NULL) AS meses,
            (SELECT min(ano) FROM clima_serie_ugrhi WHERE fonte = 'acervo') AS ini,
            (SELECT max(ano) FROM clima_serie_ugrhi WHERE fonte = 'acervo') AS fim,
            (SELECT max(consultado_em) FROM clima_telemetria_coleta) AS coleta,
            (SELECT count(*)::int FROM clima_telemetria_coleta) AS dias,
            (SELECT count(DISTINCT posto_id)::int FROM clima_telemetria_dia WHERE dia >= current_date - 31) AS tpostos,
            (SELECT min(dia)::text FROM clima_telemetria_coleta) AS dia_ini,
            (SELECT max(dia)::text FROM clima_telemetria_coleta) AS dia_fim`,
  );
  return {
    importacao: r!.importacao,
    calculo: r!.calculo,
    postos: r!.postos,
    meses: r!.meses,
    anos: r!.ini === null ? null : [r!.ini, r!.fim!],
    telemetria: { coleta: r!.coleta, dias: r!.dias, postos: r!.tpostos, periodo: r!.dia_ini ? [r!.dia_ini, r!.dia_fim!] : null },
  };
}

// ---------------------------------------------------------------------------
// Municípios e postos
// ---------------------------------------------------------------------------

export type Municipio = { codIbge: number; nome: string; ugrhi: number | null };

/** Municípios com posto com dado (acervo ou telemetria): o nome e a UGRHI mais comuns entre os postos dele. */
export async function municipios(): Promise<Municipio[]> {
  const linhas = await query<{ cod_ibge: number; nome: string; ugrhi: number | null }>(
    `SELECT p.cod_ibge, mode() WITHIN GROUP (ORDER BY p.municipio) AS nome, mode() WITHIN GROUP (ORDER BY p.ugrhi) AS ugrhi
       FROM clima_postos p WHERE p.cod_ibge IS NOT NULL AND p.municipio IS NOT NULL
      GROUP BY p.cod_ibge
     HAVING bool_or(p.importado_em IS NOT NULL OR EXISTS (SELECT 1 FROM clima_telemetria_dia d WHERE d.posto_id = p.id))`,
  );
  return linhas.map((l) => ({ codIbge: l.cod_ibge, nome: l.nome, ugrhi: l.ugrhi })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type Posto = { id: number; prefixo: string; nome: string | null; municipio: string | null; codIbge: number | null; dono: string | null; ugrhi: number | null; lat: number; lon: number };

type LinhaMesPosto = { posto_id: number; mes: number; total: string | null; valido: boolean | null; ate_dia: number | null };

/**
 * Meses observados dos postos de uma UGRHI (ou de um município) no ano, na
 * fonte escolhida, com o cadastro dos postos que têm algum desses meses.
 */
export async function mesesDosPostos(f: Pick<Filtro, 'criterio' | 'fonte'>, onde: { ugrhi: number } | { mun: number }, ano: number): Promise<{ postos: Posto[]; meses: Map<number, MesLocal[]> }> {
  const [campo, valor] = 'mun' in onde ? ['cod_ibge', onde.mun] : ['ugrhi', onde.ugrhi];
  const linhas = await query<LinhaMesPosto & Omit<Posto, 'codIbge'> & { cod_ibge: number | null; posto_id: number }>(
    `SELECT c.posto_id, c.mes, c.total, c.${coluna(f.criterio)} AS valido, c.ate_dia,
            p.id, p.prefixo, p.nome, p.municipio, p.cod_ibge, p.dono, p.ugrhi, p.lat, p.lon
       FROM clima_chuva_mes c JOIN clima_postos p ON p.id = c.posto_id
      WHERE c.fonte = $1 AND c.ano = $2 AND p.${campo} = $3`,
    [f.fonte, ano, valor],
  );
  const postos = new Map<number, Posto>();
  const meses = new Map<number, MesLocal[]>();
  for (const l of linhas) {
    postos.set(l.id, { id: l.id, prefixo: l.prefixo, nome: l.nome, municipio: l.municipio, codIbge: l.cod_ibge, dono: l.dono, ugrhi: l.ugrhi, lat: l.lat, lon: l.lon });
    const lista = meses.get(l.posto_id) ?? [];
    lista.push({ mes: l.mes, chuva: n(l.total), valido: Boolean(l.valido) && l.total !== null, postos: 1, ateDia: l.ate_dia });
    meses.set(l.posto_id, lista);
  }
  return { postos: [...postos.values()].sort((a, b) => a.prefixo.localeCompare(b.prefixo)), meses };
}

/**
 * Meses observados de cada município (média dos postos dele com o mês válido) no
 * ano, na fonte escolhida. `codigos`: os municípios pedidos.
 */
export async function mesesDosMunicipios(f: Pick<Filtro, 'criterio' | 'fonte'>, codigos: readonly number[], ano: number): Promise<Map<number, MesLocal[]>> {
  if (!codigos.length) return new Map();
  const linhas = await query<{ cod_ibge: number; mes: number; chuva: string; postos: number; ate_dia: number | null }>(
    `SELECT p.cod_ibge, c.mes, round(avg(c.total), 1)::text AS chuva, count(*)::int AS postos, max(c.ate_dia)::int AS ate_dia
       FROM clima_chuva_mes c JOIN clima_postos p ON p.id = c.posto_id
      WHERE c.fonte = $1 AND c.ano = $2 AND p.cod_ibge = ANY($3::int[]) AND c.${coluna(f.criterio)} AND c.total IS NOT NULL
      GROUP BY p.cod_ibge, c.mes`,
    [f.fonte, ano, codigos],
  );
  const r = new Map<number, MesLocal[]>();
  for (const l of linhas) r.set(l.cod_ibge, [...(r.get(l.cod_ibge) ?? []), { mes: l.mes, chuva: Number(l.chuva), valido: true, postos: l.postos, ateDia: l.ate_dia }]);
  return r;
}

/**
 * Médias climatológicas (acervo) de postos ou municípios: código → índice 0 = ano, 1–12 = meses. Sem média = ausente.
 * O período "2010 até hoje" fica gravado com o ano do último cálculo: na virada do ano, até o próximo
 * `clima:calcular`, vale o último gravado (o acervo não tem o ano novo, então a média é a mesma).
 */
export async function normaisLocais(escala: 'posto' | 'municipio', codigos: readonly number[], f: Pick<Filtro, 'criterio' | 'periodo'>): Promise<Map<number, Estatistica[]>> {
  if (!codigos.length) return new Map();
  const linhas = await query<{ codigo: number; mes: number; tipo: TipoMedia; media: string | null; anos_validos: number; anos: number[] }>(
    `SELECT codigo, mes, tipo, media, anos_validos, anos FROM clima_normais_local
      WHERE escala = $1 AND codigo = ANY($2::int[]) AND periodo_ini = $3 AND criterio = $5
        AND periodo_fim = (SELECT max(periodo_fim) FROM clima_normais_local WHERE escala = $1 AND periodo_ini = $3 AND periodo_fim <= $4)`,
    [escala, codigos, ...f.periodo, f.criterio],
  );
  const r = new Map<number, Estatistica[]>();
  for (const l of linhas) {
    const lista = r.get(l.codigo) ?? [];
    lista[l.mes] = { tipo: l.tipo, media: n(l.media), anosValidos: l.anos_validos, anos: l.anos, mediana: null, desvio: null, minimo: null, anoMinimo: null, maximo: null, anoMaximo: null };
    r.set(l.codigo, lista);
  }
  return r;
}

export type Locais = {
  postos: Posto[];
  mesesPostos: Map<number, MesLocal[]>;
  /** Municípios listados: todos os do estado com dado. */
  municipios: number[];
  mesesMunicipios: Map<number, MesLocal[]>;
  normaisMunicipios: Map<number, Estatistica[]>;
  normaisPostos: Map<number, Estatistica[]>;
  periodos: Map<number, { ini: string; fim: string; dias: number }>;
  cmpMunicipios: Map<number, ComparacaoLocal>;
  cmpPostos: Map<number, ComparacaoLocal>;
};

/**
 * Observado × média histórica de todos os municípios e dos postos de uma UGRHI
 * (ou de um município) no intervalo — o que a página e a exportação mostram.
 * Posto sem série no acervo usa a média histórica do município dele.
 */
export async function comparacoesLocais(f: Filtro, onde: { ugrhi: number; mun: number | null }, ano: number, mes: number, acumulado: Acumulado, muns: readonly Municipio[]): Promise<Locais> {
  const locais = await mesesDosPostos(f, onde.mun ? { mun: onde.mun } : { ugrhi: onde.ugrhi }, ano);
  const codigos = muns.map((m) => m.codIbge);
  const ids = locais.postos.map((p) => p.id);
  const comNormal = [...new Set([...codigos, ...locais.postos.flatMap((p) => (p.codIbge === null ? [] : [p.codIbge]))])];
  const [mesesMunicipios, normaisMunicipios, normaisPostos, periodos] = await Promise.all([
    mesesDosMunicipios(f, codigos, ano),
    normaisLocais('municipio', comNormal, f),
    normaisLocais('posto', ids, f),
    f.fonte === 'telemetria' ? periodoTelemetria(ids) : Promise.resolve(new Map<number, { ini: string; fim: string; dias: number }>()),
  ]);
  const doPosto = new Map(locais.postos.map((p) => [p.id, p]));
  const reserva = (id: number) => {
    const cod = doPosto.get(id)?.codIbge;
    return cod === null || cod === undefined ? undefined : normaisMunicipios.get(cod);
  };
  return {
    postos: locais.postos,
    mesesPostos: locais.meses,
    municipios: codigos,
    mesesMunicipios,
    normaisMunicipios,
    normaisPostos,
    periodos,
    cmpMunicipios: new Map(compararLocal(codigos, mesesMunicipios, normaisMunicipios, mes, acumulado).map((c) => [c.codigo, c])),
    cmpPostos: new Map(compararLocal(ids, locais.meses, normaisPostos, mes, acumulado, reserva).map((c) => [c.codigo, c])),
  };
}

/** Período com dado telemétrico de cada posto (primeiro e último dia no banco, e quantos dias). */
export async function periodoTelemetria(ids: readonly number[]): Promise<Map<number, { ini: string; fim: string; dias: number }>> {
  if (!ids.length) return new Map();
  const linhas = await query<{ posto_id: number; ini: string; fim: string; dias: number }>(
    'SELECT posto_id, min(dia)::text AS ini, max(dia)::text AS fim, count(*)::int AS dias FROM clima_telemetria_dia WHERE posto_id = ANY($1::int[]) GROUP BY posto_id',
    [ids],
  );
  return new Map(linhas.map((l) => [l.posto_id, { ini: l.ini, fim: l.fim, dias: l.dias }]));
}
