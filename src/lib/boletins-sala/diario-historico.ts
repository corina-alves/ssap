import { chuvaEstado, type PontoChuvaEstado } from '../hidrologia/situacao-rios';
import { lembrar } from '../integracoes/cache';
import { buscarSibh } from '../integracoes/sibh-medicoes';

/**
 * Média histórica mensal de chuva para o Boletim Diário da SSAP: "volume médio
 * mensal calculado a partir da série histórica disponível" no SIBH.
 *
 * Para o mês pedido, busca o total de chuva de cada posto em cada ano anterior;
 * o valor do município (ou da UGRHI) em um ano é a média dos seus postos com o
 * mês completo, e a média histórica é a média desses anos.
 *
 * O SIBH responde devagar a séries longas, então a consulta é limitada:
 *   - municípios: só os pedidos (os da tabela do boletim), com todos os postos;
 *   - UGRHIs: uma amostra de POSTOS_POR_UGRHI postos de cada uma.
 * Cada total (posto × ano) fica guardado — o passado não muda —, de modo que só
 * a primeira consulta do mês demora.
 */

const SERVICO = 'boletim_diario';
/** Primeiro ano consultado (a rede telemétrica do SIBH é recente). */
export const ANO_INICIAL = 2014;
export const POSTOS_POR_UGRHI = 5;
/** Dias com leitura, do primeiro ao último registro, para o mês de um posto contar. */
const DIAS_MINIMOS = 25;

const media = (vs: number[]) => vs.reduce((a, b) => a + b, 0) / vs.length;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Total de chuva (mm) do posto no mês; null = mês incompleto ou sem dado; undefined = SIBH falhou. */
async function totalDoMes(ano: number, mes: number, id: string): Promise<number | null | undefined> {
  const mm = String(mes).padStart(2, '0');
  const fim = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
  const l = await lembrar(
    SERVICO,
    `hist-posto:${ano}-${mm}:${id}`,
    365 * 86_400,
    async () => {
      // 03:00Z = meia-noite em São Paulo
      const r = (await buscarSibh(`measurements?station_prefix_ids[]=${Number(id)}&start_date=${ano}-${mm}-01T03:00:00Z&end_date=${fim}-01T03:00:00Z&group_type=month`, 60_000)) as {
        measurements?: Record<string, unknown>[];
      };
      if (!Array.isArray(r.measurements)) return null;
      const m = r.measurements.find((x) => String(x.date) === `${ano}/${mm}`);
      const v = Number(m?.value);
      const dias = m ? (Date.parse(String(m.max_date)) - Date.parse(String(m.min_date))) / 86_400_000 : 0;
      return { total: Number.isFinite(v) && dias >= DIAS_MINIMOS ? v : null };
    },
    { validadeMaxSeg: 5 * 365 * 86_400, esperaFalhaSeg: 60 },
  );
  return l ? l.valor.total : undefined;
}

export type HistoricoMensal = {
  mes: number;
  anos: [number, number];
  /** Município (nome do SIBH) → média histórica do mês (mm). */
  municipios: Record<string, number>;
  /** Código da UGRHI → média histórica do mês (mm), por amostra de postos. */
  ugrhis: Record<number, number>;
  postosPorUgrhi: number;
  /** Consultas que falharam (0 = série completa). */
  falhas: number;
};

/**
 * Média histórica do mês (1–12), até o ano anterior a `ano`, para os municípios
 * pedidos e para todas as UGRHIs.
 */
export async function historicoMensal(ano: number, mes: number, cidades: string[]): Promise<HistoricoMensal | null> {
  const postos = (await chuvaEstado(24)).postos;
  if (!postos.length) return null;
  const porId = [...postos].sort((a, b) => Number(a.id) - Number(b.id));
  const anos = Array.from({ length: ano - ANO_INICIAL }, (_, i) => ANO_INICIAL + i);

  // postos consultados: os dos municípios pedidos + a amostra de cada UGRHI
  const alvo = new Set(cidades);
  const doMunicipio = porId.filter((p) => alvo.has(p.c));
  const amostra: PontoChuvaEstado[] = [];
  for (const u of new Set(porId.map((p) => p.u).filter(Boolean))) amostra.push(...porId.filter((p) => p.u === u).slice(0, POSTOS_POR_UGRHI));
  const ids = [...new Set([...doMunicipio, ...amostra].map((p) => p.id))];

  let falhas = 0;
  const totais = new Map<string, (number | null)[]>(); // posto → total de cada ano
  await Promise.all(
    ids.map(async (id) => {
      const serie = await Promise.all(anos.map((a) => totalDoMes(a, mes, id).catch(() => undefined)));
      falhas += serie.filter((v) => v === undefined).length;
      totais.set(id, serie.map((v) => v ?? null));
    }),
  );

  /** Média, ano a ano, dos postos do grupo; depois a média dos anos com dado. */
  const mediaHistorica = (grupo: PontoChuvaEstado[]): number | null => {
    const porAno = anos.flatMap((_, i) => {
      const vs = grupo.flatMap((p) => totais.get(p.id)?.[i] ?? []);
      return vs.length ? [media(vs)] : [];
    });
    return porAno.length ? r1(media(porAno)) : null;
  };
  const tabela = <K extends string | number>(chaves: K[], grupo: (k: K) => PontoChuvaEstado[]) =>
    Object.fromEntries(chaves.flatMap((k) => {
      const v = mediaHistorica(grupo(k));
      return v === null ? [] : [[k, v]];
    }));

  return {
    mes,
    anos: [ANO_INICIAL, ano - 1],
    municipios: tabela(cidades, (c) => doMunicipio.filter((p) => p.c === c)) as Record<string, number>,
    ugrhis: tabela([...new Set(amostra.map((p) => p.u))], (u) => amostra.filter((p) => p.u === u)) as Record<number, number>,
    postosPorUgrhi: POSTOS_POR_UGRHI,
    falhas,
  };
}
