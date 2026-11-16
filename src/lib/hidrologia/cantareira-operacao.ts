import { DIAGRAMAS_UNIFILARES, ehPostoSibh, POSTOS_SIBH } from '@/conteudo/diagramas-unifilares';
import { hojeSp, somarDias } from '../integracoes/comum';
import { instante, medicoes, type Medicao } from '../integracoes/sibh-medicoes';
import type { Ponto } from '../integracoes/ssd';
import { chuvaRadarDia, pontosDiarios, pontosMensais, VAR } from './painel-interativo';

/**
 * Operação do Sistema Cantareira e vazões para as Bacias PCJ (painel
 * interativo, abaixo do diagrama unifilar): faixa de operação e limites da
 * Resolução Conjunta ANA/DAEE nº 925/2017, vazão para a EEAB Santa Inês, vazão
 * despachada (descarregada) para o PCJ e o volume no mês (SSD), chuva por radar
 * nas bacias dos reservatórios com a média climatológica do mês (SSD), e os
 * postos de controle de Valinhos, Atibaia e Buenópolis (SIBH).
 *
 * O SIBH fica lento com muitos postos ou períodos longos: cada posto
 * fluviométrico é lido sozinho, os dias fechados ficam guardados por 2 h e o dia
 * de hoje por 5 min; o radar de todas as bacias do Cantareira vem em uma
 * consulta só (a mesma do diagrama, para o dia de hoje).
 */

const HORA = 3_600_000;
const DIA = 24 * HORA;
const SERVICO = 'painel-cantareira';

/** Início do dia em Brasília (UTC−3, sem horário de verão desde 2019), em ms. */
export const inicioDiaSp = (data: string) => Date.parse(`${data}T00:00:00-03:00`);
/** ms → dia (AAAA-MM-DD) em Brasília. */
export const diaSp = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(0, 10);
/** ms → "13:50" em Brasília. */
export const horaSp = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(11, 16);

