import { volumeJaguari } from '../integracoes/ana';
import { hojeSp, RE_DATA, somarDias } from '../integracoes/comum';
import { chuvaPontos, type PrevisaoDiaria } from '../integracoes/openmeteo';
import { ID_CANTAREIRA, ID_SIM, resumoDiario, resumosPeriodo, type SistemaSabesp } from '../integracoes/sabesp';
import { serie, SERIE_TRANSPOSICAO, type Ponto } from '../integracoes/ssd';

/**
 * Dados do Sumário Executivo — Situação Hídrica (porte do ?ajax=1 de
 * acesso/sumario/sumario_novo_c_descargas.php): reservatórios, chuva e vazão
 * (Sabesp), volume do Jaguari (SAR/ANA), transposição, captações e descargas
 * do Cantareira (SSD) e previsão de chuva por reservatório (Open-Meteo).
 * O JSON tem os mesmos campos do PHP, porque a página original é quem desenha.
 */

export const SALA_SUMARIO = 'alfredo-pisani';
export const PERMISSAO_SUMARIO = 'criar_boletim';

// Nomes como o sumário mostra (a ordem dos cartões é a da resposta da Sabesp).
const NOMES: Record<number, string> = {
  64: 'CANTAREIRA', 65: 'ALTO TIETÊ', 66: 'GUARAPIRANGA', 67: 'COTIA', 68: 'RIO GRANDE', 69: 'RIO CLARO', 72: 'SÃO LOURENÇO', 75: 'SIM',
};
/** Os sete sistemas produtores (o SIM, id 75, é o conjunto deles). */
const IDS_SIM = [64, 65, 66, 67, 68, 69, 72];

/** Outorga de captação de cada sistema (m³/s). */
const OUTORGAS: [number, number][] = [[64, 33.0], [65, 15.0], [66, 16.0], [67, 2.3], [68, 5.5], [69, 4.0], [72, 6.4], [75, 82.2]];

// Séries do SSD
const SERIE_SANTA_INES_MENSAL = 809; // captação mensal na Estação Elevatória Santa Inês (Cantareira)
const SERIE_CAPTACAO_SIM_MENSAL = 945;
const SERIES_DESCARGA_MENSAL = { cantareira: 854, atibainha: 530, cachoeira: 563, jaguari: 618, paiva: 640 };
const SERIES_DESCARGA_DIARIA = { cantareira: 372, atibainha: 48, cachoeira: 81, jaguari: 136, paiva: 158 };
type Reservatorio = keyof typeof SERIES_DESCARGA_DIARIA;

/**
 * Coordenadas dos reservatórios de cada sistema produtor. A previsão de 7 dias
 * de um sistema é a MÉDIA dos seus reservatórios (valores aproximados sobre
 * cada barragem — conferir/ajustar se necessário).
 */
export const RESERVATORIOS: Record<string, [string, number, number][]> = {
  Cantareira: [
    ['Jaguari/Jacareí', -22.9278, -46.425],
    ['Cachoeira', -23.0085, -46.286],
    ['Atibainha', -23.1908, -46.379],
    ['Paiva Castro', -23.3299, -46.6789],
    ['Jaguari (Paraíba do Sul)', -23.2796, -46.2117],
  ],
  'Alto Tietê': [
    ['Ponte Nova', -23.5833, -45.8666],
    ['Paraitinga', -23.5192, -45.8797],
    ['Biritiba', -23.6029, -46.0645],
    ['Jundiaí', -23.6251, -46.1924],
    ['Taiaçupeba', -23.5743, -46.2839],
  ],
  Guarapiranga: [
    ['Guarapiranga', -23.6893, -46.7268],
    ['Taquacetuba (Billings)', -23.8146, -46.6198],
  ],
  'Rio Grande': [['Rio Grande (Billings)', -23.7811, -46.6118]],
  'Rio Claro': [['Ribeirão do Campo / Rio Claro', -23.6402, -45.8351]],
  'São Lourenço': [['São Lourenço (Cachoeira do França)', -23.9276, -47.1973]],
  Cotia: [
    ['Pedro Beicht', -23.7506, -46.9612],
    ['Cachoeira da Graça', -23.6544, -46.9661],
  ],
};

// ---------------------------------------------------------------------------
// Sabesp
// ---------------------------------------------------------------------------

export type SistemaSumario = {
  id: number;
  nome: string;
  volume: number | null;
  chuvaMes: number | null;
  chuvaHistorica: number | null;
  chuvaDia: number | null;
  vazaoMes: number | null;
  vazaoHistorica: number | null;
  vazaoDia: number | null;
  captacao: number | null;
};
type Campo = Exclude<keyof SistemaSumario, 'id' | 'nome'>;

