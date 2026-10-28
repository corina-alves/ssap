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
 *   Copel       volume útil do Capivari: sem fonte autorizada (ver volumeCopel)
 * O dia operacional e as 07h são os do sumário automático do Tietê/Pinheiros.
 * As leituras das 07h ficam também em boletim_ribeira_leituras (reserva).
 * Cada fonte falha sozinha: a página e o PDF mostram o que as outras trouxeram.
 */

const SERVICO = 'boletim_ribeira';
export const FONTE_SIBH = 'SIBH — SP Águas';
const HORA = 3_600_000;
/** Os dados de tempo real ficam guardados 10 min: o mesmo intervalo da coleta e da transmissão dos postos. */
const TTL_RECENTE = 600;

export { referencias, type Referencias };

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

/** Série recente (25 h: cobre as 07h do dia operacional) de vários postos. */
async function recentes(chave: string, ids: number[], ref: Referencias): Promise<Medicao[] | null> {
  const m = await medicoes(SERVICO, { [chave]: { ids, ini: ref.agora - 25 * HORA, fim: ref.agora, grupo: 'minute', ttlSeg: TTL_RECENTE } });
  return m[chave] ?? null;
}

// ---------------------------------------------------------------- os 8 pontos

export type Niveis = { pontos: PontoRibeira[]; atualizadoEm: number | null };

export async function niveis(ref: Referencias): Promise<Dado<Niveis>> {
  const ids = ESTACOES_RIBEIRA.map((e) => e.id);
  const [med, cotas, guardadas] = await Promise.all([recentes('pontos', ids, ref), cotasAlerta(SERVICO, ids), guardadas07(ref.dia)]);
  if (!med) return comoDado(FONTE_SIBH, null);

  const series = new Map(ids.map((id) => [id, serieDoPosto(med, id)]));
  const pontos = ESTACOES_RIBEIRA.map((e) => {
    const g = guardadas.get(String(e.id));
    return montarPonto(e, series.get(e.id)!, cotas?.[String(e.id)] ?? null, ref.t07, ref.agora, g ? { nivel: g.nivel, em: g.em } : null);
  });

  // Em extravasamento desde antes das 25 h consultadas: procura a entrada nos 7 dias anteriores (por hora).
  const longos = pontos.filter((p) => p.desde && 'antesDe' in p.desde && p.cotas);
  if (longos.length) {
    const chave = `semana:${longos.map((p) => p.id).join(',')}`;
    const fim = Math.min(...longos.map((p) => series.get(p.id)![0]?.em ?? ref.agora));
    const semana = (await medicoes(SERVICO, { [chave]: { ids: longos.map((p) => p.id), ini: ref.agora - 7 * 24 * HORA, fim, grupo: 'hour', ttlSeg: 1800 } }))[chave] ?? null;
    if (semana) {
      for (const p of longos) {
        const curta = series.get(p.id)!.filter((l) => l.em <= p.atualEm!);
        const antes = serieDoPosto(semana, p.id).filter((l) => l.em < (curta[0]?.em ?? Infinity));
        p.desde = inicioDaSituacao([...antes, ...curta], p.cotas!, p.situacao);
      }
    }
  }

  await guardar07(
    ref.dia,
    ids.flatMap((id) => {
      const l = maisProxima(series.get(id)!, ref.t07, TOLERANCIA_07H);
      return l ? [{ ponto: String(id), l }] : [];
    }),
    guardadas,
  );

  const atualizadoEm = Math.max(0, ...pontos.map((p) => p.atualEm ?? 0)) || null;
  return {
    ok: true,
    fonte: FONTE_SIBH,
    obtidoEm: new Date(),
    // reserva do cache ou postos parados: a leitura mais nova tem mais de 1 h
    desatualizado: atualizadoEm === null || ref.agora - atualizadoEm > ATRASO,
    dados: { pontos, atualizadoEm },
  };
}

// ---------------------------------------------------------------- barramentos e Capivari

