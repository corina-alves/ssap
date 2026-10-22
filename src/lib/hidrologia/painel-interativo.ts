import { createHash } from 'node:crypto';
import { lembrar } from '../integracoes/cache';
import { RE_DATA, somarDias } from '../integracoes/comum';
import { buscarTexto } from '../integracoes/http';
import { catalogo, FREQ_DIARIA, serie, type Ponto } from '../integracoes/ssd';
import { estagio, type Estagio } from './reservatorios';

/**
 * Painel Interativo de Análise Hidrológica — dados do SSD SP Águas (nunca da
 * API da Sabesp). Ids de locais (space) e de variáveis são os do catálogo do
 * SSD, os mesmos que os diagramas oficiais usam (data-space-id e
 * data-variable-id).
 */

/** Quem vê o painel: visualizar_dashboard na Sala Alfredo Pisani. */
export const SALA_PAINEL = 'alfredo-pisani';
export const PERMISSAO_PAINEL = 'visualizar_dashboard';

/** Variáveis do SSD (variable.id). */
export const VAR = {
  chuva: 1,
  vazao: 3,
  afluente: 4,
  descarregada: 5,
  natural: 6,
  captada: 8,
  volumeTotal: 9,
  volumePct: 10,
  volumeHm3: 11,
  defluente: 13,
} as const;

export type Local = { chave: string; nome: string; space: number };

/** Visão geral: o SIM ("Sabesp RMSP" no SSD) e os sistemas produtores. */
export const SISTEMAS: Local[] = [
  { chave: 'sim', nome: 'SIM', space: 10 },
  { chave: 'cantareira', nome: 'Cantareira', space: 3 },
  { chave: 'alto-tiete', nome: 'Alto Tietê', space: 1 },
  { chave: 'guarapiranga', nome: 'Guarapiranga', space: 5 },
  { chave: 'cotia', nome: 'Cotia', space: 4 },
  { chave: 'rio-grande', nome: 'Rio Grande', space: 8 },
  { chave: 'rio-claro', nome: 'Rio Claro', space: 7 },
  { chave: 'sao-lourenco', nome: 'São Lourenço', space: 9 },
];

/** Detalhamento por sistema: reservatórios, módulos à parte e transferências (Cantareira primeiro). */
export const DETALHES: Record<string, { diagrama: string; reservatorios: Local[]; aParte: Local[]; transferencias: Local[] }> = {
  cantareira: {
    diagrama: 'cantareira',
    reservatorios: [
      { chave: 'jaguari-jacarei', nome: 'Jaguari/Jacareí', space: 20 },
      { chave: 'cachoeira', nome: 'Cachoeira', space: 15 },
      { chave: 'atibainha', nome: 'Atibainha', space: 12 },
      { chave: 'paiva-castro', nome: 'Paiva Castro', space: 22 },
      { chave: 'aguas-claras', nome: 'Águas Claras', space: 11 },
    ],
    // UHE Jaguari (bacia do Paraíba do Sul): não entra no Sistema Equivalente
    aParte: [{ chave: 'uhe-jaguari', nome: 'UHE Jaguari', space: 34 }],
    transferencias: [
      { chave: 'jaguari-atibainha', nome: 'UHE Jaguari → Atibainha', space: 44 },
      { chave: 'atibainha-jaguari', nome: 'Atibainha → UHE Jaguari', space: 41 },
    ],
  },
};

/** Diagramas oficiais do SSD que o painel pode embutir (nome do arquivo → caminho). */
export const DIAGRAMAS: Record<string, string> = {
  'map-home': 'images/map-home.svg',
  cantareira: 'images/diagrams/cantareira.svg',
  altotiete: 'images/diagrams/altotiete.svg',
  guarapiranga: 'images/diagrams/guarapiranga.svg',
  cotia: 'images/diagrams/cotia.svg',
  riogrande: 'images/diagrams/riogrande.svg',
  rioclaro: 'images/diagrams/rioclaro.svg',
  saolourenco: 'images/diagrams/saolourenco.svg',
};

// ---------------------------------------------------------------- cálculos