const arred = (v: number, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;
const media = (vs: number[]) => (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null);

// ------------------------------------------------------------------ regras

/** Reservatórios que despejam nos rios do PCJ: Jaguari/Jacareí no Jaguari; Cachoeira e Atibainha no Atibaia. */
export const RESERVATORIOS_PCJ = [
  { chave: 'jaguari', nome: 'Jaguari/Jacareí', space: 20, rio: 'Rio Jaguari', radar: 35834 },
  { chave: 'cachoeira', nome: 'Cachoeira', space: 15, rio: 'Rio Cachoeira → Atibaia', radar: 35833 },
  { chave: 'atibainha', nome: 'Atibainha', space: 12, rio: 'Rio Atibainha → Atibaia', radar: 35832 },
] as const;

/** EEAB Santa Inês (captação para a RMSP) e a transposição UHE Jaguari → Atibainha, no SSD. */
const SANTA_INES = 40;
const TRANSPOSICAO = 44;
/** Sistema Cantareira no SSD (volume útil do sistema). */
const CANTAREIRA = 3;

export type ChavePosto = 'valinhos' | 'atibaia' | 'buenopolis';
type Minimos = Record<ChavePosto, number | null>;

/**
 * Faixas do art. 4º: volume útil mínimo (%), limite de retirada em Santa Inês
 * (média mensal, § 1º), metas de média móvel de 15 dias nos postos de controle
 * no período úmido (art. 5º, § 2º) e mínimas médias diárias (§ 3º; na Faixa 5,
 * § 10, sem valor para Atibaia).
 */
export const FAIXAS_925: { numero: 1 | 2 | 3 | 4 | 5; nome: string; min: number; santaInes: number; metas15d: Minimos | null; minimoDiario: Minimos }[] = [
  { numero: 1, nome: 'Normal', min: 60, santaInes: 33, metas15d: { valinhos: 12, atibaia: 3, buenopolis: 2.5 }, minimoDiario: { valinhos: 10, atibaia: 2, buenopolis: 2 } },
  { numero: 2, nome: 'Atenção', min: 40, santaInes: 31, metas15d: { valinhos: 12, atibaia: 3, buenopolis: 2.5 }, minimoDiario: { valinhos: 10, atibaia: 2, buenopolis: 2 } },
  { numero: 3, nome: 'Alerta', min: 30, santaInes: 27, metas15d: { valinhos: 11, atibaia: 2, buenopolis: 2 }, minimoDiario: { valinhos: 10, atibaia: 2, buenopolis: 2 } },
  { numero: 4, nome: 'Restrição', min: 20, santaInes: 23, metas15d: { valinhos: 11, atibaia: 2, buenopolis: 2 }, minimoDiario: { valinhos: 10, atibaia: 2, buenopolis: 2 } },
  { numero: 5, nome: 'Especial', min: -Infinity, santaInes: 15.5, metas15d: null, minimoDiario: { valinhos: 10, atibaia: null, buenopolis: 2 } },
];

/** Metas de média móvel de 15 dias das Faixas 1–2 e 3–4 (as linhas dos gráficos de 15 dias). */
export const METAS_15D = { faixas12: FAIXAS_925[0]!.metas15d!, faixas34: FAIXAS_925[2]!.metas15d! };

/** Faixa do art. 4º pelo volume útil (%). */
export const faixa925 = (volumePct: number) => FAIXAS_925.find((f) => volumePct >= f.min)!;

/** Período hidrológico do art. 3º: úmido de 1º/12 a 31/05, seco de 1º/06 a 30/11. */
export function periodoHidrologico(data: string): { nome: 'úmido' | 'seco'; de: string; ate: string } {
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  if (mes >= 6 && mes <= 11) return { nome: 'seco', de: `${ano}-06-01`, ate: `${ano}-11-30` };
  const inicio = mes === 12 ? ano : ano - 1;
  return { nome: 'úmido', de: `${inicio}-12-01`, ate: `${inicio + 1}-05-31` };
}

/** Postos de controle do art. 5º, § 1º (station_prefix_id do SIBH) e o radar da bacia de cada um. */
export const POSTOS_CONTROLE: { chave: ChavePosto; nome: string; rio: string; prefixo: string; id: number; radar: number }[] = [
  { chave: 'valinhos', nome: 'Captação de Valinhos', rio: 'Rio Atibaia', prefixo: '3D-007', id: 30846, radar: 35839 },
  { chave: 'atibaia', nome: 'Atibaia', rio: 'Rio Atibaia', prefixo: '3E-063', id: 30863, radar: 35808 },
  { chave: 'buenopolis', nome: 'Buenópolis (Morungaba)', rio: 'Rio Jaguari', prefixo: '3D-009', id: 29592, radar: 35838 },
];

const cantareira = DIAGRAMAS_UNIFILARES.cantareira!;
/** Todos os postos de radar e do SIBH do diagrama do Cantareira: as consultas do dia são as mesmas do diagrama. */
const RADARES_CANTAREIRA = (cantareira.radares ?? []).map((r) => r.id).sort((a, b) => a - b);
const POSTOS_CANTAREIRA = cantareira.nos.filter(ehPostoSibh).map((n) => n.sibh.id);
const nomeRadar = (id: number) => cantareira.radares?.find((r) => r.id === id)?.nome ?? `posto ${id}`;

// ------------------------------------------------------------------ contas (puras)

/** Leitura de posto fluviométrico: instante (ms), nível (m) e vazão (m³/s). */
export type Leitura = { t: number; nivel: number | null; vazao: number | null };

/** Medições do SIBH de um posto → leituras em ordem de tempo (nível em cm → m). */
export function leiturasDe(med: Medicao[] | null, id: number): Leitura[] {
  return (med ?? [])
    .filter((m) => m[0] === String(id) && (m[2] !== null || m[3] !== null))
    .map(([, d, v, q]) => ({ t: instante(d), nivel: v === null ? null : arred(v / 100), vazao: q === null ? null : arred(q, 3) }))
    .filter((l) => Number.isFinite(l.t))
    .sort((a, b) => a.t - b.t);
}

export type Dia = { data: string; nivel: number | null; vazao: number | null; leituras: number };

/** Médias de nível e vazão por dia de Brasília. */
export function mediasDiarias(ls: Leitura[]): Dia[] {
  const dias = new Map<string, { n: number[]; q: number[]; k: number }>();
  for (const l of ls) {
    const d = dias.get(diaSp(l.t)) ?? { n: [], q: [], k: 0 };
    if (l.nivel !== null) d.n.push(l.nivel);
    if (l.vazao !== null) d.q.push(l.vazao);
    d.k++;
    dias.set(diaSp(l.t), d);
  }
  return [...dias]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([data, d]) => {
      const n = media(d.n);
      const q = media(d.q);
      return { data, nivel: n === null ? null : arred(n), vazao: q === null ? null : arred(q), leituras: d.k };
    });
}

