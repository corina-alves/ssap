import { z } from 'zod';
import { BARRAMENTOS, CAPIVARI, ESTACOES_RIBEIRA, GRADE_PREVISAO_UGRHI11, PLUVIOMETRICAS_UGRHI11, type Barramento } from '@/conteudo/boletim-ribeira';
import { query } from '../db';
import { lembrar, TTL } from '../integracoes/cache';
import { comoDado, type Dado } from '../integracoes/comum';
import { arred, buscarJson, numero } from '../integracoes/http';
import { buscarSibh, cotasAlerta, medicoes, type Medicao } from '../integracoes/sibh-medicoes';
import { erroSeguro, log } from '../log';
import {
  ATRASO,
  dif,
  inicioDaSituacao,
  maisProxima,
  montarPonto,
  serieDoPosto,
  tendencia,
  TOLERANCIA_07H,
  ultima,
  type Leitura,
  type PontoRibeira,
  type Tendencia,
  type VolumeCopel,
} from './boletim-ribeira-regras';
import { referencias, type Referencias } from './sumario-automatico-tp';

/**
 * Boletim Executivo Público — Vale do Ribeira. Sem edição manual: tudo vem das
 * fontes, buscado no servidor, com as regras do Sumário Executivo tradicional
 * (que não muda; ver boletim-ribeira-regras.ts).
 *   SIBH        níveis e cotas dos 8 pontos, barramentos do Juquiá, Capivari, chuva
 *   Open-Meteo  previsão de chuva nas próximas 24 h na UGRHI 11
 *   Copel       volume útil do Capivari (registro das 07h; ver volumeCopel)
 * O dia operacional e as 07h são os do sumário automático do Tietê/Pinheiros:
 * o boletim fecha o período das 07h do dia anterior às 07h do dia (24 h).
 * As leituras das 07h ficam também em boletim_ribeira_leituras (reserva).
 * Cada fonte falha sozinha: a página e o PDF mostram o que as outras trouxeram.
 */

const SERVICO = 'boletim_ribeira';
export const FONTE_SIBH = 'SIBH — SP Águas';
const HORA = 3_600_000;
/** Os dados de tempo real ficam guardados 10 min: o mesmo intervalo da coleta e da transmissão dos postos. */
const TTL_RECENTE = 600;

export { referencias, type Referencias };

// ---------------------------------------------------------------- período

/**
 * Período do boletim: o padrão (07h do dia anterior → 07h do dia, com a
 * reserva das 07h no banco) ou o escolhido pelo usuário (`personalizado`):
 * Referência 1 = t07Ontem, Referência 2 = t07. No escolhido nada é gravado
 * na reserva das 07h, que só guarda leituras das 07h.
 */
export type Periodo = Referencias & { personalizado?: boolean };

/** Período escolhido mais longo que isto é recusado (a série do SIBH é por minuto). */
export const MAX_PERIODO_DIAS = 7;

const fmtCampo = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** AAAA-MM-DDTHH:MM em Brasília (valor do campo datetime-local). */
export const paraCampo = (ms: number) => fmtCampo.format(ms).replace(' ', 'T');
const doCampo = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? Date.parse(`${v}:00-03:00`) : NaN);
const INICIO_SERIES = Date.parse('2010-01-01T00:00:00-03:00');

/**
 * Período pedido na URL (?inicio=&fim=, horário de Brasília). Sem os dois, ou
 * com valores inválidos, vale o padrão das 07h às 07h (e `erro` explica).
 */
export function escolherPeriodo(inicio?: string, fim?: string, agora = Date.now()): { ref: Periodo; erro: string | null } {
  const padrao: Periodo = { ...referencias(agora), personalizado: false };
  if (!inicio && !fim) return { ref: padrao, erro: null };
  const ini = doCampo(inicio);
  const f = doCampo(fim);
  const erro =
    Number.isNaN(ini) || Number.isNaN(f)
      ? 'Informe o dia e a hora de início e de fim.'
      : ini >= f
        ? 'O início precisa ser anterior ao fim.'
        : f > agora + 60_000
          ? 'O fim não pode ser depois de agora.'
          : f - ini > MAX_PERIODO_DIAS * 24 * HORA
            ? `O período pode ter no máximo ${MAX_PERIODO_DIAS} dias.`
            : ini < INICIO_SERIES
              ? 'O início não pode ser antes de 2010.'
              : null;
  if (erro) return { ref: padrao, erro: `${erro} Mostrando o período padrão, das 07h às 07h.` };
  if (ini === padrao.t07Ontem && f === padrao.t07) return { ref: padrao, erro: null };
  return { ref: { dia: paraCampo(f).slice(0, 10), ontem: paraCampo(ini).slice(0, 10), t07Ontem: ini, t07: f, agora, personalizado: true }, erro: null };
}

