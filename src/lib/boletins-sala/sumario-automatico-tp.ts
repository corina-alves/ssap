import {
  BARRAGEM_MOVEL,
  BARRAGEM_PENHA,
  ESTACOES,
  GRADE_PREVISAO_RMSP,
  MAPA_PLANILHA,
  OFFSET_IGG,
  RMSP_COD_IBGE,
  vazaoPenha,
  volumeUtil,
  type Estacao,
} from '@/conteudo/sumario-automatico-tp';
import { query } from '../db';
import { lembrar, TTL } from '../integracoes/cache';
import { comoDado, hojeSp, somarDias, type Dado } from '../integracoes/comum';
import { planilhaEmae } from '../integracoes/emae';
import { arred, buscarJson, numero } from '../integracoes/http';
import { buscarSibh, cotasAlerta, instante, medicoes, type Cotas, type Medicao } from '../integracoes/sibh-medicoes';
import { erroSeguro, log } from '../log';

/**
 * Sumário Executivo Automático — Alto Tietê / Pinheiros. Mesmas regras do
 * sumário tradicional (que não muda), com os dados buscados no servidor:
 *   SIBH        níveis, cotas de referência, comportas e chuva da RMSP
 *   Open-Meteo  previsão de chuva nas próximas 24 h na RMSP
 *   EMAE        planilha horária das estruturas (OneDrive, via Microsoft Graph)
 * As leituras das 07h ficam em sumario_tp_leituras (comparação ontem × hoje).
 * Cada fonte falha sozinha: a página mostra o que as outras trouxeram.
 */

const SERVICO = 'sumario_tp';
const SIBH_V1 = 'https://apps.spaguas.sp.gov.br/sibh/api/v1/';
const HORA = 3_600_000;

// ---------------------------------------------------------------- horários

export type Referencias = {
  /** Dia operacional (AAAA-MM-DD): o de hoje a partir das 07h; antes disso, o de ontem. */
  dia: string;
  ontem: string;
  t07: number;
  t07Ontem: number;
  agora: number;
};

const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' });
/** 07h de Brasília em UTC (sem horário de verão desde 2019). */
const as07 = (dia: string) => Date.parse(`${dia}T10:00:00Z`);

export function referencias(agora = Date.now()): Referencias {
  const hoje = hojeSp();
  const dia = Number(fmtHora.format(agora)) >= 7 ? hoje : somarDias(hoje, -1);
  const ontem = somarDias(dia, -1);
  return { dia, ontem, t07: as07(dia), t07Ontem: as07(ontem), agora };
}

// ---------------------------------------------------------------- classificação

export const SITUACOES = ['NORMAL', 'ATENÇÃO', 'ALERTA', 'EMERGÊNCIA', 'EXTRAVASAMENTO'] as const;
export type Situacao = (typeof SITUACOES)[number];

/** Classificação pelos 5 níveis de referência do SIBH (a mesma do sumário tradicional). */
export function classificar(nivel: number | null, c: Cotas | null): Situacao {
  if (nivel === null || !c) return 'NORMAL';
  if (c.extravasamento !== null && nivel >= c.extravasamento) return 'EXTRAVASAMENTO';
  if (c.emergencia !== null && nivel >= c.emergencia) return 'EMERGÊNCIA';
  if (c.alerta !== null && nivel >= c.alerta) return 'ALERTA';
  if (c.atencao !== null && nivel >= c.atencao) return 'ATENÇÃO';
  return 'NORMAL';
}

// ---------------------------------------------------------------- histórico das 07h

type Leitura07 = { ponto: string; nivel: number | null; vazao: number | null; lidoEm: number | null };

async function historico07(fonte: 'sibh' | 'emae', dias: string[]): Promise<Map<string, Leitura07>> {
  const mapa = new Map<string, Leitura07>();
  try {
    const linhas = await query<{ ponto: string; dia: string; nivel: string | null; vazao: string | null; lido_em: Date | null }>(
      `SELECT ponto, to_char(dia, 'YYYY-MM-DD') AS dia, nivel, vazao, lido_em FROM sumario_tp_leituras WHERE fonte = $1 AND dia = ANY($2::date[])`,
      [fonte, dias],
    );
    for (const l of linhas) {
      mapa.set(`${l.dia}|${l.ponto}`, { ponto: l.ponto, nivel: numero(l.nivel), vazao: numero(l.vazao), lidoEm: l.lido_em?.getTime() ?? null });
    }
  } catch (e) {
    log.warn('sumario_tp_historico_indisponivel', { erro: erroSeguro(e) }); // sem banco, segue só com as fontes
  }
  return mapa;
}