/** Mínimo de dias com dado numa janela de 15 para a média móvel valer. */
const MIN_DIAS_MM = 13;

/** Média móvel de `n` dias da vazão terminando em `ate` (inclusive); null com menos de MIN_DIAS_MM dias. */
export function mediaMovel(dias: Dia[], ate: string, n = 15): { valor: number; de: string; ate: string; dias: number } | null {
  const de = somarDias(ate, -(n - 1));
  const vs = dias.filter((d) => d.data >= de && d.data <= ate && d.vazao !== null).map((d) => d.vazao!);
  return vs.length >= Math.min(n, MIN_DIAS_MM) ? { valor: arred(media(vs)!), de, ate, dias: vs.length } : null;
}

/** Volume (hm³) de uma vazão diária (m³/s) somada nos dias. */
export const hm3 = (vazoesDiarias: number[]) => arred((vazoesDiarias.reduce((a, b) => a + b, 0) * 86_400) / 1e6, 2);

/** Média do total de chuva do mês `mes` (1–12) nos anos antes de `anoAtual`, dos totais mensais do SSD. */
export function climatologiaMes(mensais: Ponto[], mes: number, anoAtual: number): { media: number; anos: number; de: number; ate: number } | null {
  const vs = mensais.filter((p) => Number(p.data.slice(5, 7)) === mes && Number(p.data.slice(0, 4)) < anoAtual);
  if (!vs.length) return null;
  const anos = vs.map((p) => Number(p.data.slice(0, 4)));
  return { media: arred(media(vs.map((p) => p.valor))!, 1), anos: vs.length, de: Math.min(...anos), ate: Math.max(...anos) };
}

/** Soma de chuva de cada posto com leitura em [ini, fim). */
export function somaEntre(med: Medicao[] | null, ini: number, fim: number): Record<string, number> {
  const s: Record<string, number> = {};
  for (const [id, d, v] of med ?? []) {
    const t = instante(d);
    if (v !== null && t >= ini && t < fim) s[id] = (s[id] ?? 0) + v;
  }
  return s;
}

/** Chuva diária (dia de Brasília) de cada posto, das medições horárias ou de 10 min. */
export function chuvaPorDia(med: Medicao[] | null): Record<string, Record<string, number>> {
  const s: Record<string, Record<string, number>> = {};
  for (const [id, d, v] of med ?? []) {
    if (v === null) continue;
    const dia = diaSp(instante(d));
    const p = (s[id] ??= {});
    p[dia] = arred((p[dia] ?? 0) + v, 2);
  }
  return s;
}

// ------------------------------------------------------------------ SIBH

/**
 * Chuva por radar de todas as bacias de um diagrama (padrão: Cantareira) hora a
 * hora nos 31 dias fechados antes de `data`. Uma consulta só serve o gráfico do
 * mês, os gráficos dos postos e as somas de 24 a 72 h.
 */
async function radarDiasFechados(data: string, ids = RADARES_CANTAREIRA): Promise<Medicao[] | null> {
  const fim = inicioDiaSp(data);
  const chave = ids === RADARES_CANTAREIRA ? `radar-31d:${data}` : `radar-31d:${data}:${ids.join(',')}`;
  const recente = Date.now() < fim + DIA + 2 * HORA;
  const r = await medicoes(SERVICO, { [chave]: { ids, ini: fim - 31 * DIA, fim, grupo: 'hour', ttlSeg: recente ? 2 * 3600 : 30 * 86_400, timeoutMs: 90_000 } });
  return r[chave] ?? null;
}