export function extrair(sistemas: SistemaSabesp[] | null | undefined): Map<number, SistemaSumario> {
  const saida = new Map<number, SistemaSumario>();
  for (const s of sistemas ?? []) {
    saida.set(s.id, {
      id: s.id, nome: NOMES[s.id] ?? s.nome, volume: s.volumePct,
      chuvaMes: s.chuvaMes, chuvaHistorica: s.chuvaMediaHistorica, chuvaDia: s.chuvaDia,
      vazaoMes: s.vazaoNaturalMes, vazaoHistorica: s.vazaoNaturalMediaHistorica, vazaoDia: s.vazaoNatural,
      captacao: s.vazaoCaptada,
    });
  }
  return saida;
}

const media = (valores: (number | null | undefined)[]): number | null => {
  const v = valores.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Média simples do campo nos sistemas produtores que têm o valor. */
export const mediaSistemas = (sistemas: Map<number, SistemaSumario>, campo: Campo) => media(IDS_SIM.map((id) => sistemas.get(id)?.[campo]));

/**
 * SIM do sumário: volume e vazão natural oficiais (id 75), com a média dos
 * sistemas produtores como reserva; a chuva é sempre a média simples dos sete
 * sistemas (o id 75 pode trazer valor diferente do cálculo do boletim).
 */
export function simCalculado(sistemas: Map<number, SistemaSumario>): SistemaSumario {
  const api = sistemas.get(ID_SIM);
  const ou = (campo: Campo) => api?.[campo] ?? mediaSistemas(sistemas, campo);
  return {
    id: ID_SIM, nome: 'SIM', volume: ou('volume'),
    chuvaMes: mediaSistemas(sistemas, 'chuvaMes'), chuvaHistorica: mediaSistemas(sistemas, 'chuvaHistorica'),
    vazaoMes: ou('vazaoMes'), vazaoHistorica: ou('vazaoHistorica'),
    captacao: mediaSistemas(sistemas, 'captacao'), chuvaDia: ou('chuvaDia'), vazaoDia: ou('vazaoDia'),
  };
}

/** Chuva acumulada e vazão natural média dos últimos 7 dias, do Cantareira e do SIM. */
export function ultimos7Dias(dias: (Map<number, SistemaSumario> | undefined)[]) {
  const acum = { sim: { chuva: [] as number[], vazao: [] as number[] }, cantareira: { chuva: [] as number[], vazao: [] as number[] } };
  const guardar = (lista: number[], v: number | null | undefined) => {
    if (typeof v === 'number') lista.push(v);
  };
  for (const dia of dias) {
    if (!dia) continue;
    const cant = dia.get(ID_CANTAREIRA);
    guardar(acum.cantareira.chuva, cant?.chuvaDia);
    guardar(acum.cantareira.vazao, cant?.vazaoDia);
    // SIM: prioriza o id 75 oficial; se não vier, média simples dos sistemas produtores.
    const sim = dia.get(ID_SIM);
    guardar(acum.sim.chuva, sim?.chuvaDia ?? mediaSistemas(dia, 'chuvaDia'));
    guardar(acum.sim.vazao, sim?.vazaoDia ?? mediaSistemas(dia, 'vazaoDia'));
  }
  const soma = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) : null);
  return {
    sim: { chuva7dias: soma(acum.sim.chuva), vazao7dias: media(acum.sim.vazao) },
    cantareira: { chuva7dias: soma(acum.cantareira.chuva), vazao7dias: media(acum.cantareira.vazao) },
  };
}

// ---------------------------------------------------------------------------
// Previsão (Open-Meteo)
// ---------------------------------------------------------------------------

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Previsão de chuva por reservatório (7 dias, mm/dia): média diária e total de
 * cada sistema e do SIM (média de todos os reservatórios). `pontos` vem na
 * ordem de RESERVATORIOS; null = Open-Meteo indisponível.
 */