/** Grava as leituras das 07h que ainda não estão no histórico (ou mudaram). Nunca lança. */
async function gravar07(fonte: 'sibh' | 'emae', dia: string, leituras: Leitura07[], jaGravado: Map<string, Leitura07>): Promise<void> {
  const novas = leituras.filter((l) => {
    const g = jaGravado.get(`${dia}|${l.ponto}`);
    return l.nivel !== null && (!g || g.nivel !== l.nivel || g.vazao !== l.vazao);
  });
  if (!novas.length) return;
  try {
    await query(
      `INSERT INTO sumario_tp_leituras (fonte, ponto, dia, nivel, vazao, lido_em)
       SELECT $1, x.ponto, $2::date, x.nivel, x.vazao, x.lido_em
         FROM unnest($3::text[], $4::numeric[], $5::numeric[], $6::timestamptz[]) AS x(ponto, nivel, vazao, lido_em)
       ON CONFLICT (fonte, ponto, dia) DO UPDATE
          SET nivel = EXCLUDED.nivel, vazao = EXCLUDED.vazao, lido_em = EXCLUDED.lido_em, gravado_em = now()`,
      [
        fonte,
        dia,
        novas.map((l) => l.ponto),
        novas.map((l) => l.nivel),
        novas.map((l) => l.vazao),
        novas.map((l) => (l.lidoEm === null ? null : new Date(l.lidoEm))),
      ],
    );
  } catch (e) {
    log.warn('sumario_tp_historico_gravacao', { fonte, dia, erro: erroSeguro(e) });
  }
}

// ---------------------------------------------------------------- SIBH: níveis

export type Ponto = Estacao & {
  cotas: Cotas | null;
  h7Ontem: number | null;
  h7Hoje: number | null;
  atual: number | null;
  atualEm: number | null;
  /** 07h de hoje − 07h de ontem */
  variacao24h: number | null;
  /** agora − 07h de hoje */
  desde07: number | null;
  /** agora − cota de extravasamento */
  acima: number | null;
  situacao: Situacao;
};

export type Niveis = { pontos: Ponto[]; atualizadoEm: number | null };

/** Leitura mais próxima do alvo, dentro da tolerância: [nível em m, instante]. */
function proxima(med: Medicao[] | null, id: string, alvo: number, tolerancia: number): [number, number] | null {
  let melhor: [number, number] | null = null;
  let dif = Infinity;
  for (const [i, d, v] of med ?? []) {
    if (i !== id || v === null) continue;
    const t = instante(d);
    const x = Math.abs(t - alvo);
    if (x <= tolerancia && x < dif) {
      dif = x;
      melhor = [arred(v / 100, 3), t];
    }
  }
  return melhor;
}

// "|| 0": sem −0 (que sairia como "-0,00")
const dif = (a: number | null, b: number | null) => (a === null || b === null ? null : arred(a - b, 2) || 0);