/** Chuva por radar de todas as bacias de um diagrama no dia, leitura a leitura (a mesma consulta do diagrama). */
async function radarDoDia(data: string, ids = RADARES_CANTAREIRA): Promise<Medicao[] | null> {
  const ini = inicioDiaSp(data);
  const fim = ini + DIA;
  const recente = Date.now() < fim + 2 * HORA;
  const chave = `${data}:${ids.join(',')}`;
  // mesma chave e serviço de chuvaRadarDia (painel-interativo.ts): o que o diagrama já buscou serve aqui
  const r = await medicoes('painel-radar', { [chave]: { ids, ini, fim, grupo: 'minute', ttlSeg: recente ? 300 : 86_400, timeoutMs: 30_000 } });
  return r[chave] ?? null;
}

/** Leituras horárias de um posto fluviométrico nos 29 dias fechados antes de `data`. */
async function horasFechadas(id: number, data: string): Promise<Medicao[] | null> {
  const fim = inicioDiaSp(data);
  const chave = `horas-29d:${id}:${data}`;
  const recente = Date.now() < fim + DIA + 2 * HORA;
  const r = await medicoes(SERVICO, { [chave]: { ids: [id], ini: fim - 29 * DIA, fim, grupo: 'hour', ttlSeg: recente ? 2 * 3600 : 30 * 86_400, timeoutMs: 90_000 } });
  return r[chave] ?? null;
}

/** Leituras horárias de um posto no dia `data` (até agora). */
async function horasDoDia(id: number, data: string): Promise<Medicao[] | null> {
  const ini = inicioDiaSp(data);
  const fim = Math.min(ini + DIA, Date.now());
  const recente = Date.now() < ini + DIA + 2 * HORA;
  const chave = `horas-dia:${id}:${data}`;
  const r = await medicoes(SERVICO, { [chave]: { ids: [id], ini, fim, grupo: 'hour', ttlSeg: recente ? 300 : 30 * 86_400, timeoutMs: 60_000 } });
  return r[chave] ?? null;
}

export type ValorPosto = { valor: number; data: string; hora?: string };

/**
 * Nível e vazão dos postos do SIBH na data, para o diagrama (chaves
 * sibh-nivel:<id> e sibh-vazao:<id>): hoje, a leitura mais recente das últimas
 * 3 h; dia que já acabou, a média do dia.
 */
export async function leiturasPostos(ids: number[], data: string): Promise<Record<string, ValorPosto | null>> {
  const ord = [...new Set(ids)].filter((id) => POSTOS_SIBH.has(id)).sort((a, b) => a - b);
  if (!ord.length) return {};
  const hoje = data === hojeSp();
  const agora = Date.now();
  const ini = hoje ? agora - 3 * HORA : inicioDiaSp(data);
  const fim = hoje ? agora : ini + DIA;
  const chave = hoje ? `agora:${ord.join(',')}` : `dia:${data}:${ord.join(',')}`;
  const ttl = hoje ? 300 : fim + 2 * HORA > agora ? 600 : 30 * 86_400;
  const r = (await medicoes(SERVICO, { [chave]: { ids: ord, ini, fim, grupo: hoje ? 'minute' : 'hour', ttlSeg: ttl, timeoutMs: 60_000 } }))[chave] ?? null;
  const saida: Record<string, ValorPosto | null> = {};
  for (const id of ord) {
    const ls = leiturasDe(r, id);
    for (const qual of ['nivel', 'vazao'] as const) {
      const com = ls.filter((l) => l[qual] !== null);
      const chaveValor = `sibh-${qual}:${id}`;
      if (!com.length) saida[chaveValor] = null;
      else if (hoje) {
        const u = com.at(-1)!;
        saida[chaveValor] = { valor: u[qual]!, data: diaSp(u.t), hora: horaSp(u.t) };
      } else saida[chaveValor] = { valor: arred(media(com.map((l) => l[qual]!))!), data };
    }
  }
  return saida;
}

// ------------------------------------------------------------------ SSD

/** Totais mensais de chuva de um local do SSD (série mensal desde o início) até o fim do ano anterior a `ano`. */
const chuvaMensalSsd = (space: number, ano: number) => pontosMensais(space, VAR.chuva, '1970-01-01', `${ano - 1}-12-31`);