/** Identifica o período nas chaves do cache. */
const chavePeriodo = (ref: Periodo) => (ref.personalizado ? `${ref.t07Ontem}-${ref.t07}` : ref.dia);

// ---------------------------------------------------------------- reserva das 07h

type Guardada = { nivel: number; vazao: number | null; em: number | null };

async function guardadas07(dia: string): Promise<Map<string, Guardada>> {
  const mapa = new Map<string, Guardada>();
  try {
    const linhas = await query<{ ponto: string; nivel: string | null; vazao: string | null; lido_em: Date | null }>(
      `SELECT ponto, nivel, vazao, lido_em FROM boletim_ribeira_leituras WHERE fonte = 'sibh' AND dia = $1::date`,
      [dia],
    );
    for (const l of linhas) {
      const nivel = numero(l.nivel);
      if (nivel !== null) mapa.set(l.ponto, { nivel, vazao: numero(l.vazao), em: l.lido_em?.getTime() ?? null });
    }
  } catch (e) {
    log.warn('boletim_ribeira_reserva_indisponivel', { erro: erroSeguro(e) }); // sem banco, segue só com o SIBH
  }
  return mapa;
}

/** Grava (ou corrige) as leituras das 07h que o SIBH devolveu. Nunca lança. */
async function guardar07(dia: string, lidas: { ponto: string; l: Leitura }[], ja: Map<string, Guardada>): Promise<void> {
  const novas = lidas.filter(({ ponto, l }) => {
    const g = ja.get(ponto);
    return !g || g.nivel !== l.nivel || g.vazao !== l.vazao || g.em !== l.em;
  });
  if (!novas.length) return;
  try {
    await query(
      `INSERT INTO boletim_ribeira_leituras (fonte, ponto, dia, nivel, vazao, lido_em)
       SELECT 'sibh', x.ponto, $1::date, x.nivel, x.vazao, x.lido_em
         FROM unnest($2::text[], $3::numeric[], $4::numeric[], $5::timestamptz[]) AS x(ponto, nivel, vazao, lido_em)
       ON CONFLICT (fonte, ponto, dia) DO UPDATE
          SET nivel = EXCLUDED.nivel, vazao = EXCLUDED.vazao, lido_em = EXCLUDED.lido_em, gravado_em = now()`,
      [dia, novas.map((x) => x.ponto), novas.map((x) => x.l.nivel), novas.map((x) => x.l.vazao), novas.map((x) => new Date(x.l.em))],
    );
  } catch (e) {
    log.warn('boletim_ribeira_reserva_gravacao', { dia, erro: erroSeguro(e) });
  }
}

/**
 * O boletim fecha às 07h: com 2 h de folga depois das 07h, os dados param de
 * mudar e o cache vale 6 h (antes disso, 10 min, para pegar o que o SIBH ainda
 * estiver transmitindo).
 */
const ttlFechamento = (ref: Periodo) => (ref.agora >= ref.t07 + 2 * HORA ? 6 * 3600 : TTL_RECENTE);

/** Série do período fechado (07h do dia anterior → 07h do dia, com folga) de vários postos. */
async function periodoFechado(chave: string, ids: number[], ref: Periodo): Promise<Medicao[] | null> {
  const ini = ref.t07Ontem - 2 * HORA;
  const fim = Math.min(ref.agora, ref.t07 + TOLERANCIA_07H);
  const k = `${chave}:${chavePeriodo(ref)}`;
  const m = await medicoes(SERVICO, { [k]: { ids, ini, fim, grupo: 'minute', ttlSeg: ttlFechamento(ref) } });
  return m[k] ?? null;
}

