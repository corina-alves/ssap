import { comoDado, hojeSp, somarDias, type Dado } from '../integracoes/comum';
import { arred } from '../integracoes/http';
import { ID_SIM, resumoRecente, resumosPeriodo, SISTEMAS, type SistemaSabesp } from '../integracoes/sabesp';

/**
 * Chuva e vazão natural dos sistemas produtores (porte de
 * Hidrologia::getPrecipitacaoSistemas / getVazoesSistemas da referência).
 *
 * Diferenças deliberadas em relação à referência:
 *  - a data base é o último dia com resumo COMPLETO da SABESP (como em Reservatórios);
 *  - "7 dias" = os 7 dias que terminam na data base (a referência somava 8 dias de chuva);
 *  - anos de referência = ano anterior + 2021 e 2014 (anos de crise hídrica).
 *    A referência fixava 2025, 2021 e 2014.
 */

/** Anos de crise hídrica usados como referência fixa (além do ano anterior). */
export const ANOS_CRISE = [2021, 2014] as const;

export type Linha = {
  id: number;
  nome: string;
  dia: number | null;
  seteDias: number | null;
  mes: number | null;
  mediaHistorica: number | null;
  /** % da média de longo termo do mês */
  mlt: number | null;
  /** valor do mês inteiro em cada ano de referência */
  refs: Record<number, number | null>;
};

export type Resumo = {
  dataUsada: string;
  anosReferencia: number[];
  produtores: Linha[];
  sim: Linha | null;
  maior: Linha | null;
  menor: Linha | null;
  desatualizado: boolean;
  obtidoEm: Date;
};

const PRODUTORES = Object.keys(SISTEMAS)
  .map(Number)
  .filter((id) => id !== ID_SIM);

const r1 = (v: number | null) => (v === null ? null : arred(v, 1));
const pct = (v: number | null, base: number | null) => (v !== null && base !== null && base > 0 ? arred((v / base) * 100, 1) : null);
const media = (vs: (number | null)[]) => {
  const ok = vs.filter((v): v is number => v !== null);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
};
const soma = (vs: (number | null)[]) => {
  const ok = vs.filter((v): v is number => v !== null);
  return ok.length ? ok.reduce((a, b) => a + b, 0) : null;
};

/** Último dia do mesmo mês em `ano` (ex.: 2021-02-28). */
function fimDoMes(ano: number, mes: number): string {
  const d = new Date(Date.UTC(ano, mes, 0));
  return d.toISOString().slice(0, 10);
}

type Janela = {
  dataUsada: string;
  base: SistemaSabesp[];
  dias: Map<string, SistemaSabesp[]>;
  datasDias: string[];
  refs: Map<number, SistemaSabesp[] | undefined>;
  anos: number[];
  desatualizado: boolean;
  obtidoEm: Date;
};

/** Data base + 7 dias + fim do mês nos anos de referência, buscados em paralelo. */
async function janela(dataRef: string): Promise<Dado<Janela>> {
  const atual = await resumoRecente(dataRef, 5);
  if (!atual.ok) return atual;
  const dataUsada = atual.dados.data;
  const ano = Number(dataUsada.slice(0, 4));
  const mes = Number(dataUsada.slice(5, 7));
  const anos = [...new Set([ano - 1, ...ANOS_CRISE])].filter((a) => a < ano);
  const datasDias = Array.from({ length: 7 }, (_, i) => somarDias(dataUsada, -i));
  const datasRefs = new Map(anos.map((a) => [a, fimDoMes(a, mes)]));
  const resumos = await resumosPeriodo([...datasDias, ...datasRefs.values()]);
  return {
    ok: true,
    fonte: atual.fonte,
    obtidoEm: atual.obtidoEm,
    desatualizado: atual.desatualizado,
    dados: {
      dataUsada,
      base: atual.dados.sistemas,
      dias: resumos,
      datasDias,
      refs: new Map(anos.map((a) => [a, resumos.get(datasRefs.get(a)!)])),
      anos,
      desatualizado: atual.desatualizado,
      obtidoEm: atual.obtidoEm,
    },
  };
}

const de = (lista: SistemaSabesp[] | undefined, id: number) => lista?.find((s) => s.id === id) ?? null;