/** Dias do mês AAAA-MM. */
const diasNoMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
/** Primeiro dia do mês `n` meses antes do de `data`. */
function mesAntes(data: string, n: number): string {
  const d = new Date(Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1 - n, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Vazão descarregada mensal (média do mês na série mensal do SSD) de cada
 * reservatório e o total para o PCJ, com o volume do mês (média × dias). O mês
 * corrente conta só os dias com dado (`diasMesAtual`).
 */
/** Meses das séries mensais (AAAA-MM), em ordem, com o valor de cada série no mês (null se não tiver). */
function porMes(mensais: Ponto[][]) {
  const meses = [...new Set(mensais.flatMap((ps) => ps.map((p) => p.data.slice(0, 7))))].sort();
  return meses.map((mes) => ({ mes, vs: mensais.map((ps) => ps.find((p) => p.data.slice(0, 7) === mes)?.valor ?? null) }));
}

export function tabelaMensal(mensais: Ponto[][], diasMesAtual: number, mesAtual: string) {
  return porMes(mensais).map(({ mes, vs }) => {
    const completo = vs.every((v) => v !== null);
    const soma = completo ? vs.reduce((a, b) => a + b!, 0) : null;
    const total = soma === null ? null : arred(soma);
    const dias = mes === mesAtual ? diasMesAtual : diasNoMes(mes);
    return { mes, reservatorios: vs.map((v) => (v === null ? null : arred(v))), total, dias, parcial: mes === mesAtual, hm3: soma === null || !dias ? null : arred((soma * dias * 86_400) / 1e6) };
  });
}

/**
 * Soma do período da tabela mensal. Médias de vazão de meses diferentes não se
 * somam: a soma é do volume (média do mês × dias, mês a mês) de cada
 * reservatório e do total, e a vazão do período é a média ponderada pelos
 * dias. Entram só os meses com os três reservatórios (os que têm total na
 * tabela); `foraDaSoma` conta os que ficaram de fora.
 */
export function somaMensal(mensais: Ponto[][], diasMesAtual: number, mesAtual: string) {
  const meses = porMes(mensais);
  const acumulado = mensais.map(() => 0); // m³/s × dias
  const usados: string[] = [];
  let dias = 0;
  for (const { mes, vs } of meses) {
    const d = mes === mesAtual ? diasMesAtual : diasNoMes(mes);
    if (!d || vs.some((v) => v === null)) continue;
    vs.forEach((v, i) => (acumulado[i]! += v! * d));
    dias += d;
    usados.push(mes);
  }
  if (!dias) return null;
  const paraHm3 = (x: number) => arred((x * 86_400) / 1e6);
  const total = acumulado.reduce((a, b) => a + b, 0);
  return {
    de: usados[0]!,
    ate: usados.at(-1)!,
    meses: usados.length,
    foraDaSoma: meses.length - usados.length,
    dias,
    hm3: acumulado.map(paraHm3),
    hm3Total: paraHm3(total),
    media: acumulado.map((x) => arred(x / dias)),
    mediaTotal: arred(total / dias),
  };
}

const ultimo = (ps: Ponto[], ate: string) => ps.filter((p) => p.data <= ate).at(-1) ?? null;

/** Faixa do art. 4º pelo volume útil do sistema no SSD (último dado dos 10 dias até a data). */
async function faixaNaData(data: string) {
  const vol = ultimo(await pontosDiarios(CANTAREIRA, VAR.volumePct, somarDias(data, -10), data), data);
  return vol ? { ...faixa925(vol.valor), volumePct: arred(vol.valor), dataVolume: vol.data } : null;
}

// ------------------------------------------------------------------ partes do painel

/**
 * Faixa de operação, Santa Inês e vazão despachada para o PCJ (SSD): a de
 * cada reservatório no último dia com dado, o volume despachado no mês (de 1º
 * até o último dia com os três reservatórios) e a série dos últimos 6 meses.
 */
export async function operacaoCantareira(data: string) {
  const inicioMes = `${data.slice(0, 8)}01`;
  const [faixa, santaInes, transposicao, mensais, ...descargas] = await Promise.all([
    faixaNaData(data),
    pontosDiarios(SANTA_INES, VAR.vazao, inicioMes, data),
    pontosDiarios(TRANSPOSICAO, VAR.vazao, inicioMes, data),
    Promise.all(RESERVATORIOS_PCJ.map((r) => pontosMensais(r.space, VAR.descarregada, mesAntes(data, 5), data).catch(() => [] as Ponto[]))),
    ...RESERVATORIOS_PCJ.map((r) => pontosDiarios(r.space, VAR.descarregada, somarDias(data, -182), data)),
  ]);
  // total por dia só onde os três reservatórios têm dado
  const porDia = new Map<string, number[]>();
  descargas.forEach((ps, i) => {
    for (const p of ps) {
      const l = porDia.get(p.data) ?? [NaN, NaN, NaN];
      l[i] = p.valor;
      porDia.set(p.data, l);
    }
  });
  const serieDias = [...porDia]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([d, vs]) => {
      const completo = vs.every((v) => Number.isFinite(v));
      const v = (i: number) => (Number.isFinite(vs[i]) ? arred(vs[i]!) : null);
      return { data: d, jaguari: v(0), cachoeira: v(1), atibainha: v(2), total: completo ? arred(vs.reduce((a, b) => a + b, 0)) : null };
    });
  const comTotal = serieDias.filter((d) => d.total !== null);
  const doMes = comTotal.filter((d) => d.data >= inicioMes);
  const mediaMes = (ps: Ponto[]) => (ps.length ? arred(media(ps.map((p) => p.valor))!) : null);
  return {
    data,
    faixa,
    periodo: periodoHidrologico(data),
    santaInes: { ultimo: ultimo(santaInes, data), mediaMes: mediaMes(santaInes), dias: santaInes.length, transposicaoMes: mediaMes(transposicao) },
    despachada: {
      reservatorios: RESERVATORIOS_PCJ.map((r, i) => {
        const doMesR = descargas[i]!.filter((p) => p.data >= inicioMes && p.data <= data);
        return { chave: r.chave, nome: r.nome, rio: r.rio, ultimo: ultimo(descargas[i]!, data), mediaMes: doMesR.length ? arred(media(doMesR.map((p) => p.valor))!) : null };
      }),
      total: comTotal.at(-1) ? { valor: comTotal.at(-1)!.total!, data: comTotal.at(-1)!.data } : null,
      mes: doMes.length
        ? { hm3: hm3(doMes.map((d) => d.total!)), mediaM3s: arred(media(doMes.map((d) => d.total!))!), dias: doMes.length, de: doMes[0]!.data, ate: doMes.at(-1)!.data }
        : null,
      serie: serieDias,
      mensal: tabelaMensal(mensais, doMes.length, data.slice(0, 7)),
      somaMensal: somaMensal(mensais, doMes.length, data.slice(0, 7)),
    },
  };
}

export type OperacaoCantareira = Awaited<ReturnType<typeof operacaoCantareira>>;

/**
 * Chuva por radar nas bacias dos três reservatórios do PCJ: hoje (até a última
 * leitura), dia a dia no mês e a média climatológica do mês (totais mensais do
 * SSD de cada reservatório, nos anos anteriores).
 */
export async function chuvaCantareira(data: string) {
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  const inicioMes = `${data.slice(0, 8)}01`;
  const [hoje, fechados, ...mensais] = await Promise.all([
    chuvaRadarDia(RADARES_CANTAREIRA, data).catch(() => ({}) as Awaited<ReturnType<typeof chuvaRadarDia>>),
    data > inicioMes ? radarDiasFechados(data) : Promise.resolve([] as Medicao[]),
    ...RESERVATORIOS_PCJ.map((r) => chuvaMensalSsd(r.space, ano).catch(() => [] as Ponto[])),
  ]);
  const porDia = chuvaPorDia(fechados);
  const dias: string[] = [];
  for (let d = inicioMes; d <= data; d = somarDias(d, 1)) dias.push(d);
  // o radar só tem leituras no SIBH desde 10/11/2026 (conferido em 16/11/2026): o primeiro dia com leitura, se cair no mês
  const comLeitura = RESERVATORIOS_PCJ.flatMap((r) => Object.keys(porDia[String(r.radar)] ?? {})).sort()[0];
  return {
    data,
    radarDesde: comLeitura && comLeitura > inicioMes ? comLeitura : null,
    bacias: RESERVATORIOS_PCJ.map((r, i) => {
      const h = hoje[`radar:${r.radar}`] ?? null;
      const doDia = (d: string) => (d === data ? (h?.valor ?? null) : (porDia[String(r.radar)]?.[d] ?? null));
      return {
        chave: r.chave,
        reservatorio: r.nome,
        radar: r.radar,
        nome: nomeRadar(r.radar),
        hoje: h,
        dias: dias.map((d) => ({ data: d, mm: doDia(d) === null ? null : arred(doDia(d)!, 1) })),
        climatologia: climatologiaMes(mensais[i]!, mes, ano),
      };
    }),
  };
}

export type ChuvaCantareira = Awaited<ReturnType<typeof chuvaCantareira>>;

/**
 * Chuva de 1, 24, 48 e 72 h até `ate` (ms) de um posto de radar: as horas
 * fechadas (antes de 00h de `data`, de hora em hora: a janela começa na hora
 * cheia) mais as leituras de 10 min do dia. null sem nenhuma leitura.
 */
export function janelasChuva(fechados: Medicao[] | null, doDia: Medicao[] | null, id: number, data: string, ate: number) {
  const meu = (med: Medicao[] | null) => (med ?? []).filter((m) => m[0] === String(id) && m[2] !== null);
  const [f, d] = [meu(fechados), meu(doDia)];
  if (!f.length && !d.length) return null;
  const corte = inicioDiaSp(data);
  const soma = (h: number) => {
    const ini = ate - h * HORA;
    const a = somaEntre(f, Math.floor(ini / HORA) * HORA, corte)[String(id)] ?? 0;
    const b = somaEntre(d, ini, ate + 1)[String(id)] ?? 0;
    return arred(a + b, 1);
  };
  const ultima = d.length ? Math.max(...d.map((m) => instante(m[1]))) : null;
  return { h1: soma(1), h24: soma(24), h48: soma(48), h72: soma(72), ate: ultima === null ? null : horaSp(ultima) };
}

/**
 * Postos de controle (Valinhos, Atibaia, Buenópolis): leitura mais recente,
 * média do dia anterior, média móvel de 15 dias até o dia anterior, as médias
 * diárias dos últimos 15 dias com a média móvel de cada um, as leituras hora a
 * hora dos últimos 7 dias e a chuva por radar da bacia em 1, 24, 48 e 72 h.
 */
export async function postosControle(data: string) {
  const ehHoje = data === hojeSp();
  const fimJanela = ehHoje ? Date.now() : inicioDiaSp(data) + DIA;
  const [faixa, agora, radarFechado, radarHoje, ...series] = await Promise.all([
    faixaNaData(data).catch(() => null),
    ehHoje ? leiturasPostos(POSTOS_CANTAREIRA, data).catch(() => ({}) as Record<string, ValorPosto | null>) : Promise.resolve({} as Record<string, ValorPosto | null>),
    radarDiasFechados(data),
    radarDoDia(data),
    ...POSTOS_CONTROLE.map(async (p) => {
      const [fechadas, hoje] = await Promise.all([horasFechadas(p.id, data), horasDoDia(p.id, data)]);
      return { fechadas, hoje };
    }),
  ]);
  const ontem = somarDias(data, -1);
  return {
    data,
    faixa,
    periodo: periodoHidrologico(data),
    metas15d: METAS_15D,
    postos: POSTOS_CONTROLE.map((p, i) => {
      const s = series[i]!;
      const fechadas = leiturasDe(s.fechadas, p.id);
      const doDia = leiturasDe(s.hoje, p.id);
      const dias = mediasDiarias(fechadas);
      const diaAtual = mediasDiarias(doDia).find((d) => d.data === data) ?? null;
      const d15 = Array.from({ length: 15 }, (_, k) => somarDias(data, k - 15)); // os 15 dias fechados
      const nivelAgora = agora[`sibh-nivel:${p.id}`];
      const vazaoAgora = agora[`sibh-vazao:${p.id}`];
      return {
        ...p,
        radarNome: nomeRadar(p.radar),
        semDados: s.fechadas === null && s.hoje === null,
        atual: nivelAgora || vazaoAgora ? { nivel: nivelAgora?.valor ?? null, vazao: vazaoAgora?.valor ?? null, hora: (vazaoAgora ?? nivelAgora)!.hora ?? null, data: (vazaoAgora ?? nivelAgora)!.data } : null,
        diaAtual,
        diaAnterior: dias.find((d) => d.data === ontem) ?? null,
        mm15: mediaMovel(dias, ontem),
        minimoDiario: (faixa?.minimoDiario ?? FAIXAS_925[0]!.minimoDiario)[p.chave],
        meta15d: faixa?.metas15d?.[p.chave] ?? null,
        chuva: janelasChuva(radarFechado, radarHoje, p.radar, data, fimJanela),
        dias: d15.map((d) => ({ data: d, vazao: dias.find((x) => x.data === d)?.vazao ?? null, mm15: mediaMovel(dias, d)?.valor ?? null })),
        horas: [...fechadas.filter((l) => l.t >= inicioDiaSp(data) - 6 * DIA), ...doDia].map((l) => ({ t: l.t, nivel: l.nivel, vazao: l.vazao })),
      };
    }),
  };
}

export type PostosControle = Awaited<ReturnType<typeof postosControle>>;

/**
 * Gráficos de um posto do SIBH do diagrama (ao clicar): médias diárias de
 * vazão e nível nos últimos 30 dias (o de hoje até agora) e a chuva por radar
 * da bacia dele no mesmo período.
 */
export async function graficosPosto(id: number, data: string) {
  const p = POSTOS_SIBH.get(id);
  if (!p) return null;
  // as consultas de radar e de leituras atuais são as do diagrama do posto (mesmas chaves de cache)
  const diag = Object.values(DIAGRAMAS_UNIFILARES).find((x) => x.nos.some((n) => ehPostoSibh(n) && n.sibh.id === id))!;
  const radares = (diag.radares ?? []).map((r) => r.id).sort((a, b) => a - b);
  const radaresIgual = radares.join(',') === RADARES_CANTAREIRA.join(',') ? RADARES_CANTAREIRA : radares;
  const ehHoje = data === hojeSp();
  const [fechadas, hoje, radarFechado, radarHoje, agora] = await Promise.all([
    horasFechadas(id, data),
    horasDoDia(id, data),
    radarDiasFechados(data, radaresIgual),
    radarDoDia(data, radaresIgual),
    ehHoje ? leiturasPostos(diag.nos.filter(ehPostoSibh).map((n) => n.sibh.id), data).catch(() => ({}) as Record<string, ValorPosto | null>) : Promise.resolve({} as Record<string, ValorPosto | null>),
  ]);
  const nivelAgora = agora[`sibh-nivel:${id}`];
  const vazaoAgora = agora[`sibh-vazao:${id}`];
  const dias = mediasDiarias([...leiturasDe(fechadas, id), ...leiturasDe(hoje, id)]);
  const chuvaFechada = chuvaPorDia(radarFechado)[String(p.no.sibh.radar)] ?? {};
  const chuvaHoje = chuvaPorDia(radarHoje)[String(p.no.sibh.radar)]?.[data];
  const periodo = Array.from({ length: 30 }, (_, k) => somarDias(data, k - 29));
  return {
    data,
    id,
    prefixo: p.no.prefixo ?? '',
    nome: p.no.nome,
    radar: p.radar ? { id: p.radar.id, nome: p.radar.nome, prefixo: p.radar.prefixo } : null,
    semDados: fechadas === null && hoje === null,
    atual: nivelAgora || vazaoAgora ? { nivel: nivelAgora?.valor ?? null, vazao: vazaoAgora?.valor ?? null, hora: (vazaoAgora ?? nivelAgora)!.hora ?? null } : null,
    dias: periodo.map((d) => {
      const x = dias.find((y) => y.data === d);
      const mm = d === data ? chuvaHoje : chuvaFechada[d];
      // dia sem nenhuma leitura do radar fica vazio (o SIBH manda as horas sem chuva com 0)
      return { data: d, vazao: x?.vazao ?? null, nivel: x?.nivel ?? null, chuva: mm === undefined ? null : arred(mm, 1) };
    }),
  };
}

export type GraficosPosto = NonNullable<Awaited<ReturnType<typeof graficosPosto>>>;