/** Leituras mais próximas das 07h de um dia, para a reserva no banco. */
const lidas07 = (series: Map<number, Leitura[]>, alvo: number) =>
  [...series].flatMap(([id, s]) => {
    const l = maisProxima(s, alvo, TOLERANCIA_07H);
    return l ? [{ ponto: String(id), l }] : [];
  });

/** Leituras das 07h guardadas no banco; no período escolhido, nenhuma (a reserva é só das 07h). */
const reserva07 = (ref: Periodo, dia: string) => (ref.personalizado ? Promise.resolve(new Map<string, Guardada>()) : guardadas07(dia));

const comoGuardado = (g: Guardada | undefined) => (g ? { nivel: g.nivel, em: g.em } : null);

// ---------------------------------------------------------------- os 8 pontos

export type Niveis = { pontos: PontoRibeira[]; atualizadoEm: number | null };

export async function niveis(ref: Periodo): Promise<Dado<Niveis>> {
  const ids = ESTACOES_RIBEIRA.map((e) => e.id);
  const [med, cotas, gOntem, gHoje] = await Promise.all([periodoFechado('pontos', ids, ref), cotasAlerta(SERVICO, ids), reserva07(ref, ref.ontem), reserva07(ref, ref.dia)]);
  if (!med) return comoDado(FONTE_SIBH, null);

  const series = new Map(ids.map((id) => [id, serieDoPosto(med, id)]));
  const pontos = ESTACOES_RIBEIRA.map((e) =>
    montarPonto(e, series.get(e.id)!, cotas?.[String(e.id)] ?? null, ref.t07Ontem, ref.t07, comoGuardado(gOntem.get(String(e.id))), comoGuardado(gHoje.get(String(e.id)))),
  );

  // Em extravasamento desde antes do período consultado: procura a entrada nos 7 dias anteriores (por hora).
  const longos = pontos.filter((p) => p.desde && 'antesDe' in p.desde && p.cotas);
  if (longos.length) {
    const chave = `semana:${chavePeriodo(ref)}:${longos.map((p) => p.id).join(',')}`;
    const fim = Math.min(...longos.map((p) => series.get(p.id)![0]?.em ?? ref.t07));
    const semana = (await medicoes(SERVICO, { [chave]: { ids: longos.map((p) => p.id), ini: ref.t07 - 7 * 24 * HORA, fim, grupo: 'hour', ttlSeg: 6 * 3600 } }))[chave] ?? null;
    if (semana) {
      for (const p of longos) {
        const curta = series.get(p.id)!.filter((l) => l.em <= p.atualEm!);
        const antes = serieDoPosto(semana, p.id).filter((l) => l.em < (curta[0]?.em ?? Infinity));
        p.desde = inicioDaSituacao([...antes, ...curta], p.cotas!, p.situacao);
      }
    }
  }

  if (!ref.personalizado) {
    await guardar07(ref.ontem, lidas07(series, ref.t07Ontem), gOntem);
    await guardar07(ref.dia, lidas07(series, ref.t07), gHoje);
  }

  const atualizadoEm = Math.max(0, ...pontos.map((p) => p.atualEm ?? 0)) || null;
  return {
    ok: true,
    fonte: FONTE_SIBH,
    obtidoEm: new Date(),
    // leitura usada nas 07h com mais de 1 h de atraso (postos parados ou reserva do cache)
    desatualizado: atualizadoEm === null || ref.t07 - atualizadoEm > ATRASO,
    dados: { pontos, atualizadoEm },
  };
}

// ---------------------------------------------------------------- barramentos e Capivari

export type LeituraBarramento = Barramento & {
  /** nível às 07h do dia anterior */
  anterior: number | null;
  /** nível às 07h do dia */
  atual: number | null;
  atualEm: number | null;
  variacao: number | null;
  tendencia: Tendencia | null;
  /** vazão defluente no posto de jusante às 07h (m³/s) */
  jusante: number | null;
};

export type Capivari = {
  cota: number | null;
  cotaEm: number | null;
  vazao: number | null;
  variacaoCota: number | null;
  variacaoVazao: number | null;
};

export type Estruturas = { barramentos: LeituraBarramento[]; capivari: Capivari };