export async function niveis(ref: Referencias): Promise<Dado<Niveis>> {
  const ids = ESTACOES.map((e) => e.id);
  const meia = 30 * 60_000;
  // Janela das 07h fechada há mais de 2 h não muda: fica guardada; a de hoje, 5 min.
  const ttl07 = (t: number) => (ref.agora > t + 2 * HORA ? 7 * 86_400 : 300);
  const [med, cotas, hist] = await Promise.all([
    medicoes(SERVICO, {
      [`h7:${ref.ontem}`]: { ids, ini: ref.t07Ontem - meia, fim: ref.t07Ontem + meia, grupo: 'minute', ttlSeg: ttl07(ref.t07Ontem) },
      [`h7:${ref.dia}`]: { ids, ini: ref.t07 - meia, fim: ref.t07 + meia, grupo: 'minute', ttlSeg: ttl07(ref.t07) },
      // chave fixa: o período é o das últimas 6 h no momento da busca
      recente: { ids, ini: ref.agora - 6 * HORA, fim: ref.agora, grupo: 'minute', ttlSeg: 300 },
    }),
    cotasAlerta(SERVICO, ids),
    historico07('sibh', [ref.ontem, ref.dia]),
  ]);
  const m7Ontem = med[`h7:${ref.ontem}`] ?? null;
  const m7Hoje = med[`h7:${ref.dia}`] ?? null;
  const recente = med.recente ?? null;
  if (!m7Ontem && !m7Hoje && !recente) return comoDado('SIBH — SP Águas', null);

  const pontos = ESTACOES.map((e): Ponto => {
    const id = String(e.id);
    const doDia = (m: Medicao[] | null, t: number, dia: string) => proxima(m, id, t, meia)?.[0] ?? hist.get(`${dia}|${id}`)?.nivel ?? null;
    const h7Ontem = doDia(m7Ontem, ref.t07Ontem, ref.ontem);
    const h7Hoje = doDia(m7Hoje, ref.t07, ref.dia);
    const ult = proxima(recente, id, ref.agora, 6 * HORA);
    const c = cotas?.[id] ?? null;
    const atual = ult?.[0] ?? null;
    return {
      ...e,
      cotas: c,
      h7Ontem,
      h7Hoje,
      atual,
      atualEm: ult?.[1] ?? null,
      variacao24h: dif(h7Hoje, h7Ontem),
      desde07: dif(atual, h7Hoje),
      acima: dif(atual, c?.extravasamento ?? null),
      situacao: classificar(atual, c),
    };
  });

  // Histórico: grava as 07h que vieram do SIBH e ainda não estão no banco.
  const lidas = (m: Medicao[] | null, t: number) =>
    ESTACOES.flatMap((e) => {
      const p = proxima(m, String(e.id), t, meia);
      return p ? [{ ponto: String(e.id), nivel: p[0], vazao: null, lidoEm: p[1] }] : [];
    });
  await Promise.all([gravar07('sibh', ref.ontem, lidas(m7Ontem, ref.t07Ontem), hist), gravar07('sibh', ref.dia, lidas(m7Hoje, ref.t07), hist)]);

  const atualizadoEm = Math.max(0, ...pontos.map((p) => p.atualEm ?? 0)) || null;
  return { ok: true, fonte: 'SIBH — SP Águas', obtidoEm: new Date(), desatualizado: false, dados: { pontos, atualizadoEm } };
}

// ---------------------------------------------------------------- SIBH: comportas

export type Comportas = {
  penha: { abertas: number; total: number } | null;
  movel: { superficie: { abertas: number; total: number }; fundo: { abertas: number; total: number } } | null;
};

type Barragem = { id?: number; last_event?: { options?: { gates?: Record<string, { id?: unknown; status?: unknown }> } }[] };

/** Último evento de comportas da Penha e da Barragem Móvel (API v1 /dams). "F…" = comporta de fundo. */
export async function comportas(): Promise<Dado<Comportas>> {
  const l = await lembrar(SERVICO, 'comportas', 300, async () => {
    const j = await buscarJson(`${SIBH_V1}dams?ids[]=${BARRAGEM_PENHA}&ids[]=${BARRAGEM_MOVEL}&with_last_event=true&custom_fields[]=last_event`, { timeoutMs: 30_000 });
    if (!Array.isArray(j)) throw new Error('resposta inesperada do SIBH (dams)');
    const contar = (b: Barragem | undefined) => {
      const gates = Object.values(b?.last_event?.[0]?.options?.gates ?? {}).map((g) => ({ fundo: String(g.id ?? '').toUpperCase().startsWith('F'), aberta: String(g.status) === 'true' }));
      if (!gates.length) return null;
      const grupo = (fundo: boolean) => {
        const gs = gates.filter((g) => g.fundo === fundo);
        return { abertas: gs.filter((g) => g.aberta).length, total: gs.length };
      };
      return { superficie: grupo(false), fundo: grupo(true) };
    };
    const penha = contar((j as Barragem[]).find((b) => b.id === BARRAGEM_PENHA));
    const movel = contar((j as Barragem[]).find((b) => b.id === BARRAGEM_MOVEL));
    return { penha: penha?.superficie ?? null, movel };
  });
  return comoDado('SIBH — SP Águas', l);
}

// ---------------------------------------------------------------- chuva e previsão na RMSP

export type Chuva = { ultimas3h: number | null; ultimas24h: number | null; previsao24h: number | null; postos: number };

