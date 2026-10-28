import { createHash } from 'node:crypto';
import { lembrar } from '../integracoes/cache';
import { RE_DATA, somarDias } from '../integracoes/comum';
import { buscarTexto } from '../integracoes/http';
import { resumoRecente, resumosPeriodo } from '../integracoes/sabesp';
import { catalogo, FREQ_DIARIA, serie, type Ponto } from '../integracoes/ssd';
import { estagio, type Estagio } from './reservatorios';

/**
 * Painel Interativo de Análise Hidrológica — dados do SSD SP Águas. A API da
 * Sabesp entra só como reserva do volume útil, quando o SSD está há mais de 7
 * dias sem o volume de um sistema (ou do reservatório único dele), e a tela
 * mostra a fonte (volumeFonte). Ids de locais (space) e de variáveis são os do
 * catálogo do SSD, os mesmos que os diagramas oficiais usam (data-space-id e
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
  nivel: 12,
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

/** Detalhamento por sistema: reservatórios, módulos à parte e transferências (os mesmos dos diagramas unifilares). */
export const DETALHES: Record<string, { diagrama: string; reservatorios: Local[]; aParte: Local[]; transferencias: Local[] }> = {
  'alto-tiete': {
    diagrama: 'altotiete',
    reservatorios: [
      { chave: 'paraitinga', nome: 'Paraitinga', space: 23 },
      { chave: 'ponte-nova', nome: 'Ponte Nova', space: 26 },
      { chave: 'biritiba', nome: 'Biritiba', space: 14 },
      { chave: 'jundiai', nome: 'Jundiaí', space: 21 },
      { chave: 'taiacupeba', nome: 'Taiaçupeba', space: 32 },
    ],
    aParte: [],
    transferencias: [
      { chave: 'eeab-biritiba', nome: 'EEAB Biritiba (Tietê → Dique)', space: 200 },
      { chave: 'biritiba-dique', nome: 'Biritiba → Dique', space: 42 },
      { chave: 'dique-jundiai', nome: 'Dique → Jundiaí', space: 202 },
      { chave: 'jundiai-taiacupeba', nome: 'Jundiaí → Taiaçupeba', space: 43 },
      { chave: 'eeab-rio-grande', nome: 'EEAB Rio Grande → Taiaçupeba', space: 38 },
      { chave: 'eeab-guaio', nome: 'EEAB Guaió → Taiaçupeba', space: 201 },
    ],
  },
  guarapiranga: {
    diagrama: 'guarapiranga',
    reservatorios: [{ chave: 'guarapiranga', nome: 'Guarapiranga', space: 19 }],
    aParte: [],
    transferencias: [
      { chave: 'taquacetuba', nome: 'EEAB Taquacetuba (Billings → Guarapiranga)', space: 63 },
      { chave: 'capivari', nome: 'EEAB Capivari → Guarapiranga', space: 62 },
    ],
  },
  cotia: {
    diagrama: 'cotia',
    reservatorios: [
      { chave: 'pedro-beicht', nome: 'Pedro Beicht', space: 25 },
      { chave: 'cachoeira-graca', nome: 'Cachoeira da Graça', space: 27 },
      { chave: 'isolina', nome: 'Isolina', space: 30 },
    ],
    aParte: [],
    transferencias: [],
  },
  'rio-grande': {
    diagrama: 'riogrande',
    reservatorios: [
      { chave: 'rio-grande', nome: 'Rio Grande', space: 31 },
      { chave: 'estiva', nome: 'Ribeirão da Estiva', space: 28 },
    ],
    aParte: [],
    transferencias: [
      { chave: 'rio-pequeno', nome: 'EEAB Rio Pequeno (Billings → Rio Grande)', space: 39 },
      { chave: 'eeab-rio-grande', nome: 'EEAB Rio Grande → Taiaçupeba', space: 38 },
    ],
  },
  'rio-claro': {
    diagrama: 'rioclaro',
    reservatorios: [{ chave: 'ribeirao-campo', nome: 'Ribeirão do Campo', space: 29 }],
    aParte: [],
    transferencias: [
      { chave: 'guaratuba', nome: 'EEAB Guaratuba → Rio Claro', space: 37 },
      { chave: 'km76', nome: 'Captação Km 76', space: 35 },
      { chave: 'poco-preto', nome: 'Captação Poço Preto', space: 36 },
    ],
  },
  'sao-lourenco': {
    diagrama: 'saolourenco',
    reservatorios: [{ chave: 'franca', nome: 'Cachoeira do França', space: 16 }],
    aParte: [],
    transferencias: [{ chave: 'uhe-franca', nome: 'UHE França (vazão turbinada)', space: 64 }],
  },
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
  /** o que veio da Sabesp porque o SSD está sem dado recente (reserva) */
  sabesp?: ('volume' | 'chuva')[];
  /** SIM: a chuva é a média destes tantos sistemas produtores */
  chuvaSistemas?: number;
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

/** Locais que o painel consulta: sistemas, reservatórios, transferências, postos e ETAs (os dos diagramas). */
export async function localPermitido(space: number): Promise<boolean> {
  const c = await catalogo();
  return c.ok && c.dados.some((s) => s.spaceId === space && ['WaterSystem', 'Reservoir', 'Transfer', 'Station', 'WaterTreatmentPlant'].includes(s.spaceTipo));
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
  return completarVolume(space, indicadores(Object.fromEntries(VARS_INDICADORES.map((v, i) => [v, series[i]])), data), data);
}

// ------------------------------------------------- reserva do volume (Sabesp)

/**
 * Locais do SSD cujo volume a Sabesp também publica, pelo nome do sistema na
 * Sabesp: os sistemas e os reservatórios que sozinhos formam um sistema.
 */
const VOLUME_SABESP: Record<number, string> = {
  10: 'SIM',
  3: 'Cantareira',
  1: 'Alto Tietê',
  5: 'Guarapiranga',
  19: 'Guarapiranga', // Represa Guarapiranga
  4: 'Cotia',
  8: 'Rio Grande',
  7: 'Rio Claro',
  29: 'Rio Claro', // Ribeirão do Campo
  9: 'São Lourenço',
  16: 'São Lourenço', // Cachoeira do França
};

/** Variações do volume útil na Sabesp em 1, 7 e 30 dias (p.p.) até `dia`. */
async function variacoesSabesp(nome: string, dia: string, volumePct: number) {
  const antes = await resumosPeriodo([1, 7, 30].map((n) => somarDias(dia, -n)));
  const variacao = (n: number) => {
    const p = antes.get(somarDias(dia, -n))?.find((x) => x.nome === nome)?.volumePct;
    return p == null ? null : arred(volumePct - p);
  };
  return { var1d: variacao(1), var7d: variacao(7), var30d: variacao(30) };
}

/**
 * Reserva da Sabesp (para os locais que ela publica): sem volume do SSD nos 7
 * dias até a data, usa o volume dela (com as variações); sem chuva do SSD no
 * dia e no mês, usa a chuva dela. O que veio de lá fica em `sabesp`.
 */
async function completarVolume(space: number, ind: Indicadores, data: string): Promise<Indicadores> {
  const nome = VOLUME_SABESP[space];
  const semVolume = !ind.dataUsada || ind.dataUsada < somarDias(data, -7);
  const semChuva = ind.chuvaDia === null && ind.chuvaMes === null;
  if (!nome || (!semVolume && !semChuva)) return ind;
  const r = await resumoRecente(data).catch(() => null);
  const s = r?.ok ? r.dados.sistemas.find((x) => x.nome === nome) : undefined;
  if (!r?.ok || !s) return ind;
  const saida: Indicadores = { ...ind, sabesp: [] };
  if (semVolume && s.volumePct !== null) {
    const volumePct = arred(s.volumePct);
    const volumeHm3 = s.volumeHm3 === null ? null : arred(s.volumeHm3);
    Object.assign(saida, {
      dataUsada: r.dados.data,
      volumePct,
      volumeHm3,
      capacidadeHm3: volumePct && volumeHm3 !== null ? arred(volumeHm3 / (volumePct / 100), 1) : null,
      historico: [],
      ...(await variacoesSabesp(nome, r.dados.data, s.volumePct).catch(() => ({ var1d: null, var7d: null, var30d: null }))),
    });
    saida.sabesp!.push('volume');
  }
  if (semChuva && (s.chuvaDia !== null || s.chuvaMes !== null)) {
    Object.assign(saida, { chuvaDia: s.chuvaDia, chuvaMes: s.chuvaMes, chuva30d: null });
    saida.sabesp!.push('chuva');
  }
  return saida.sabesp!.length ? saida : ind;
}

/** Teto de dias pedidos à Sabesp para completar o fim de uma série de chuva parada no SSD. */
const MAX_DIAS_SABESP = 400;
/** Dia só entra na média com ao menos 5 dos 7 sistemas (como o dia completo da Sabesp). */
const MIN_SISTEMAS_CHUVA = 5;

export type PontoChuvaSim = Ponto & { sistemas: number };

/**
 * Chuva diária do SIM: média simples, dia a dia, dos sistemas produtores com
 * dado no dia (a mesma conta nos cartões e no gráfico de precipitação). Sistema
 * cuja série do SSD parou (sem chuva nos 7 dias até `ate`, caso do São Lourenço)
 * tem os dias seguintes completados pela Sabesp.
 */
export async function chuvaMediaSistemas(de: string, ate: string): Promise<PontoChuvaSim[]> {
  const produtores = SISTEMAS.filter((s) => s.chave !== 'sim');
  const series = await Promise.all(produtores.map((s) => pontosDiarios(s.space, VAR.chuva, de, ate)));
  const semSsd = series.map((pts) => {
    const ultimo = pts.at(-1)?.data;
    const dias: string[] = [];
    if (ultimo && ultimo >= somarDias(ate, -7)) return dias;
    for (let d = ultimo ? somarDias(ultimo, 1) : de; d <= ate; d = somarDias(d, 1)) dias.push(d);
    return dias.slice(-MAX_DIAS_SABESP);
  });
  const datas = [...new Set(semSsd.flat())].sort();
  const sabesp = datas.length ? await resumosPeriodo(datas).catch(() => new Map<string, never[]>()) : new Map<string, never[]>();
  const porDia = new Map<string, number[]>();
  const juntar = (data: string, valor: number) => porDia.set(data, [...(porDia.get(data) ?? []), valor]);
  produtores.forEach((s, i) => {
    for (const p of series[i]!) juntar(p.data, p.valor);
    for (const d of semSsd[i]!) {
      const v = sabesp.get(d)?.find((x) => x.nome === VOLUME_SABESP[s.space])?.chuvaDia;
      if (v != null) juntar(d, v);
    }
  });
  return [...porDia]
    .filter(([, vs]) => vs.length >= MIN_SISTEMAS_CHUVA)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([data, vs]) => ({ data, valor: arred(vs.reduce((t, v) => t + v, 0) / vs.length), sistemas: vs.length }));
}