export async function estruturas(ref: Periodo): Promise<Dado<Estruturas>> {
  const ids = [...new Set([...BARRAMENTOS.flatMap((b) => (b.jusanteId === null ? [b.id] : [b.id, b.jusanteId])), CAPIVARI.id])];
  const [med, gOntem, gHoje] = await Promise.all([periodoFechado('estruturas', ids, ref), reserva07(ref, ref.ontem), reserva07(ref, ref.dia)]);
  if (!med) return comoDado(FONTE_SIBH, null);

  const series = new Map(ids.map((id) => [id, serieDoPosto(med, id)]));
  const reserva = (g: Guardada | undefined, alvo: number): Leitura | null => (g ? { nivel: g.nivel, vazao: g.vazao, em: g.em ?? alvo } : null);
  /** Referência 1 (07h do dia anterior) e Referência 2 (07h do dia) de um posto. */
  const doPosto = (id: number) => {
    const serie = series.get(id)!;
    return {
      ini: maisProxima(serie, ref.t07Ontem, TOLERANCIA_07H) ?? reserva(gOntem.get(String(id)), ref.t07Ontem),
      fim: ultima(serie, ref.t07) ?? reserva(gHoje.get(String(id)), ref.t07),
    };
  };

  const barramentos = BARRAMENTOS.map((b): LeituraBarramento => {
    const { ini, fim } = doPosto(b.id);
    const variacao = dif(fim?.nivel ?? null, ini?.nivel ?? null);
    const jus = b.jusanteId === null ? null : doPosto(b.jusanteId).fim;
    return { ...b, anterior: ini?.nivel ?? null, atual: fim?.nivel ?? null, atualEm: fim?.em ?? null, variacao, tendencia: tendencia(variacao), jusante: jus?.vazao ?? null };
  });

  const c = doPosto(CAPIVARI.id);
  const capivari: Capivari = {
    cota: c.fim?.nivel ?? null,
    cotaEm: c.fim?.em ?? null,
    vazao: c.fim?.vazao ?? null,
    variacaoCota: dif(c.fim?.nivel ?? null, c.ini?.nivel ?? null),
    variacaoVazao: dif(c.fim?.vazao ?? null, c.ini?.vazao ?? null),
  };

  if (!ref.personalizado) {
    await guardar07(ref.ontem, lidas07(series, ref.t07Ontem), gOntem);
    await guardar07(ref.dia, lidas07(series, ref.t07), gHoje);
  }
  return { ok: true, fonte: FONTE_SIBH, obtidoEm: new Date(), desatualizado: false, dados: { barramentos, capivari } };
}

// ---------------------------------------------------------------- Copel

/**
 * Volume útil do Reservatório Capivari: API do Monitoramento Hidrológico de
 * Bacias (MHB) da Copel, ponto 32 "Res Capivari" (UHE Gov. Parigot de Souza).
 * Registros de hora em hora, só do dia corrente (o parâmetro "dias" não traz
 * dias anteriores); a hora mais recente pode vir sem valor. Só o registro das
 * 07h vale para o boletim: a leitura das 07h fica em boletim_ribeira_leituras
 * (fonte 'copel'), o que dá o valor de ontem antes das 07h de hoje e a última
 * medição válida quando a Copel não responder.
 */
const COPEL_PONTO = 32;
const COPEL_URL = `https://www.copel.com/mhbweb/api/service/v1/historico?ponto=${COPEL_PONTO}&dias=2`;
export const FONTE_COPEL = 'Copel — Monitoramento Hidrológico de Bacias';

type RegistroCopel = { em: number; volume: number | null; nivel: number | null };

const esquemaCopel = z.array(z.looseObject({ data: z.string(), volumeUtil: z.number().nullable().optional(), nivel: z.number().nullable().optional() }));

/** Registros de hoje da Copel, com cache de 10 min (o mesmo do tempo real do SIBH). */
async function registrosCopel(): Promise<RegistroCopel[] | null> {
  const l = await lembrar(SERVICO, `copel:${COPEL_PONTO}`, TTL_RECENTE, async () => {
    const r = esquemaCopel.safeParse(await buscarJson(COPEL_URL, { timeoutMs: 20_000 }));
    if (!r.success) throw new Error('formato inesperado da Copel');
    const lista = r.data.flatMap((x) => {
      const em = Date.parse(x.data); // vem com o fuso (-03:00)
      return Number.isFinite(em) ? [{ em, volume: x.volumeUtil ?? null, nivel: x.nivel ?? null }] : [];
    });
    return lista.length ? lista : null;
  });
  return l?.valor ?? null;
}