export type LeituraBarramento = Barramento & {
  anterior: number | null;
  atual: number | null;
  atualEm: number | null;
  variacao: number | null;
  tendencia: Tendencia | null;
  /** vazão defluente no posto de jusante (m³/s) */
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

export async function estruturas(ref: Referencias): Promise<Dado<Estruturas>> {
  const ids = [...new Set([...BARRAMENTOS.flatMap((b) => (b.jusanteId === null ? [b.id] : [b.id, b.jusanteId])), CAPIVARI.id])];
  const med = await recentes('estruturas', ids, ref);
  if (!med) return comoDado(FONTE_SIBH, null);
  const guardadas = await guardadas07(ref.dia);

  const lidas07: { ponto: string; l: Leitura }[] = [];
  const doPosto = (id: number) => {
    const serie = serieDoPosto(med, id);
    const l07 = maisProxima(serie, ref.t07, TOLERANCIA_07H);
    if (l07) lidas07.push({ ponto: String(id), l: l07 });
    const g = guardadas.get(String(id));
    return { l07: l07 ?? (g ? { nivel: g.nivel, vazao: g.vazao, em: g.em ?? ref.t07 } : null), agora: ultima(serie, ref.agora) };
  };

  const barramentos = BARRAMENTOS.map((b): LeituraBarramento => {
    const { l07, agora } = doPosto(b.id);
    const variacao = dif(agora?.nivel ?? null, l07?.nivel ?? null);
    const jus = b.jusanteId === null ? null : ultima(serieDoPosto(med, b.jusanteId), ref.agora);
    return { ...b, anterior: l07?.nivel ?? null, atual: agora?.nivel ?? null, atualEm: agora?.em ?? null, variacao, tendencia: tendencia(variacao), jusante: jus?.vazao ?? null };
  });

  const c = doPosto(CAPIVARI.id);
  const capivari: Capivari = {
    cota: c.agora?.nivel ?? null,
    cotaEm: c.agora?.em ?? null,
    vazao: c.agora?.vazao ?? null,
    variacaoCota: dif(c.agora?.nivel ?? null, c.l07?.nivel ?? null),
    variacaoVazao: dif(c.agora?.vazao ?? null, c.l07?.vazao ?? null),
  };

  await guardar07(ref.dia, lidas07, guardadas);
  return { ok: true, fonte: FONTE_SIBH, obtidoEm: new Date(), desatualizado: false, dados: { barramentos, capivari } };
}

// ---------------------------------------------------------------- Copel

/**
 * Volume útil do Capivari (Copel, registro das 07h). Investigado em 28/10/2026:
 * a página pública do MHB (bacia-atlantico-sudeste.jsf) carrega os valores por
 * postbacks internos do JSF/PrimeFaces, sem API nem serviço de dados públicos;
 * o acesso aos dados é pela "Solicitação de dados hidrológicos" da própria
 * Copel. Simular esses postbacks não é integração autorizada, então o campo
 * fica indisponível até haver uma fonte autorizada — e nunca é preenchido à mão.
 */
export function volumeCopel(): VolumeCopel {
  return {
    estado: 'indisponivel',
    motivo: 'A Copel não oferece API nem serviço público de dados para consulta automática; o volume útil das 07h aparecerá aqui quando houver uma integração autorizada.',
    ultima: null,
  };
}

// ---------------------------------------------------------------- chuva na UGRHI 11

export type Chuva = { ultimas3h: number | null; ultimas24h: number | null; previsao24h: number | null; postos: number; pontosPrevisao: number };

async function mediaChuva(horas: 3 | 24): Promise<{ media: number; postos: number } | null> {
  const l = await lembrar(SERVICO, `chuva:${horas}h`, TTL.tempoReal, async () => {
    const j = (await buscarSibh(`measurements/now?station_type_id=2&hours=${horas}`)) as { measurements?: { station_prefix_id?: unknown; value?: unknown }[] };
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

/** Chuva média prevista (Open-Meteo) nas 24 h seguintes à hora cheia atual, na grade da UGRHI 11. */
async function previsao(): Promise<{ media: number; pontos: number } | null> {
  const l = await lembrar('previsao', 'ugrhi11-24h-boletim-ribeira', TTL.hora, async () => {
    const base = Math.floor(Date.now() / HORA) * HORA;
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

export async function chuva(): Promise<Dado<Chuva>> {
  const [c3, c24, prev] = await Promise.all([mediaChuva(3), mediaChuva(24), previsao().catch(() => null)]);
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
  const r = await Promise.allSettled([niveis(ref), estruturas(ref), chuva()]);
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