export function previsaoPorSistema(pontos: PrevisaoDiaria[] | null) {
  const datas = pontos?.[0]?.datas ?? [];
  let i = 0;
  const todos: { dias: number[]; total: number | null }[] = [];
  const sistemas = Object.entries(RESERVATORIOS).map(([sistema, lista]) => {
    const reservatorios = lista.map(([nome]) => {
      const serie = pontos?.[i++]?.chuvaMm;
      const dias = serie ? serie.map((v) => r1(v ?? 0)) : [];
      const r = { nome, dias, total: serie ? r1(dias.reduce((a, b) => a + b, 0)) : null };
      todos.push(r);
      return r;
    });
    const media_dias = datas.map((_, k) => {
      const m = media(reservatorios.map((r) => r.dias[k]));
      return m === null ? null : r1(m);
    });
    const m7 = media(reservatorios.map((r) => r.total));
    return { sistema, media_dias, media7: m7 === null ? null : r1(m7), reservatorios };
  });
  const simDias = datas.map((_, k) => {
    const m = media(todos.map((r) => r.dias[k]));
    return m === null ? null : r1(m);
  });
  const sim7 = media(todos.map((r) => r.total));
  const sim_media7 = sim7 === null ? null : r1(sim7);
  return {
    datas,
    sistemas,
    sim_media_dias: simDias,
    sim_media7,
    resumo: [...sistemas.map((s) => ({ nome: s.sistema, chuva7dias: s.media7 })), { nome: 'SIM', chuva7dias: sim_media7 }],
  };
}

// ---------------------------------------------------------------------------
// SSD: descargas do Cantareira, captações e transposição
// ---------------------------------------------------------------------------

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

type PorReservatorio = Record<Reservatorio, number | null>;

/**
 * Tabela de descargas do Cantareira: último valor diário, média dos 7 últimos
 * valores do mês e último valor mensal do ano, por reservatório. Se o total do
 * Cantareira não vier, é a soma dos reservatórios disponíveis.
 */
export function tabelaDescargas(dataFim: string, diarias: Record<Reservatorio, Ponto[]>, mensais: Record<Reservatorio, Ponto[]>) {
  const chaves = Object.keys(SERIES_DESCARGA_DIARIA) as Reservatorio[];
  const cada = (f: (c: Reservatorio) => number | null) => Object.fromEntries(chaves.map((c) => [c, f(c)])) as PorReservatorio;
  const diaria = cada((c) => diarias[c].at(-1)?.valor ?? null);
  const media7dias = cada((c) => media(diarias[c].slice(-7).map((p) => p.valor)));
  const mensal = cada((c) => mensais[c].at(-1)?.valor ?? null);
  for (const ref of [diaria, media7dias, mensal]) {
    if (ref.cantareira !== null) continue;
    const partes = chaves.filter((c) => c !== 'cantareira').map((c) => ref[c]).filter((v): v is number => v !== null);
    if (partes.length) ref.cantareira = partes.reduce((a, b) => a + b, 0);
  }
  const [ano, mes, dia] = dataFim.split('-') as [string, string, string];
  return {
    dataRelatorio: dataFim,
    dataDiaria: chaves.map((c) => diarias[c].at(-1)?.data).find(Boolean) ?? dataFim,
    mesTexto: `${MESES[Number(mes) - 1]}/${ano}`,
    ateTexto: `até ${dia}/${mes}`,
    diaria,
    media7dias,
    mensal,
  };
}

/** Pontos da série no intervalo ([] se o SSD não respondeu ou o intervalo é vazio). */
async function pontos(id: number, de: string, ate: string): Promise<Ponto[]> {
  if (de > ate) return [];
  const r = await serie(id, de, ate).catch(() => null);
  return r?.ok ? r.dados.pontos : [];
}

async function porReservatorio(series: Record<Reservatorio, number>, de: string, ate: string): Promise<Record<Reservatorio, Ponto[]>> {
  const chaves = Object.keys(series) as Reservatorio[];
  const listas = await Promise.all(chaves.map((c) => pontos(series[c], de, ate)));
  return Object.fromEntries(chaves.map((c, i) => [c, listas[i]!])) as Record<Reservatorio, Ponto[]>;
}

// ---------------------------------------------------------------------------
// Sumário completo
// ---------------------------------------------------------------------------

const br = (ymd: string) => ymd.split('-').reverse().join('/');

/** Data pedida (AAAA-MM-DD, não futura) ou hoje. */
export function dataSumario(pedida: string | null): string {
  const hoje = hojeSp();
  return pedida && RE_DATA.test(pedida) && !Number.isNaN(Date.parse(pedida)) && pedida <= hoje ? pedida : hoje;
}