type Copel07 = { valor: number; nivel: number | null; lidoEm: number };

async function copelGuardada(dia: string): Promise<Copel07 | null> {
  try {
    const r = await query<{ volume: string | null; nivel: string | null; lido_em: Date | null }>(
      `SELECT volume, nivel, lido_em FROM boletim_ribeira_leituras WHERE fonte = 'copel' AND ponto = $1 AND dia = $2::date`,
      [String(COPEL_PONTO), dia],
    );
    const l = r[0];
    const valor = numero(l?.volume);
    return l && valor !== null && l.lido_em ? { valor, nivel: numero(l.nivel), lidoEm: l.lido_em.getTime() } : null;
  } catch (e) {
    log.warn('boletim_ribeira_copel_reserva', { erro: erroSeguro(e) });
    return null;
  }
}

/** Última leitura das 07h guardada antes de `dia` (para "última medição válida"). */
async function copelAnterior(dia: string): Promise<Copel07 | null> {
  try {
    const r = await query<{ volume: string; lido_em: Date }>(
      `SELECT volume, lido_em FROM boletim_ribeira_leituras
        WHERE fonte = 'copel' AND ponto = $1 AND dia < $2::date AND volume IS NOT NULL AND lido_em IS NOT NULL
        ORDER BY dia DESC LIMIT 1`,
      [String(COPEL_PONTO), dia],
    );
    const l = r[0];
    return l ? { valor: Number(l.volume), nivel: null, lidoEm: l.lido_em.getTime() } : null;
  } catch {
    return null;
  }
}

async function guardarCopel(dia: string, l: Copel07): Promise<void> {
  try {
    await query(
      `INSERT INTO boletim_ribeira_leituras (fonte, ponto, dia, nivel, volume, lido_em)
       VALUES ('copel', $1, $2::date, $3, $4, $5)
       ON CONFLICT (fonte, ponto, dia) DO UPDATE
         SET nivel = EXCLUDED.nivel, volume = EXCLUDED.volume, lido_em = EXCLUDED.lido_em, gravado_em = now()
       WHERE boletim_ribeira_leituras.volume IS DISTINCT FROM EXCLUDED.volume`,
      [String(COPEL_PONTO), dia, l.nivel, l.valor, new Date(l.lidoEm)],
    );
  } catch (e) {
    log.warn('boletim_ribeira_copel_gravar', { erro: erroSeguro(e) });
  }
}

/** Volume útil das 07h do dia operacional (`ref.dia`). Nunca lança. */
export async function volumeCopel(ref: Periodo): Promise<VolumeCopel> {
  if (ref.personalizado) return volumeCopelHora(ref.t07);
  const [registros, guardada] = await Promise.all([registrosCopel().catch(() => null), copelGuardada(ref.dia)]);
  // Só o registro das 07h exatas (com valor): outro horário não substitui.
  const r07 = registros?.find((r) => Math.abs(r.em - ref.t07) < 60_000 && r.volume !== null);
  if (r07) {
    const l = { valor: r07.volume!, nivel: r07.nivel, lidoEm: r07.em };
    if (guardada?.valor !== l.valor) await guardarCopel(ref.dia, l);
    return { estado: 'ok', valor: l.valor, lidoEm: l.lidoEm };
  }
  if (guardada) return { estado: 'ok', valor: guardada.valor, lidoEm: guardada.lidoEm };
  // A Copel respondeu, mas a série ainda não chegou às 07h ou o registro das 07h ainda está sem valor: publicação atrasada.
  if (registros && (Math.max(...registros.map((r) => r.em)) < ref.t07 || registros.some((r) => Math.abs(r.em - ref.t07) < 60_000))) return { estado: 'aguardando' };
  const anterior = await copelAnterior(ref.dia);
  const motivo = !registros
    ? 'A Copel não respondeu agora.'
    : Math.min(...registros.map((r) => r.em)) > ref.t07
      ? 'A Copel só disponibiliza o dia corrente e o registro das 07h deste dia não foi guardado a tempo.'
      : 'A Copel não publicou o registro das 07h deste dia.';
  return {
    estado: 'indisponivel',
    motivo,
    ultima: anterior ? { valor: anterior.valor, lidoEm: anterior.lidoEm } : null,
  };
}

