import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { lerXlsx, type Aba } from '../planilha-xlsx';
import { pontosDiarios, VAR } from './painel-interativo';
import type { Ponto } from '../integracoes/ssd';

/**
 * Acompanhamento dos volumes de espera e operacional dos sistemas produtores.
 *
 * O volume operacional (% do volume útil) de cada reservatório e mês vem da
 * planilha public/acesso/plan/dados_operacional_mensal_reservatorios.xlsx
 * (uma aba por sistema); o de espera é o restante (100 − operacional). O
 * período de espera vai de dezembro a maio e o operacional de junho a
 * novembro. Do SSD vêm a capacidade de volume útil (hm³ ÷ %) e o volume útil
 * diário de cada reservatório.
 */

const PLANILHA = path.join(process.cwd(), 'public', 'acesso', 'plan', 'dados_operacional_mensal_reservatorios.xlsx');

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export type Periodo = 'chuvoso' | 'seco';
export const ROTULO_PERIODO: Record<Periodo, string> = { chuvoso: 'dez–mai', seco: 'jun–nov' };
/** Meses (1–12) de cada período. */
const MESES_PERIODO: Record<Periodo, number[]> = { chuvoso: [12, 1, 2, 3, 4, 5], seco: [6, 7, 8, 9, 10, 11] };
export const periodoDoMes = (mes: number): Periodo => (MESES_PERIODO.seco.includes(mes) ? 'seco' : 'chuvoso');

/**
 * Sistemas com aba na planilha; `aba` casa com o nome da aba, sem acentos.
 * `periodos`: o operacional muda entre o período chuvoso (dez–mai) e o seco
 * (jun–nov) — só no Cantareira; nos outros, a tela mostra o mês atual.
 */
export const SISTEMAS: Record<string, { nome: string; aba: RegExp; periodos: boolean; reservatorios: { nome: string; space: number }[] }> = {
  cantareira: {
    nome: 'Cantareira',
    aba: /cantareira/,
    periodos: true,
    reservatorios: [
      { nome: 'Jaguari–Jacareí', space: 20 },
      { nome: 'Cachoeira', space: 15 },
      { nome: 'Atibainha', space: 12 },
      { nome: 'Paiva Castro', space: 22 },
    ],
  },
  'alto-tiete': {
    nome: 'Alto Tietê',
    aba: /altotiete/,
    periodos: false,
    reservatorios: [
      { nome: 'Biritiba', space: 14 },
      { nome: 'Jundiaí', space: 21 },
      { nome: 'Paraitinga', space: 23 },
      { nome: 'Ponte Nova', space: 26 },
      { nome: 'Taiaçupeba', space: 32 },
    ],
  },
  guarapiranga: { nome: 'Guarapiranga', aba: /guarapiranga/, periodos: false, reservatorios: [{ nome: 'Guarapiranga', space: 19 }] },
};

/** Nome sem acentos, espaços e traços, para casar "Jaguari–Jacareí" com "Jaguari-Jacarei". */
const chave = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
const numero = (s: string | undefined) => {
  const t = (s ?? '').trim().replace(',', '.');
  const v = Number(t);
  return t && Number.isFinite(v) ? v : null;
};
/** "Jan", "Janeiro", "jan." → 1. */
const mesDe = (s: string | undefined) => MESES.findIndex((m) => chave(m) === chave(s ?? '').slice(0, 3)) + 1;

type Operacional = Map<string, (number | null)[]>;

/**
 * Operacional (%) por reservatório e mês de uma aba. Aceita os três formatos
 * da planilha: uma linha por reservatório e mês (Cantareira), um reservatório
 * por coluna com os nomes na 2ª linha (Alto Tietê) e só "Mês; Operacional"
 * (um reservatório, com o nome do sistema).
 */