export async function sumarioHidrico(dataAtual: string) {
  const inicioMes = `${dataAtual.slice(0, 7)}-01`;
  const inicioAno = `${dataAtual.slice(0, 4)}-01-01`;
  const mesmoDia = (ano: number) => `${ano}${dataAtual.slice(4)}`;
  const ultimos7 = Array.from({ length: 7 }, (_, i) => somarDias(dataAtual, -i));
  const diasDoMes: string[] = [];
  for (let d = inicioMes; d <= dataAtual; d = somarDias(d, 1)) diasDoMes.push(d);
  const dia = (ymd: string) => resumoDiario(ymd).then((r) => extrair(r?.valor), () => extrair(null));

  // Tudo em paralelo; cada fonte tem o próprio cache e, se falhar, o campo vai vazio.
  const [atual, anterior, s2025, s2021, s2014, semana, mes, previsao, jaguari, transposicao, santaInes, captacaoSim, diarias, mensais] = await Promise.all([
    dia(dataAtual),
    dia(somarDias(dataAtual, -7)),
    dia(mesmoDia(2025)),
    dia(mesmoDia(2021)),
    dia(mesmoDia(2014)),
    Promise.all(ultimos7.map(dia)),
    resumosPeriodo(diasDoMes).catch(() => new Map<string, SistemaSabesp[]>()),
    chuvaPontos('sumario-hidrico', Object.values(RESERVATORIOS).flat().map(([, lat, lon]) => ({ lat, lon }))).catch(() => null),
    volumeJaguari(dataAtual).catch(() => null),
    pontos(SERIE_TRANSPOSICAO, somarDias(dataAtual, -365), dataAtual), // os últimos 12 meses bastam para achar o último valor
    pontos(SERIE_SANTA_INES_MENSAL, inicioAno, dataAtual),
    pontos(SERIE_CAPTACAO_SIM_MENSAL, inicioAno, dataAtual),
    porReservatorio(SERIES_DESCARGA_DIARIA, inicioMes, dataAtual),
    porReservatorio(SERIES_DESCARGA_MENSAL, inicioAno, dataAtual),
  ]);

  // O SIM calculado fica na posição do id 75 da Sabesp (ou no fim, se ela não mandou).
  atual.set(ID_SIM, simCalculado(atual));
  const cards = [...atual.values()].map((s) => {
    const antes = anterior.get(s.id)?.volume ?? null;
    return {
      id: s.id, nome: s.nome, volume: s.volume,
      variacaoSemana: s.volume !== null && antes !== null ? s.volume - antes : null,
      chuvaHistorica: s.chuvaHistorica, chuvaMes: s.chuvaMes, vazaoMes: s.vazaoMes, vazaoHistorica: s.vazaoHistorica,
      volume2025: s2025.get(s.id)?.volume ?? null, volume2021: s2021.get(s.id)?.volume ?? null, volume2014: s2014.get(s.id)?.volume ?? null,
      captacao: s.captacao,
    };
  });

  const sete = ultimos7Dias(semana);
  const cantareira = atual.get(ID_CANTAREIRA);
  const previsaoDetalhe = previsaoPorSistema(previsao?.ok ? previsao.dados : null);

  // Captação: Cantareira pela série mensal de Santa Inês; SIM pela série mensal 945;
  // demais sistemas pela média dos valores diários da Sabesp, do dia 1º até a data.
  const outorgas = OUTORGAS.map(([id, outorga]) => {
    const base = { id, nome: NOMES[id]!, outorga, tipoCaptacao: 'mensal' };
    if (id === ID_CANTAREIRA || id === ID_SIM) {
      const ultimo = (id === ID_CANTAREIRA ? santaInes : captacaoSim).at(-1);
      return {
        ...base, captacao: ultimo?.valor ?? null, dataCaptacao: ultimo?.data ?? null, diasComDados: null,
        fonteCaptacao: id === ID_CANTAREIRA ? 'Estação Elevatória Santa Inês - Série 809' : 'SIM - Série 945 (SSD)',
      };
    }
    const valores = diasDoMes.map((d) => mes.get(d)?.find((s) => s.id === id)?.vazaoCaptada).filter((v): v is number => typeof v === 'number');
    return { ...base, captacao: media(valores), dataCaptacao: dataAtual, diasComDados: valores.length, fonteCaptacao: 'Sabesp - média mensal' };
  });

  return {
    data: dataAtual,
    semana: `${br(somarDias(dataAtual, -6))} a ${br(dataAtual)}`,
    cards,
    sim: { ...atual.get(ID_SIM)!, ...sete.sim },
    cantareira: cantareira ? { ...cantareira, ...sete.cantareira } : null,
    previsoes: previsaoDetalhe.resumo,
    previsao_reservatorios: previsaoDetalhe,
    jaguari: jaguari?.ok ? jaguari.dados.volumePct : null,
    transposicao: transposicao.at(-1)?.valor ?? null,
    descargas: tabelaDescargas(dataAtual, diarias, mensais),
    outorgas,
  };
}