export type CartaoSistema = Local & { ind: Indicadores | null; estagio: Estagio | null; erro?: string };

/**
 * Visão geral: indicadores do SIM e de cada sistema; a falha de um não derruba
 * os outros. A chuva do SIM (dia, mês e 30 dias) sai da média diária dos
 * sistemas produtores (chuvaMediaSistemas), no último dia com a média.
 */
export async function resumoSistemas(data: string): Promise<CartaoSistema[]> {
  const [cartoes, chuvaSim] = await Promise.all([
    Promise.all(
      SISTEMAS.map(async (s): Promise<CartaoSistema> => {
        try {
          const ind = await indicadoresLocal(s.space, data);
          return { ...s, ind, estagio: ind.volumePct === null ? null : estagio(ind.volumePct) };
        } catch (e) {
          return { ...s, ind: null, estagio: null, erro: (e as Error).message };
        }
      }),
    ),
    chuvaMediaSistemas(somarDias(data, -31), data).catch(() => []),
  ]);
  const sim = cartoes.find((c) => c.chave === 'sim');
  const dia = chuvaSim.at(-1);
  if (sim?.ind && dia)
    sim.ind = {
      ...sim.ind,
      chuvaDia: arred(dia.valor, 1),
      chuvaMes: soma(chuvaSim.filter((p) => p.data.slice(0, 7) === dia.data.slice(0, 7))),
      chuva30d: soma(chuvaSim.filter((p) => p.data > somarDias(dia.data, -30))),
      chuvaSistemas: dia.sistemas,
    };
  return cartoes;
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
  // volume que o SSD não tem há 7 dias: o da Sabesp, onde ela publica (VOLUME_SABESP)
  const faltam = pares.filter(([space, v]) => (v === VAR.volumePct || v === VAR.volumeHm3) && VOLUME_SABESP[space] && !saida[`${space}:${v}`]);
  if (faltam.length) {
    const r = await resumoRecente(data).catch(() => null);
    if (r?.ok)
      for (const [space, v] of faltam) {
        const s = r.dados.sistemas.find((x) => x.nome === VOLUME_SABESP[space]);
        const valor = v === VAR.volumePct ? s?.volumePct : s?.volumeHm3;
        if (valor != null) saida[`${space}:${v}`] = { valor, data: r.dados.data };
      }
  }
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