function operacionalDaAba(aba: Aba, sistema: string): Operacional {
  const mapa: Operacional = new Map();
  const por = (nome: string) => {
    const k = chave(nome);
    if (!mapa.has(k)) mapa.set(k, Array<number | null>(12).fill(null));
    return mapa.get(k)!;
  };
  const [cab = [], segunda = []] = aba.linhas;
  const iOper = cab.findIndex((c) => chave(c).startsWith('operacional'));
  if (chave(cab[0] ?? '').startsWith('reservatorio')) {
    for (const l of aba.linhas.slice(1)) {
      const m = mesDe(l[1]);
      if (l[0]?.trim() && m) por(l[0])[m - 1] = numero(l[iOper]);
    }
  } else if (segunda.slice(1).some((c) => c.trim() && numero(c) === null)) {
    for (const l of aba.linhas.slice(2)) {
      const m = mesDe(l[0]);
      if (m) segunda.forEach((nome, i) => i > 0 && nome.trim() && (por(nome)[m - 1] = numero(l[i])));
    }
  } else {
    for (const l of aba.linhas.slice(1)) {
      const m = mesDe(l[0]);
      if (m) por(sistema)[m - 1] = numero(l[iOper]);
    }
  }
  return mapa;
}

async function lerPlanilha(sistema: string): Promise<Operacional> {
  const def = SISTEMAS[sistema]!;
  const aba = lerXlsx(await readFile(PLANILHA)).find((a) => def.aba.test(chave(a.nome)));
  return aba ? operacionalDaAba(aba, def.nome) : new Map();
}