const arred = (v: number, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;
const soma = (ps: Ponto[]) => (ps.length ? arred(ps.reduce((t, p) => t + p.valor, 0), 1) : null);

export type Indicadores = {
  /** último dia com volume útil até a data pedida */
  dataUsada: string | null;
  volumePct: number | null;
  volumeHm3: number | null;
  /** volume em hm³ ÷ volume em %: calculado, não vem pronto do SSD */
  capacidadeHm3: number | null;
  /** variação do volume útil em pontos percentuais (p.p.) */
  var1d: number | null;
  var7d: number | null;
  var30d: number | null;
  chuvaDia: number | null;
  chuvaMes: number | null;
  chuva30d: number | null;
  natural: number | null;
  afluente: number | null;
  defluente: number | null;
  /** volume útil (%) dos últimos 31 dias, para o minigráfico */
  historico: Ponto[];
};

export type SeriesLocal = Partial<Record<number, Ponto[]>>;

/** Indicadores de um local numa data, a partir das séries diárias da janela [data − 31, data]. */
export function indicadores(s: SeriesLocal, data: string): Indicadores {
  const em = (v: number, d: string | null) => (d ? (s[v]?.find((p) => p.data === d)?.valor ?? null) : null);
  const vol = (s[VAR.volumePct] ?? []).filter((p) => p.data <= data).sort((a, b) => a.data.localeCompare(b.data));
  const dataUsada = vol.at(-1)?.data ?? null;
  const volumePct = em(VAR.volumePct, dataUsada);
  const volumeHm3 = em(VAR.volumeHm3, dataUsada);
  const variacao = (dias: number) => {
    const antes = dataUsada ? em(VAR.volumePct, somarDias(dataUsada, -dias)) : null;
    return volumePct !== null && antes !== null ? arred(volumePct - antes) : null;
  };
  const ref = dataUsada ?? data;
  const chuva = (s[VAR.chuva] ?? []).filter((p) => p.data <= ref);
  return {
    dataUsada,
    volumePct: volumePct === null ? null : arred(volumePct),
    volumeHm3: volumeHm3 === null ? null : arred(volumeHm3),
    capacidadeHm3: volumePct && volumeHm3 !== null ? arred(volumeHm3 / (volumePct / 100), 1) : null,
    var1d: variacao(1),
    var7d: variacao(7),
    var30d: variacao(30),
    chuvaDia: em(VAR.chuva, ref),
    chuvaMes: soma(chuva.filter((p) => p.data.slice(0, 7) === ref.slice(0, 7))),
    chuva30d: soma(chuva.filter((p) => p.data > somarDias(ref, -30))),
    natural: em(VAR.natural, ref),
    afluente: em(VAR.afluente, ref),
    defluente: em(VAR.defluente, ref),
    historico: vol.filter((p) => p.data > somarDias(ref, -31)).map((p) => ({ data: p.data, valor: arred(p.valor) })),
  };
}

// ------------------------------------------------------------ acesso ao SSD

/** Até 6 consultas ao SSD ao mesmo tempo (o painel pede dezenas de séries de uma vez). */
const MAX_SIMULTANEAS = 6;
let ativas = 0;
const fila: (() => void)[] = [];
async function comVez<T>(f: () => Promise<T>): Promise<T> {
  if (ativas >= MAX_SIMULTANEAS) await new Promise<void>((r) => fila.push(r));
  ativas++;
  try {
    return await f();
  } finally {
    ativas--;
    fila.shift()?.();
  }
}

/** Id da série diária de um local e variável; null se o SSD não tem. */
export async function idSerieDiaria(space: number, variavelId: number): Promise<number | null> {
  const c = await catalogo();
  if (!c.ok) throw new Error(c.mensagem);
  return c.dados.find((s) => s.spaceId === space && s.variavelId === variavelId && s.frequencia === FREQ_DIARIA)?.id ?? null;
}

/** Locais que o painel consulta (os da visão geral, dos detalhamentos e dos diagramas). */
export async function localPermitido(space: number): Promise<boolean> {
  const c = await catalogo();
  return c.ok && c.dados.some((s) => s.spaceId === space && ['WaterSystem', 'Reservoir', 'Transfer'].includes(s.spaceTipo));
}

/** Pontos diários de um local e variável; [] se o SSD não tem a série. */
export async function pontosDiarios(space: number, variavelId: number, de: string, ate: string): Promise<Ponto[]> {
  const id = await idSerieDiaria(space, variavelId);
  if (!id) return [];
  const r = await comVez(() => serie(id, de, ate));
  if (!r.ok) throw new Error(r.mensagem);
  return r.dados.pontos;
}

const VARS_INDICADORES = [VAR.volumePct, VAR.volumeHm3, VAR.chuva, VAR.natural, VAR.afluente, VAR.defluente];

/** Indicadores de um local numa data (janela de 31 dias, uma consulta por variável). */
export async function indicadoresLocal(space: number, data: string): Promise<Indicadores> {
  const de = somarDias(data, -31);
  const series = await Promise.all(VARS_INDICADORES.map((v) => pontosDiarios(space, v, de, data)));
  return indicadores(Object.fromEntries(VARS_INDICADORES.map((v, i) => [v, series[i]])), data);
}

export type CartaoSistema = Local & { ind: Indicadores | null; estagio: Estagio | null; erro?: string };

/** Visão geral: indicadores do SIM e de cada sistema; a falha de um não derruba os outros. */
export async function resumoSistemas(data: string): Promise<CartaoSistema[]> {
  return Promise.all(
    SISTEMAS.map(async (s) => {
      try {
        const ind = await indicadoresLocal(s.space, data);
        return { ...s, ind, estagio: ind.volumePct === null ? null : estagio(ind.volumePct) };
      } catch (e) {
        return { ...s, ind: null, estagio: null, erro: (e as Error).message };
      }
    }),
  );
}

export type ValorTransferencia = Local & { vazao: number | null; dataUsada: string | null };

/** Detalhamento de um sistema: reservatórios, módulos à parte e transferências na data. */
export async function detalheSistema(chave: string, data: string) {
  const d = DETALHES[chave];
  if (!d) return null;
  const local = async (l: Local) => {
    try {
      return { ...l, ind: await indicadoresLocal(l.space, data) };
    } catch (e) {
      return { ...l, ind: null, erro: (e as Error).message };
    }
  };
  const [reservatorios, aParte, transferencias] = await Promise.all([
    Promise.all(d.reservatorios.map(local)),
    Promise.all(d.aParte.map(local)),
    Promise.all(
      d.transferencias.map(async (t): Promise<ValorTransferencia> => {
        const ps = await pontosDiarios(t.space, VAR.vazao, somarDias(data, -7), data).catch(() => []);
        const ult = ps.filter((p) => p.data <= data).at(-1);
        return { ...t, vazao: ult ? arred(ult.valor) : null, dataUsada: ult?.data ?? null };
      }),
    ),
  ]);
  return { chave, diagrama: d.diagrama, reservatorios, aParte, transferencias };
}

/**
 * Valores na data para os campos de um diagrama (pares local:variável). Usa o
 * último valor dos 7 dias anteriores, como o SSD mostra o dado mais recente.
 */
export async function valoresDiagrama(pares: [number, number][], data: string): Promise<Record<string, { valor: number; data: string } | null>> {
  const saida: Record<string, { valor: number; data: string } | null> = {};
  await Promise.all(
    pares.map(async ([space, v]) => {
      const ps = await pontosDiarios(space, v, somarDias(data, -7), data).catch(() => []);
      const ult = ps.filter((p) => p.data <= data).at(-1);
      saida[`${space}:${v}`] = ult ? { valor: ult.valor, data: ult.data } : null;
    }),
  );
  return saida;
}

// --------------------------------------------------------------- diagramas

/**
 * Diagrama oficial do SSD (SVG), limpo para ser embutido: sem scripts, sem
 * atributos de evento e sem referências externas além de imagens em data:.
 */
export function limparSvg(svg: string): string {
  return svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(\s(?:xlink:)?href\s*=\s*)("|')(?!data:image\/|#)[^"']*\2/gi, '$1$2#$2');
}

/** SVG do diagrama, guardado por 30 dias (o desenho muda raramente). */
export async function diagrama(nome: string): Promise<string | null> {
  const caminho = DIAGRAMAS[nome];
  if (!caminho) return null;
  const url = `https://sssp.spaguas.sp.gov.br/ssdsp/${caminho}`;
  const l = await lembrar('ssd', `diagrama:${createHash('sha256').update(url).digest('hex').slice(0, 16)}`, 30 * 86_400, async () => {
    const t = await buscarTexto(url, { timeoutMs: 30_000 });
    return t && t.includes('<svg') ? limparSvg(t) : null;
  });
  return l?.valor ?? null;
}

export const dataValida = (d: string | null | undefined): d is string => !!d && RE_DATA.test(d);