/**
 * Período escolhido: o registro da hora cheia do fim (a Copel publica de hora
 * em hora e só o dia corrente). Nada é gravado: a reserva é só das 07h.
 */
async function volumeCopelHora(fim: number): Promise<VolumeCopel> {
  const alvo = Math.floor(fim / HORA) * HORA;
  const registros = await registrosCopel().catch(() => null);
  const r = registros?.find((x) => Math.abs(x.em - alvo) < 60_000 && x.volume !== null);
  if (r) return { estado: 'ok', valor: r.volume!, lidoEm: r.em };
  // a série ainda não chegou a essa hora, ou a hora já está lá mas sem valor (a mais recente vem vazia)
  if (registros && (Math.max(...registros.map((x) => x.em)) < alvo || registros.some((x) => Math.abs(x.em - alvo) < 60_000))) return { estado: 'aguardando' };
  const motivo = !registros
    ? 'A Copel não respondeu agora.'
    : Math.min(...registros.map((x) => x.em)) > alvo
      ? 'A Copel só disponibiliza o dia corrente: não há registro para a data escolhida.'
      : 'A Copel não publicou o registro deste horário.';
  return { estado: 'indisponivel', motivo, ultima: null };
}

/** Até 3h de defasagem: a Copel publica de hora em hora e a hora mais recente costuma vir vazia. */
const COPEL_DEFASAGEM = 3 * HORA;

/**
 * Sumário emitido (sumario_executivo_ribeira_iguape.html): o registro mais
 * recente com valor até `ref` (Referência 2), com até 3h de defasagem. Para
 * datas anteriores a hoje, só a leitura das 07h guardada daquele dia. Nunca lança.
 */
export async function volumeCopelAte(ref: number): Promise<VolumeCopel> {
  const dia = paraCampo(ref).slice(0, 10);
  const [registros, guardada] = await Promise.all([registrosCopel().catch(() => null), copelGuardada(dia)]);
  const r = registros?.filter((x) => x.volume !== null && x.em <= ref + 60_000).sort((a, b) => a.em - b.em).at(-1);
  if (r && ref - r.em <= COPEL_DEFASAGEM) return { estado: 'ok', valor: r.volume!, lidoEm: r.em };
  if (guardada && guardada.lidoEm <= ref + 60_000 && ref - guardada.lidoEm <= COPEL_DEFASAGEM) return { estado: 'ok', valor: guardada.valor, lidoEm: guardada.lidoEm };
  const anterior = await copelAnterior(dia);
  const motivo = !registros
    ? 'A Copel não respondeu agora.'
    : Math.min(...registros.map((x) => x.em)) > ref
      ? 'A Copel só disponibiliza o dia corrente: não há registro para a data escolhida.'
      : 'A Copel não publicou registro nas 3h anteriores a este horário.';
  return { estado: 'indisponivel', motivo, ultima: anterior ? { valor: anterior.valor, lidoEm: anterior.lidoEm } : null };
}

// ---------------------------------------------------------------- chuva na UGRHI 11

export type Chuva = { ultimas3h: number | null; ultimas24h: number | null; previsao24h: number | null; postos: number; pontosPrevisao: number };

/** Chuva média acumulada nas `horas` que terminam na Referência 2 (from_date = fim da janela). */
async function mediaChuva(horas: 3 | 24, ref: Periodo): Promise<{ media: number; postos: number } | null> {
  const ate = new Date(ref.t07).toISOString().slice(0, 19);
  const l = await lembrar(SERVICO, `chuva:${horas}h:${chavePeriodo(ref)}`, ref.agora >= ref.t07 + 2 * HORA ? 6 * 3600 : TTL.tempoReal, async () => {
    const j = (await buscarSibh(`measurements/now?station_type_id=2&hours=${horas}&from_date=${ate}Z`)) as { measurements?: { station_prefix_id?: unknown; value?: unknown }[] };
    if (!Array.isArray(j.measurements)) throw new Error('resposta do SIBH sem "measurements"');
    const valores = j.measurements.filter((m) => PLUVIOMETRICAS_UGRHI11.has(String(m.station_prefix_id))).flatMap((m) => {
      const v = numero(m.value);
      return v === null ? [] : [Math.max(0, v)];
    });
    return valores.length ? { media: valores.reduce((a, b) => a + b, 0) / valores.length, postos: valores.length } : null;
  });
  return l?.valor ?? null;
}