const arred = (v: number, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas;
/** Menor e maior valor; iguais quando o valor não muda no período. */
export type Faixa = { min: number; max: number } | null;
const faixa = (vs: (number | null)[]): Faixa => {
  const ok = vs.filter((v): v is number => v !== null);
  return ok.length === vs.length && ok.length ? { min: arred(Math.min(...ok)), max: arred(Math.max(...ok)) } : null;
};

export type LinhaReservatorio = {
  nome: string;
  /** capacidade de volume útil (hm³), calculada pelo SSD */
  utilHm3: number | null;
  /** operacional (%) mês a mês (jan = 0), da planilha */
  operacional: (number | null)[];
  /** operacional (%) de cada período: um valor ou a faixa, se muda de mês a mês */
  periodo: Record<Periodo, Faixa>;
  atualPct: number | null;
  dataAtual: string | null;
  /** operacional (%) do mês da leitura */
  limiteMes: number | null;
  /** volume útil (%) no fim de cada mês (jan = 0), no ano e no anterior */
  mensal: { volume: (number | null)[]; volumeAnterior: (number | null)[] };
  erro?: string;
};

export type Totais = Record<Periodo, { espera: { hm3: Faixa; pct: Faixa }; operacional: { hm3: Faixa; pct: Faixa } }>;
/** Espera e operacional do sistema num mês (hm³ e %). */
export type TotaisMes = { esperaHm3: number; esperaPct: number; operacionalHm3: number; operacionalPct: number };
/** Mês a mês do sistema (jan = 0): volume útil (%) no último dia com leitura do mês, no ano e no anterior, e operacional (%). */
export type Mensal = { volume: (number | null)[]; volumeAnterior: (number | null)[]; operacional: (number | null)[] };

/** Último valor de cada mês de um ano (jan = 0). */
const fimDeMes = (ps: Ponto[], ano: number) => {
  const r = Array<Ponto | null>(12).fill(null);
  for (const p of ps) {
    if (Number(p.data.slice(0, 4)) !== ano) continue;
    const m = Number(p.data.slice(5, 7)) - 1;
    if (!r[m] || p.data > r[m]!.data) r[m] = p;
  }
  return r;
};

export async function volumesEspera(sistema: string, hoje: string) {
  const def = SISTEMAS[sistema]!;
  const planilha = await lerPlanilha(sistema);
  const ano = Number(hoje.slice(0, 4));
  const de = `${ano - 1}-01-01`;

  const dados = await Promise.all(
    def.reservatorios.map(async (r) => {
      const operacional = planilha.get(chave(r.nome)) ?? Array<number | null>(12).fill(null);
      const periodo = {
        chuvoso: faixa(MESES_PERIODO.chuvoso.map((m) => operacional[m - 1] ?? null)),
        seco: faixa(MESES_PERIODO.seco.map((m) => operacional[m - 1] ?? null)),
      };
      try {
        const [pct, hm3] = await Promise.all([pontosDiarios(r.space, VAR.volumePct, de, hoje), pontosDiarios(r.space, VAR.volumeHm3, de, hoje)]);
        const ultimo = pct.filter((p) => p.valor > 0).sort((a, b) => a.data.localeCompare(b.data)).at(-1) ?? null;
        const doDia = ultimo ? hm3.find((p) => p.data === ultimo.data) : undefined;
        const vol = (a: number) => fimDeMes(pct, a).map((p) => (p ? arred(p.valor) : null));
        const linha: LinhaReservatorio = {
          nome: r.nome,
          mensal: { volume: vol(ano), volumeAnterior: vol(ano - 1) },
          utilHm3: ultimo && doDia ? arred(doDia.valor / (ultimo.valor / 100)) : null,
          operacional,
          periodo,
          atualPct: ultimo ? arred(ultimo.valor) : null,
          dataAtual: ultimo?.data ?? null,
          limiteMes: ultimo ? (operacional[Number(ultimo.data.slice(5, 7)) - 1] ?? null) : null,
        };
        return { linha, hm3 };
      } catch (e) {
        const linha: LinhaReservatorio = { nome: r.nome, mensal: { volume: Array(12).fill(null), volumeAnterior: Array(12).fill(null) }, utilHm3: null, operacional, periodo, atualPct: null, dataAtual: null, limiteMes: null, erro: (e as Error).message };
        return { linha, hm3: [] as Ponto[] };
      }
    }),
  );
  const linhas = dados.map((d) => d.linha);

  // Totais e gráfico só com todos os reservatórios completos: um total parcial enganaria.
  const completos = linhas.every((l) => l.utilHm3 !== null && l.operacional.every((v) => v !== null));
  if (!completos) return { linhas, totais: null, totaisMes: null, mensal: null, capacidadeHm3: null };

  const cap = linhas.reduce((t, l) => t + l.utilHm3!, 0);
  /** espera do sistema (hm³) em cada mês (jan = 0) */
  const esperaMes = MESES.map((_, m) => linhas.reduce((t, l) => t + (l.utilHm3! * (100 - l.operacional[m]!)) / 100, 0));
  const doPeriodo = (p: Periodo, f: (m: number) => number) => faixa(MESES_PERIODO[p].map((m) => arred(f(m - 1))));
  const total = (p: Periodo) => ({
    espera: { hm3: doPeriodo(p, (m) => esperaMes[m]!), pct: doPeriodo(p, (m) => (esperaMes[m]! / cap) * 100) },
    operacional: { hm3: doPeriodo(p, (m) => cap - esperaMes[m]!), pct: doPeriodo(p, (m) => ((cap - esperaMes[m]!) / cap) * 100) },
  });

  // Volume do sistema no fim de cada mês: soma dos hm³ dos reservatórios ÷ capacidade (só meses com todos).
  const volumeDoAno = (a: number) => {
    const fins = dados.map((d) => fimDeMes(d.hm3, a));
    return MESES.map((_, m) => (fins.every((f) => f[m]) ? arred((fins.reduce((t, f) => t + f[m]!.valor, 0) / cap) * 100) : null));
  };
  const mensal: Mensal = {
    volume: volumeDoAno(ano),
    volumeAnterior: volumeDoAno(ano - 1),
    operacional: esperaMes.map((e) => arred(((cap - e) / cap) * 100)),
  };
  const m = Number(hoje.slice(5, 7)) - 1;
  const totaisMes: TotaisMes = {
    esperaHm3: arred(esperaMes[m]!),
    esperaPct: arred((esperaMes[m]! / cap) * 100),
    operacionalHm3: arred(cap - esperaMes[m]!),
    operacionalPct: arred(((cap - esperaMes[m]!) / cap) * 100),
  };
  return { linhas, totais: { chuvoso: total('chuvoso'), seco: total('seco') } as Totais, totaisMes, mensal, capacidadeHm3: arred(cap) };
}