function extremos(linhas: Linha[]): { maior: Linha | null; menor: Linha | null } {
  const com = linhas.filter((l) => l.dia !== null);
  return {
    maior: com.reduce<Linha | null>((m, l) => (!m || l.dia! > m.dia! ? l : m), null),
    menor: com.reduce<Linha | null>((m, l) => (!m || l.dia! < m.dia! ? l : m), null),
  };
}

// ---------------------------------------------------------------------------

/**
 * Chuva (mm) nos sistemas produtores. O SIM é a média dos 7 produtores
 * (regra da referência); MLT = chuva acumulada no mês até a data ÷ média
 * histórica do mês inteiro.
 */
export async function chuvasSistemas(dataRef = hojeSp()): Promise<Dado<Resumo>> {
  const j = await janela(dataRef);
  if (!j.ok) return j;
  const w = j.dados;
  const produtores: Linha[] = PRODUTORES.map((id) => {
    const b = de(w.base, id);
    const mes = b?.chuvaMes ?? null;
    const mediaHistorica = b?.chuvaMediaHistorica ?? null;
    return {
      id,
      nome: SISTEMAS[id]!,
      dia: r1(b?.chuvaDia ?? null),
      seteDias: r1(soma(w.datasDias.map((d) => de(w.dias.get(d), id)?.chuvaDia ?? null))),
      mes: r1(mes),
      mediaHistorica: r1(mediaHistorica),
      mlt: pct(mes, mediaHistorica),
      refs: Object.fromEntries(w.anos.map((a) => [a, r1(de(w.refs.get(a), id)?.chuvaMes ?? null)])),
    };
  });
  const m = (f: (l: Linha) => number | null) => media(produtores.map(f));
  const simMes = m((l) => l.mes);
  const simMedia = m((l) => l.mediaHistorica);
  const sim: Linha = {
    id: ID_SIM,
    nome: 'SIM (média dos sistemas)',
    dia: r1(m((l) => l.dia)),
    seteDias: r1(m((l) => l.seteDias)),
    mes: r1(simMes),
    mediaHistorica: r1(simMedia),
    mlt: pct(simMes, simMedia),
    refs: Object.fromEntries(w.anos.map((a) => [a, r1(m((l) => l.refs[a] ?? null))])),
  };
  return comoDado(j.fonte, { valor: { dataUsada: w.dataUsada, anosReferencia: w.anos, produtores, sim, ...extremos(produtores), desatualizado: w.desatualizado, obtidoEm: w.obtidoEm }, obtidoEm: w.obtidoEm, desatualizado: w.desatualizado });
}

/**
 * Vazão natural (m³/s) nos sistemas produtores. O SIM vem da própria SABESP
 * (agregado metropolitano). MLT = média do mês até a data ÷ média climatológica.
 */
export async function vazoesSistemas(dataRef = hojeSp()): Promise<Dado<Resumo>> {
  const j = await janela(dataRef);
  if (!j.ok) return j;
  const w = j.dados;
  const linha = (id: number, nome: string): Linha => {
    const b = de(w.base, id);
    const mes = b?.vazaoNaturalMes ?? null;
    const mediaHistorica = b?.vazaoNaturalMediaHistorica ?? null;
    return {
      id,
      nome,
      dia: r1(b?.vazaoNatural ?? null),
      seteDias: r1(media(w.datasDias.map((d) => de(w.dias.get(d), id)?.vazaoNatural ?? null))),
      mes: r1(mes),
      mediaHistorica: r1(mediaHistorica),
      mlt: pct(mes, mediaHistorica),
      refs: Object.fromEntries(w.anos.map((a) => [a, r1(de(w.refs.get(a), id)?.vazaoNaturalMes ?? null)])),
    };
  };
  const produtores = PRODUTORES.map((id) => linha(id, SISTEMAS[id]!));
  return comoDado(j.fonte, {
    valor: {
      dataUsada: w.dataUsada,
      anosReferencia: w.anos,
      produtores,
      sim: linha(ID_SIM, 'SIM'),
      ...extremos(produtores),
      desatualizado: w.desatualizado,
      obtidoEm: w.obtidoEm,
    },
    obtidoEm: w.obtidoEm,
    desatualizado: w.desatualizado,
  });
}
