import { z } from 'zod';
import limites from '../../conteudo/ugrhi.json';
import { query, transacao } from '../db';
import { buscarJson } from '../integracoes/http';
import { erroSeguro, log } from '../log';
import { classificadorUgrhi, COBERTURA_MIN, montarGrade, thiessen, type Limites } from './espacial';
import { CRITERIOS, resumir } from './regras';
import { janelaDoDia, mesTelemetria, somarDias, type DiaPosto } from './regras-telemetria';

/**
 * Chuva observada pela rede telemétrica do SIBH (API v2), para o Painel de
 * Climatologia. Uma consulta por dia de Brasília traz todos os pluviômetros
 * (regras-telemetria.ts); o dia fica guardado em clima_telemetria_dia e não é
 * consultado de novo. Daqui saem o total do mês de cada posto (clima_chuva_mes,
 * fonte "telemetria") e a média de cada UGRHI (clima_serie_ugrhi, idem).
 *
 * Usado pela carga do histórico (scripts/clima-telemetria.ts) e pela coleta
 * diária do servidor (instrumentation.ts), nunca pela página.
 */

const SIBH_V2 = 'https://cth.daee.sp.gov.br/sibh/api/v2/';
export const TIMEOUT_DIA_MS = 150_000;

const texto = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const numero = (v: unknown) => (texto(v) === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const r1 = (v: number) => Math.round(v * 10) / 10;
let ugrhiDe: ((lon: number, lat: number) => number | null) | undefined;
const classificar = (lon: number, lat: number) => (ugrhiDe ??= classificadorUgrhi(limites as unknown as Limites))(lon, lat);

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export type PostoCadastro = {
  id: number;
  prefixo: string;
  nome: string | null;
  municipio: string | null;
  codIbge: number | null;
  dono: string | null;
  ugrhiCadastro: number | null;
  lat: number;
  lon: number;
  situacao: string | null;
};

const esquemaCadastro = z.array(
  z.looseObject({ id: z.union([z.number(), z.string()]), prefix: z.string(), name: z.unknown(), city_name: z.unknown(), cod_ibge: z.unknown(), station_owner: z.unknown(), ugrhi_cod: z.unknown(), latitude: z.unknown(), longitude: z.unknown(), operation_status: z.unknown() }),
);

/** Cadastro v2 dos pluviômetros, com município (IBGE) e operador. Uma consulta (~2 MB). */
export async function cadastroV2(): Promise<PostoCadastro[]> {
  const lista = esquemaCadastro.parse(await buscarJson(`${SIBH_V2}stations?serializer=complete&station_type_id=2`, { timeoutMs: 90_000 }));
  return lista.flatMap((e) => {
    const lat = numero(e.latitude);
    const lon = numero(e.longitude);
    if (lat === null || lon === null) return [];
    const u = numero(e.ugrhi_cod);
    return [{ id: Number(e.id), prefixo: e.prefix.trim(), nome: texto(e.name) || null, municipio: texto(e.city_name) || null, codIbge: numero(e.cod_ibge), dono: texto(e.station_owner) || null, ugrhiCadastro: u !== null && u >= 1 && u <= 22 ? u : null, lat, lon, situacao: texto(e.operation_status) || null }];
  });
}

/**
 * Grava o cadastro. Posto novo entra inteiro; posto do acervo só ganha o código
 * IBGE do município (os demais dados dele são os do acervo, v1). A UGRHI vale
 * pelo polígono oficial; fora de todos (litoral), fica a do cadastro.
 */
export async function gravarCadastro(postos: readonly PostoCadastro[]): Promise<void> {
  const registros = postos.map((p) => ({ ...p, ugrhi: classificar(p.lon, p.lat) ?? p.ugrhiCadastro }));
  await query(
    `INSERT INTO clima_postos (id, prefixo, nome, municipio, cod_ibge, dono, ugrhi, ugrhi_cadastro, lat, lon, situacao)
     SELECT r.id, r.prefixo, r.nome, r.municipio, r."codIbge", r.dono, r.ugrhi, r."ugrhiCadastro", r.lat, r.lon, r.situacao
       FROM jsonb_to_recordset($1::jsonb) AS r(id int, prefixo text, nome text, municipio text, "codIbge" int, dono text, ugrhi smallint,
                                               "ugrhiCadastro" smallint, lat float8, lon float8, situacao text)
     ON CONFLICT (id) DO UPDATE SET cod_ibge = EXCLUDED.cod_ibge,
       prefixo = CASE WHEN clima_postos.importado_em IS NULL THEN EXCLUDED.prefixo ELSE clima_postos.prefixo END,
       nome = CASE WHEN clima_postos.importado_em IS NULL THEN EXCLUDED.nome ELSE clima_postos.nome END,
       municipio = CASE WHEN clima_postos.importado_em IS NULL THEN EXCLUDED.municipio ELSE coalesce(clima_postos.municipio, EXCLUDED.municipio) END,
       dono = CASE WHEN clima_postos.importado_em IS NULL THEN EXCLUDED.dono ELSE clima_postos.dono END,
       ugrhi = CASE WHEN clima_postos.importado_em IS NULL THEN EXCLUDED.ugrhi ELSE clima_postos.ugrhi END,
       lat = CASE WHEN clima_postos.importado_em IS NULL THEN EXCLUDED.lat ELSE clima_postos.lat END,
       lon = CASE WHEN clima_postos.importado_em IS NULL THEN EXCLUDED.lon ELSE clima_postos.lon END,
       atualizado_em = now()`,
    [JSON.stringify(registros)],
  );
}

// ---------------------------------------------------------------------------
// Coleta de um dia
// ---------------------------------------------------------------------------

export type RegistroDia = {
  id: number;
  prefixo: string;
  nome: string | null;
  codIbge: number | null;
  dono: string | null;
  lat: number | null;
  lon: number | null;
  intervalo: number | null;
  registros: number;
  chuva: number;
  maximo: number | null;
  primeiro: string | null;
  ultimo: string | null;
};

const esquemaDia = z.object({
  measurements: z.array(
    z.looseObject({
      station_prefix_id: z.union([z.number(), z.string()]),
      prefix: z.unknown(),
      station_name: z.unknown(),
      cod_ibge: z.unknown(),
      latitude: z.unknown(),
      longitude: z.unknown(),
      station_owner: z.unknown(),
      measurement_gap: z.unknown(),
      qtd: z.unknown(),
      value: z.unknown(),
      max_value: z.unknown(),
      min_date: z.unknown(),
      max_date: z.unknown(),
    }),
  ),
});
const instante = (v: unknown) => (/^\d{4}-\d{2}-\d{2}T/.test(texto(v)) && !Number.isNaN(Date.parse(texto(v))) ? new Date(texto(v)).toISOString() : null);

/** Chuva de todos os pluviômetros num dia de Brasília (AAAA-MM-DD): uma consulta. */
export async function consultarDia(dia: string, timeoutMs = TIMEOUT_DIA_MS): Promise<RegistroDia[]> {
  const j = janelaDoDia(dia);
  const r = esquemaDia.parse(await buscarJson(`${SIBH_V2}measurements/now?station_type_id=2&hours=${j.horas}&from_date=${j.fim}`, { timeoutMs }));
  const porPosto = new Map<number, RegistroDia>();
  for (const m of r.measurements) {
    const chuva = numero(m.value);
    const registros = numero(m.qtd);
    if (chuva === null || registros === null || registros < 1) continue;
    const id = Number(m.station_prefix_id);
    porPosto.set(id, {
      id,
      prefixo: texto(m.prefix) || String(id),
      nome: texto(m.station_name) || null,
      codIbge: numero(m.cod_ibge),
      dono: texto(m.station_owner) || null,
      lat: numero(m.latitude),
      lon: numero(m.longitude),
      intervalo: numero(m.measurement_gap),
      registros,
      chuva: r1(chuva),
      maximo: numero(m.max_value) === null ? null : r1(numero(m.max_value)!),
      primeiro: instante(m.min_date),
      ultimo: instante(m.max_date),
    });
  }
  return [...porPosto.values()];
}

/** Grava o dia (substitui o que havia) e marca o dia como consultado. Posto que ainda não está no banco entra com os dados da própria resposta. */
export async function gravarDia(dia: string, registros: readonly RegistroDia[], segundos: number): Promise<void> {
  const novos = registros.filter((r) => r.lat !== null && r.lon !== null).map((r) => ({ ...r, ugrhi: classificar(r.lon!, r.lat!) }));
  await transacao(async (c) => {
    await c.query(
      `INSERT INTO clima_postos (id, prefixo, nome, cod_ibge, dono, ugrhi, lat, lon)
       SELECT r.id, r.prefixo, r.nome, r."codIbge", r.dono, r.ugrhi, r.lat, r.lon
         FROM jsonb_to_recordset($1::jsonb) AS r(id int, prefixo text, nome text, "codIbge" int, dono text, ugrhi smallint, lat float8, lon float8)
       ON CONFLICT (id) DO NOTHING`,
      [JSON.stringify(novos)],
    );
    await c.query('DELETE FROM clima_telemetria_dia WHERE dia = $1', [dia]);
    await c.query(
      `INSERT INTO clima_telemetria_dia (posto_id, dia, chuva, registros, intervalo, primeiro, ultimo, maximo)
       SELECT r.id, $2::date, r.chuva, r.registros, r.intervalo, r.primeiro::timestamptz, r.ultimo::timestamptz, r.maximo
         FROM jsonb_to_recordset($1::jsonb) AS r(id int, chuva numeric, registros smallint, intervalo smallint, primeiro text, ultimo text, maximo numeric)
        WHERE EXISTS (SELECT 1 FROM clima_postos p WHERE p.id = r.id)`, // sem coordenada e fora do cadastro: não há como situar o posto
      [JSON.stringify(registros), dia],
    );
    await c.query(
      `INSERT INTO clima_telemetria_coleta (dia, postos, segundos) VALUES ($1, $2, $3)
       ON CONFLICT (dia) DO UPDATE SET postos = EXCLUDED.postos, segundos = EXCLUDED.segundos, consultado_em = now()`,
      [dia, registros.length, Math.round(segundos * 10) / 10],
    );
  });
}

// ---------------------------------------------------------------------------
// Totais do mês e média das UGRHIs
// ---------------------------------------------------------------------------

type LinhaDia = { posto_id: number; dia: string; chuva: string; registros: number; intervalo: number | null; primeiro: Date | null; ultimo: Date | null; maximo: string | null };

/**
 * Refaz, nos meses pedidos, o total de cada posto (clima_chuva_mes) e a média
 * de cada UGRHI (clima_serie_ugrhi) com a telemetria: Thiessen e média
 * aritmética, nos critérios padrão e estrito, como no acervo. O mês corrente
 * vai do dia 1 ao último dia já consultado (ate_dia).
 */
export async function recalcularMeses(meses: readonly { ano: number; mes: number }[]): Promise<{ postosMes: number; ugrhiMes: number }> {
  const unicos = [...new Map(meses.map((m) => [`${m.ano}-${m.mes}`, m])).values()].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  if (!unicos.length) return { postosMes: 0, ugrhiMes: 0 };
  const primeiro = `${unicos[0]!.ano}-${String(unicos[0]!.mes).padStart(2, '0')}-01`;
  const ultimo = unicos[unicos.length - 1]!;
  const depois = somarDias(`${ultimo.ano}-${String(ultimo.mes).padStart(2, '0')}-28`, 4).slice(0, 8) + '01';
  const postos = await query<{ id: number; lat: number; lon: number; ugrhi: number | null }>(
    'SELECT id, lat, lon, ugrhi FROM clima_postos p WHERE EXISTS (SELECT 1 FROM clima_telemetria_dia d WHERE d.posto_id = p.id AND d.dia >= $1 AND d.dia < $2) ORDER BY id',
    [primeiro, depois],
  );
  if (!postos.length) return { postosMes: 0, ugrhiMes: 0 };
  const indice = new Map(postos.map((p, i) => [p.id, i]));
  const grade = montarGrade(limites as unknown as Limites, postos);
  let postosMes = 0;
  let ugrhiMes = 0;
  const hoje = hojeSP();

  for (const { ano, mes } of unicos) {
    const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const fim = somarDias(`${ano}-${String(mes).padStart(2, '0')}-28`, 4).slice(0, 8) + '01';
    // mês em andamento: a conta vai do dia 1 até o último dia já consultado (encerrado)
    let ateDia: number | null = null;
    if (hoje >= ini && hoje < fim) {
      const [u] = await query<{ d: number | null }>('SELECT extract(day FROM max(dia))::int AS d FROM clima_telemetria_coleta WHERE dia >= $1 AND dia < $2', [ini, fim]);
      if (!u?.d) continue;
      ateDia = u.d;
    }
    const linhas = await query<LinhaDia>(
      'SELECT posto_id, dia::text AS dia, chuva, registros, intervalo, primeiro, ultimo, maximo FROM clima_telemetria_dia WHERE dia >= $1 AND dia < $2',
      [ini, fim],
    );
    const porPosto = new Map<number, DiaPosto[]>();
    for (const l of linhas) {
      const lista = porPosto.get(l.posto_id) ?? [];
      lista.push({ dia: l.dia, chuva: Number(l.chuva), registros: l.registros, intervalo: l.intervalo, primeiro: l.primeiro?.getTime() ?? null, ultimo: l.ultimo?.getTime() ?? null, maximo: l.maximo === null ? null : Number(l.maximo) });
      porPosto.set(l.posto_id, lista);
    }
    const valores = { padrao: new Float64Array(postos.length).fill(NaN), estrito: new Float64Array(postos.length).fill(NaN) };
    const diasPosto = new Map<number, (number | null)[]>();
    const nDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const ate = ateDia ?? nDias;
    const registros = [...porPosto].map(([posto, dias]) => {
      const m = mesTelemetria(ano, mes, dias, ate);
      const r = resumir(m.dias.slice(0, ate));
      const p = indice.get(posto);
      if (p !== undefined) {
        diasPosto.set(p, m.dias);
        for (const criterio of CRITERIOS) if (m.valido[criterio]) valores[criterio][p] = m.dias.reduce<number>((s, d) => s + (d ?? 0), 0);
      }
      return { posto_id: posto, dias: m.dias, total: r.total, dias_faltando: r.diasFaltando, maior_falta: r.maiorFalta, falta_no_fim: r.faltaNoFim, padrao: m.valido.padrao, estrito: m.valido.estrito, ate_dia: ateDia };
    });

    // dias depois do último encerrado ficam null (ainda não aconteceram)
    const mediaDias = (pesos: [number, number][]) => Array.from({ length: nDias }, (_, d) => (d >= ate ? null : r1(pesos.reduce((s, [p, w]) => s + w * diasPosto.get(p)![d]!, 0))));
    const serie: Record<string, unknown>[] = [];
    for (const u of grade.values()) {
      for (const criterio of CRITERIOS) {
        const valor = valores[criterio];
        const t = thiessen(u, valor);
        const dentro = [...diasPosto.keys()].filter((p) => postos[p]!.ugrhi === u.codigo && !Number.isNaN(valor[p]!));
        const w = dentro.length ? 1 / dentro.length : 0;
        serie.push({
          ugrhi: u.codigo, ano, mes, criterio, metodo: 'thiessen', ate_dia: ateDia,
          chuva: t.chuva === null ? null : r1(t.chuva),
          dias: t.chuva === null ? null : mediaDias([...t.pesos]),
          postos: t.pesos.size, cobertura: r1(t.cobertura),
          valido: t.chuva !== null && t.cobertura >= COBERTURA_MIN,
          pesos: Object.fromEntries([...t.pesos].map(([p, peso]) => [postos[p]!.id, Math.round(peso * 10_000) / 10_000])),
        });
        serie.push({
          ugrhi: u.codigo, ano, mes, criterio, metodo: 'aritmetica', ate_dia: ateDia,
          chuva: dentro.length ? r1(dentro.reduce((s, p) => s + valor[p]!, 0) / dentro.length) : null,
          dias: dentro.length ? mediaDias(dentro.map((p) => [p, w])) : null,
          postos: dentro.length, cobertura: r1(t.cobertura),
          valido: dentro.length > 0 && t.cobertura >= COBERTURA_MIN,
          pesos: null,
        });
      }
    }

    await transacao(async (c) => {
      await c.query("DELETE FROM clima_chuva_mes WHERE fonte = 'telemetria' AND ano = $1 AND mes = $2", [ano, mes]);
      await c.query(
        `INSERT INTO clima_chuva_mes (posto_id, ano, mes, fonte, dias, total, dias_faltando, maior_falta, falta_no_fim, valido_padrao, valido_estrito, ate_dia)
         SELECT r.posto_id, $2, $3, 'telemetria',
                ARRAY(SELECT d.v::real FROM jsonb_array_elements_text(r.dias) WITH ORDINALITY AS d(v, i) ORDER BY d.i),
                r.total, r.dias_faltando, r.maior_falta, r.falta_no_fim, r.padrao, r.estrito, r.ate_dia
           FROM jsonb_to_recordset($1::jsonb) AS r(posto_id int, dias jsonb, total numeric, dias_faltando smallint, maior_falta smallint, falta_no_fim boolean,
                                                   padrao boolean, estrito boolean, ate_dia smallint)`,
        [JSON.stringify(registros), ano, mes],
      );
      await c.query("DELETE FROM clima_serie_ugrhi WHERE fonte = 'telemetria' AND ano = $1 AND mes = $2", [ano, mes]);
      await c.query(
        `INSERT INTO clima_serie_ugrhi (ugrhi, ano, mes, criterio, metodo, fonte, chuva, dias, postos, cobertura, valido, pesos, ate_dia)
         SELECT r.ugrhi, r.ano, r.mes, r.criterio, r.metodo, 'telemetria', r.chuva,
                CASE WHEN r.dias IS NULL THEN NULL ELSE ARRAY(SELECT d.v::real FROM jsonb_array_elements_text(r.dias) WITH ORDINALITY AS d(v, i) ORDER BY d.i) END,
                r.postos, r.cobertura, r.valido, r.pesos, r.ate_dia
           FROM jsonb_to_recordset($1::jsonb) AS r(ugrhi smallint, ano smallint, mes smallint, criterio text, metodo text, chuva numeric,
                                                   dias jsonb, postos smallint, cobertura numeric, valido boolean, pesos jsonb, ate_dia smallint)`,
        [JSON.stringify(serie)],
      );
    });
    postosMes += registros.length;
    ugrhiMes += grade.size;
  }
  return { postosMes, ugrhiMes };
}

// ---------------------------------------------------------------------------
// Coleta diária (servidor)
// ---------------------------------------------------------------------------

/** Depois disto (contado do fim do dia) o dia é dado como fechado: transmissões atrasadas já chegaram. */
const FECHAMENTO_H = 30;
/** Dias recentes conferidos a cada rodada. */
const DIAS_RECENTES = 3;

/** Hoje em Brasília (AAAA-MM-DD). */
export const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

let coletando = false;

/**
 * Coleta dos dias recentes: os últimos DIAS_RECENTES dias fechados que ainda não
 * foram consultados, ou que foram consultados antes de fechar (FECHAMENTO_H
 * depois do fim do dia). No máximo uma consulta por dia pendente — dia recente
 * responde em ~1 s. Depois refaz os meses afetados. Nunca lança.
 */
export async function coletarRecentes(): Promise<void> {
  if (coletando) return;
  coletando = true;
  try {
    const hoje = hojeSP();
    const dias = Array.from({ length: DIAS_RECENTES }, (_, i) => somarDias(hoje, -(i + 1)));
    const ja = new Map(
      (await query<{ dia: string; consultado_em: Date }>('SELECT dia::text AS dia, consultado_em FROM clima_telemetria_coleta WHERE dia = ANY($1::date[])', [dias])).map((r) => [r.dia, r.consultado_em.getTime()]),
    );
    const pendentes = dias.filter((d) => {
      const em = ja.get(d);
      return em === undefined || em < janelaDoDia(d).fimDia + FECHAMENTO_H * 3_600_000;
    });
    for (const dia of pendentes) {
      const t = performance.now();
      const registros = await consultarDia(dia, 60_000);
      await gravarDia(dia, registros, (performance.now() - t) / 1000);
    }
    if (pendentes.length) {
      const meses = pendentes.map((d) => ({ ano: Number(d.slice(0, 4)), mes: Number(d.slice(5, 7)) }));
      await recalcularMeses(meses);
      log.info('clima_telemetria_coletada', { dias: pendentes.join(',') });
    }
  } catch (e) {
    log.warn('clima_telemetria_falhou', { erro: erroSeguro(e) });
  } finally {
    coletando = false;
  }
}