const horaLocalIso = (t: number) => new Date(t - 3 * HORA).toISOString().slice(0, 13) + ':00';

/** Chuva média prevista (Open-Meteo) nas 24 h seguintes à Referência 2, na grade da UGRHI 11. */
async function previsao(ref: Periodo): Promise<{ media: number; pontos: number } | null> {
  const l = await lembrar('previsao', `ugrhi11-24h-boletim-ribeira:${chavePeriodo(ref)}`, TTL.hora, async () => {
    const base = ref.t07;
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${GRADE_PREVISAO_UGRHI11.map((p) => p[0]).join(',')}&longitude=${GRADE_PREVISAO_UGRHI11.map((p) => p[1]).join(',')}` +
      `&hourly=precipitation&timezone=America%2FSao_Paulo&start_hour=${horaLocalIso(base + HORA)}&end_hour=${horaLocalIso(base + 24 * HORA)}`;
    const j = await buscarJson(url, { timeoutMs: 30_000 });
    const locais = (Array.isArray(j) ? j : [j]) as { hourly?: { precipitation?: (number | null)[] } }[];
    const somas = locais
      .map((p) => p.hourly?.precipitation ?? [])
      .filter((s) => s.some((v) => v !== null))
      .map((s) => s.reduce<number>((a, v) => a + (v ?? 0), 0));
    return somas.length ? { media: somas.reduce((a, b) => a + b, 0) / somas.length, pontos: somas.length } : null;
  });
  return l?.valor ?? null;
}

/** Chuva do período fechado: observada até as 07h do dia e prevista para as 24 h seguintes. */
export async function chuva(ref: Periodo): Promise<Dado<Chuva>> {
  const [c3, c24, prev] = await Promise.all([mediaChuva(3, ref), mediaChuva(24, ref), previsao(ref).catch(() => null)]);
  if (!c3 && !c24 && !prev) return comoDado('SIBH — SP Águas / Open-Meteo', null);
  return {
    ok: true,
    fonte: 'SIBH — SP Águas / Open-Meteo',
    obtidoEm: new Date(),
    desatualizado: false,
    dados: {
      ultimas3h: c3 ? arred(c3.media, 1) : null,
      ultimas24h: c24 ? arred(c24.media, 1) : null,
      previsao24h: prev ? arred(prev.media, 1) : null,
      postos: c24?.postos ?? c3?.postos ?? 0,
      pontosPrevisao: prev?.pontos ?? 0,
    },
  };
}

// ---------------------------------------------------------------- coleta em segundo plano

/**
 * Busca tudo e grava as 07h, sem depender de visitas (chamada pelo
 * instrumentation.ts a cada 10 min); deixa o cache pronto para a página e o
 * PDF. Falhas vão para o log. Nunca lança.
 */
export async function coletar(): Promise<void> {
  const inicio = performance.now();
  const ref = referencias();
  const r = await Promise.allSettled([niveis(ref), estruturas(ref), chuva(ref)]);
  await volumeCopel(ref); // grava as 07h da Copel (nunca lança)
  const fontes = r.map((x) => (x.status === 'fulfilled' ? (x.value.ok ? 'ok' : x.value.mensagem) : 'erro'));
  for (const [i, x] of r.entries()) {
    if (x.status === 'rejected') log.warn('boletim_ribeira_coleta', { bloco: ['niveis', 'estruturas', 'chuva'][i], erro: erroSeguro(x.reason) });
    else if (!x.value.ok) log.warn('boletim_ribeira_fonte_indisponivel', { bloco: ['niveis', 'estruturas', 'chuva'][i], mensagem: x.value.mensagem });
  }
  // Uma linha por subida do servidor, para conferir no log que a coleta está ativa.
  const g = globalThis as { __ssapColetaRibeiraAtiva?: boolean };
  if (!g.__ssapColetaRibeiraAtiva) {
    g.__ssapColetaRibeiraAtiva = true;
    log.info('boletim_ribeira_coleta_ativa', { ms: Math.round(performance.now() - inicio), niveis: fontes[0], estruturas: fontes[1], chuva: fontes[2] });
  }
}