async function mediaChuvaRmsp(horas: 3 | 24): Promise<{ media: number; postos: number } | null> {
  const l = await lembrar(SERVICO, `chuva:${horas}h`, TTL.tempoReal, async () => {
    const j = (await buscarSibh(`measurements/now?station_type_id=2&hours=${horas}`)) as { measurements?: { cod_ibge?: unknown; value?: unknown }[] };
    if (!Array.isArray(j.measurements)) throw new Error('resposta do SIBH sem "measurements"');
    const valores = j.measurements.filter((m) => RMSP_COD_IBGE.has(String(m.cod_ibge))).flatMap((m) => {
      const v = numero(m.value);
      return v === null ? [] : [Math.max(0, v)];
    });
    return valores.length ? { media: valores.reduce((a, b) => a + b, 0) / valores.length, postos: valores.length } : null;
  });
  return l?.valor ?? null;
}

const horaLocalIso = (t: number) => new Date(t - 3 * HORA).toISOString().slice(0, 13) + ':00';

/** Chuva média prevista (Open-Meteo) nas 24 h seguintes à hora cheia atual, na grade da RMSP. */
async function previsaoRmsp(): Promise<number | null> {
  const l = await lembrar('previsao', 'rmsp-24h-sumario-tp', TTL.hora, async () => {
    const base = Math.floor(Date.now() / HORA) * HORA;
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${GRADE_PREVISAO_RMSP.map((p) => p[0]).join(',')}&longitude=${GRADE_PREVISAO_RMSP.map((p) => p[1]).join(',')}` +
      `&hourly=precipitation&timezone=America%2FSao_Paulo&start_hour=${horaLocalIso(base + HORA)}&end_hour=${horaLocalIso(base + 24 * HORA)}`;
    const j = await buscarJson(url, { timeoutMs: 20_000 });
    const locais = (Array.isArray(j) ? j : [j]) as { hourly?: { precipitation?: (number | null)[] } }[];
    const somas = locais
      .map((p) => p.hourly?.precipitation ?? [])
      .filter((s) => s.some((v) => v !== null))
      .map((s) => s.reduce<number>((a, v) => a + (v ?? 0), 0));
    return somas.length ? somas.reduce((a, b) => a + b, 0) / somas.length : null;
  });
  return l?.valor ?? null;
}

export async function chuva(): Promise<Dado<Chuva>> {
  const [c3, c24, prev] = await Promise.all([mediaChuvaRmsp(3), mediaChuvaRmsp(24), previsaoRmsp().catch(() => null)]);
  if (!c3 && !c24 && prev === null) return comoDado('SIBH — SP Águas / Open-Meteo', null);
  return {
    ok: true,
    fonte: 'SIBH — SP Águas / Open-Meteo',
    obtidoEm: new Date(),
    desatualizado: false,
    dados: { ultimas3h: c3 ? arred(c3.media, 1) : null, ultimas24h: c24 ? arred(c24.media, 1) : null, previsao24h: prev === null ? null : arred(prev, 1), postos: c24?.postos ?? c3?.postos ?? 0 },
  };
}

// ---------------------------------------------------------------- EMAE: estruturas

export type Estrutura = {
  nome: string;
  /** cota atual, já no referencial IGG (m) */
  cota: number | null;
  volumePct: number | null;
  vazao: number | null;
  /** agora − 07h de hoje */
  desde07: number | null;
  /** 07h de hoje − 07h de ontem */
  variacao24h: number | null;
};

export type Emae = {
  /** Hora (0–23) da última linha preenchida da planilha. */
  hora: number | null;
  estruturas: Record<string, Estrutura>;
  operacao: { retiro: string | null; usinaSp: string | null; pedreira: string | null };
};

const numeroPlanilha = (t: string | undefined) => {
  const s = String(t ?? '').trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

/**
 * Linhas horárias da planilha, na ordem do dia (07h … 24h, 01h … 07h): hora na
 * 1ª coluna e ao menos um valor numérico (a mesma regra do CSV do sumário tradicional).
 */
export function linhasHorarias(linhas: string[][]): { hora: number; celulas: string[] }[] {
  return linhas.flatMap((l) => {
    const h = String(l[0] ?? '').trim();
    if (!/^\d{1,2}(\.0+)?$/.test(h) || !l.slice(1, 30).some((c) => numeroPlanilha(c) !== null)) return [];
    return [{ hora: Number(h) % 24, celulas: l }];
  });
}

/** Regras da situação operacional, as mesmas do sumário tradicional. */
const statusBomba = (q: number | null) => (q === null || q > 0 ? null : q < 0 ? 'Bombeamento ligado' : 'Bombeamento desligado');
const statusRetiro = (q: number | null) => (q === null ? null : q !== 0 ? 'Parcialmente aberta' : 'Totalmente fechada');

export async function emae(ref: Referencias): Promise<Dado<Emae>> {
  const p = await planilhaEmae();
  if (!p.ok) return p;
  const horas = linhasHorarias(p.dados);
  const atual = horas.at(-1);
  if (!atual) return { ok: false, fonte: p.fonte, mensagem: 'A planilha da EMAE ainda não tem leituras hoje.' };
  // A 1ª linha das 07h é a abertura do dia operacional (a última 07h, se houver, já é a do dia seguinte).
  const linha07 = horas.find((h) => h.hora === 7) ?? null;
  const hist = await historico07('emae', [ref.ontem, ref.dia]);

  const estruturas: Record<string, Estrutura> = {};
  const lidas07: Leitura07[] = [];
  for (const m of MAPA_PLANILHA) {
    const bruta = numeroPlanilha(atual.celulas[m.cota]);
    const bruta07 = linha07 ? numeroPlanilha(linha07.celulas[m.cota]) : null;
    const cota = bruta === null ? null : arred(bruta + OFFSET_IGG, 2);
    const cota07 = bruta07 === null ? null : arred(bruta07 + OFFSET_IGG, 2);
    const vazao = m.vazao === null ? null : numeroPlanilha(atual.celulas[m.vazao]);
    if (cota07 !== null) lidas07.push({ ponto: m.nome, nivel: cota07, vazao: m.vazao === null || !linha07 ? null : numeroPlanilha(linha07.celulas[m.vazao]), lidoEm: ref.t07 });
    estruturas[m.nome] = {
      nome: m.nome,
      cota,
      volumePct: m.volumeUtil && bruta !== null ? volumeUtil(m.volumeUtil, bruta) : null,
      vazao,
      desde07: dif(cota, cota07),
      variacao24h: dif(cota07 ?? hist.get(`${ref.dia}|${m.nome}`)?.nivel ?? null, hist.get(`${ref.ontem}|${m.nome}`)?.nivel ?? null),
    };
  }
  await gravar07('emae', ref.dia, lidas07, hist);

  const q = (nome: string) => estruturas[nome]?.vazao ?? null;
  return {
    ...p,
    dados: {
      hora: atual.hora,
      estruturas,
      operacao: { retiro: statusRetiro(q('Estrutura de Retiro')), usinaSp: statusBomba(q('Pinheiros Inferior')), pedreira: statusBomba(q('Pedreira')) },
    },
  };
}

/** Vazão da Barragem da Penha pela curva: nível de montante atual × comportas abertas. */
export const vazaoBarragemPenha = (nivelMontante: number | null, c: Comportas['penha']) => (c ? vazaoPenha(nivelMontante, c.abertas) : null);

// ---------------------------------------------------------------- coleta em segundo plano

/**
 * Busca tudo e grava as 07h no histórico, sem depender de alguém abrir a página
 * (chamada pelo instrumentation.ts a cada 10 min). Também deixa o cache pronto
 * para os visitantes. Nunca lança.
 */
export async function coletar(): Promise<void> {
  const inicio = performance.now();
  const ref = referencias();
  const r = await Promise.allSettled([niveis(ref), comportas(), chuva(), emae(ref)]);
  for (const x of r) if (x.status === 'rejected') log.warn('sumario_tp_coleta', { erro: erroSeguro(x.reason) });
  // Uma linha por subida do servidor, para conferir no log que a coleta está ativa.
  const g = globalThis as { __ssapColetaTpAtiva?: boolean };
  if (!g.__ssapColetaTpAtiva) {
    g.__ssapColetaTpAtiva = true;
    const fontes = r.map((x) => (x.status === 'fulfilled' ? (x.value.ok ? 'ok' : x.value.mensagem) : 'erro'));
    log.info('sumario_tp_coleta_ativa', { ms: Math.round(performance.now() - inicio), niveis: fontes[0], comportas: fontes[1], chuva: fontes[2], emae: fontes[3] });
  }
}
