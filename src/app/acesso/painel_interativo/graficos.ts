import type { EChartsOption } from 'echarts';
import { TEMA } from './echart';

export type Ponto = { data: string; valor: number };

const COR = { atual: '#4fc3f7', anterior: '#8fa6bd', chuva: '#4fc3f7', acum: '#ffb020', natural: '#2ecc71', afluente: '#4fc3f7', defluente: '#c39bff', captada: '#ff7a8a', transf: '#ffb020', sobe: '#2ecc71', desce: '#ff6b6b' };

/** Faixas do Protocolo de Escassez (volume útil do sistema). */
const FAIXAS = [
  { y: 60, cor: '#f4b400', nome: 'E1' },
  { y: 40, cor: '#e08600', nome: 'E2' },
  { y: 30, cor: '#dc3545', nome: 'E3' },
  { y: 20, cor: '#b04ec2', nome: 'E4' },
];

export const dataBr = (d: string) => d.split('-').reverse().join('/');
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const fmt = (v: number | null | undefined, casas = 1, suf = '') =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}${suf}`;

/** Dias de `de` a `ate` (AAAA-MM-DD). */
export function dias(de: string, ate: string): string[] {
  const saida: string[] = [];
  for (let d = new Date(`${de}T12:00:00Z`); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) saida.push(d.toISOString().slice(0, 10));
  return saida;
}

/** Mesmo dia e mês no ano anterior (29/02 não existe: fica sem par). */
export const anoAnterior = (d: string) => {
  const a = `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
  return a.endsWith('-02-29') ? null : a;
};

const mapa = (ps: Ponto[] | undefined) => new Map((ps ?? []).map((p) => [p.data, p.valor]));
const eixoTempo = (rotulos: string[]) => ({ type: 'category' as const, data: rotulos, axisLabel: { color: TEMA.fraco }, axisLine: { lineStyle: { color: TEMA.grade } } });
const eixoValor = (nome: string, extra: object = {}) => ({
  type: 'value' as const,
  name: nome,
  nameTextStyle: { color: TEMA.fraco },
  axisLabel: { color: TEMA.fraco },
  splitLine: { lineStyle: { color: TEMA.grade } },
  ...extra,
});
const zoom = [{ type: 'inside' as const }, { type: 'slider' as const, height: 16, bottom: 8, textStyle: { color: TEMA.fraco }, borderColor: TEMA.grade }];

/** Gráfico 1 — volume útil no período × mesmo período do ano anterior, alinhados por dia e mês. */
export function opcaoEvolucao(volume: Ponto[] | undefined, periodo: string[], comFaixas: boolean, anoAtual: number): EChartsOption {
  const v = mapa(volume);
  return {
    tooltip: { trigger: 'axis', valueFormatter: (x) => fmt(x as number, 2, '%') },
    xAxis: eixoTempo(periodo.map(diaMes)),
    yAxis: eixoValor('%', { min: 0, max: (x: { max: number }) => Math.max(100, Math.ceil(x.max / 10) * 10) }),
    dataZoom: zoom,
    series: [
      {
        name: String(anoAtual),
        type: 'line',
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 3, color: COR.atual },
        itemStyle: { color: COR.atual },
        areaStyle: { color: 'rgba(79,195,247,.12)' },
        data: periodo.map((d) => v.get(d) ?? null),
        markLine: comFaixas
          ? { silent: true, symbol: 'none', label: { show: false }, data: FAIXAS.map((f) => ({ yAxis: f.y, lineStyle: { color: f.cor, type: 'dashed', width: 1.2 } })) }
          : undefined,
      },
      {
        name: String(anoAtual - 1),
        type: 'line',
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 2, type: 'dashed', color: COR.anterior },
        itemStyle: { color: COR.anterior },
        data: periodo.map((d) => {
          const a = anoAnterior(d);
          return a ? (v.get(a) ?? null) : null;
        }),
      },
    ],
  };
}

const acumular = (vals: (number | null)[]) => {
  let t = 0;
  return vals.map((x) => (x === null ? null : Math.round((t += x) * 10) / 10));
};

/** Gráfico 2 — chuva diária (barras) e acumulada no período, com o acumulado do ano anterior. */
export function opcaoChuva(chuva: Ponto[] | undefined, periodo: string[], anoAtual: number): EChartsOption {
  const c = mapa(chuva);
  const atual = periodo.map((d) => c.get(d) ?? null);
  const anterior = periodo.map((d) => {
    const a = anoAnterior(d);
    return a ? (c.get(a) ?? null) : null;
  });
  return {
    tooltip: { trigger: 'axis', valueFormatter: (x) => fmt(x as number, 1, ' mm') },
    xAxis: eixoTempo(periodo.map(diaMes)),
    yAxis: [eixoValor('mm/dia'), eixoValor('acumulado (mm)', { splitLine: { show: false } })],
    dataZoom: zoom,
    series: [
      { name: `Chuva diária ${anoAtual}`, type: 'bar', itemStyle: { color: COR.chuva, borderRadius: [3, 3, 0, 0] }, data: atual },
      { name: `Acumulado ${anoAtual}`, type: 'line', yAxisIndex: 1, showSymbol: false, lineStyle: { width: 3, color: COR.acum }, itemStyle: { color: COR.acum }, data: acumular(atual) },
      { name: `Acumulado ${anoAtual - 1}`, type: 'line', yAxisIndex: 1, showSymbol: false, lineStyle: { width: 2, type: 'dashed', color: COR.anterior }, itemStyle: { color: COR.anterior }, data: acumular(anterior) },
    ],
  };
}

/** Gráfico 3 — vazões natural, afluente e defluente (e transferências, quando houver). */
export function opcaoVazoes(series: { nome: string; pontos: Ponto[] | undefined; cor: string; tracejada?: boolean }[], periodo: string[]): EChartsOption {
  return {
    tooltip: { trigger: 'axis', valueFormatter: (x) => fmt(x as number, 2, ' m³/s') },
    xAxis: eixoTempo(periodo.map(diaMes)),
    yAxis: eixoValor('m³/s'),
    dataZoom: zoom,
    series: series.map((s) => {
      const m = mapa(s.pontos);
      return {
        name: s.nome,
        type: 'line' as const,
        showSymbol: false,
        lineStyle: { width: 2.2, color: s.cor, type: s.tracejada ? ('dashed' as const) : ('solid' as const) },
        itemStyle: { color: s.cor },
        data: periodo.map((d) => m.get(d) ?? null),
      };
    }),
  };
}

export const CORES_VAZAO = COR;

/**
 * Gráfico 6 — balanço: entradas (afluente) e saídas (defluente, captada) em
 * m³/s, e a variação do armazenamento convertida para m³/s (hm³/dia × 10⁶ ÷ 86 400).
 * Evaporação e perdas não são medidas: a conta não fecha exatamente.
 */
export function opcaoBalanco(afluente: Ponto[] | undefined, defluente: Ponto[] | undefined, captada: Ponto[] | undefined, volumeHm3: Ponto[] | undefined, periodo: string[]): EChartsOption {
  const a = mapa(afluente);
  const d = mapa(defluente);
  const c = mapa(captada);
  const v = mapa(volumeHm3);
  const variacao = periodo.map((dia, i) => {
    const hoje = v.get(dia);
    const ontem = i > 0 ? v.get(periodo[i - 1]!) : undefined;
    return hoje !== undefined && ontem !== undefined ? Math.round(((hoje - ontem) * 1e6) / 86_400 * 100) / 100 : null;
  });
  const neg = (m: Map<string, number>) => periodo.map((dia) => (m.has(dia) ? -m.get(dia)! : null));
  return {
    tooltip: { trigger: 'axis', valueFormatter: (x) => fmt(x === null || x === undefined ? null : Math.abs(x as number), 2, ' m³/s') },
    xAxis: eixoTempo(periodo.map(diaMes)),
    yAxis: eixoValor('m³/s'),
    dataZoom: zoom,
    series: [
      { name: 'Entrada (afluente)', type: 'bar', stack: 'b', itemStyle: { color: COR.afluente }, data: periodo.map((dia) => a.get(dia) ?? null) },
      { name: 'Saída (defluente)', type: 'bar', stack: 'b', itemStyle: { color: COR.defluente }, data: neg(d) },
      ...(captada?.length ? [{ name: 'Saída (captada)', type: 'bar' as const, stack: 'b', itemStyle: { color: COR.captada }, data: neg(c) }] : []),
      { name: 'Variação do armazenamento', type: 'line', showSymbol: false, lineStyle: { width: 2.5, color: COR.acum }, itemStyle: { color: COR.acum }, data: variacao },
    ],
  };
}

/** Gráfico 5 — variação diária do volume útil (p.p.): recuperação em verde, redução em vermelho. */
export function opcaoVariacao(volume: Ponto[] | undefined, periodo: string[]): EChartsOption {
  const v = mapa(volume);
  const dados = periodo.map((dia, i) => {
    const hoje = v.get(dia);
    const ontem = i > 0 ? v.get(periodo[i - 1]!) : undefined;
    return hoje !== undefined && ontem !== undefined ? Math.round((hoje - ontem) * 1000) / 1000 : null;
  });
  return {
    tooltip: { trigger: 'axis', valueFormatter: (x) => (x === null || x === undefined ? '—' : `${(x as number) > 0 ? '+' : ''}${fmt(x as number, 2, ' p.p.')}`) },
    xAxis: eixoTempo(periodo.map(diaMes)),
    yAxis: eixoValor('p.p./dia'),
    dataZoom: zoom,
    series: [{ name: 'Variação diária', type: 'bar', data: dados.map((x) => ({ value: x, itemStyle: { color: (x ?? 0) >= 0 ? COR.sobe : COR.desce } })) }],
  };
}

/** Gráfico 4 — contribuição de cada reservatório ao armazenamento (hm³). */
export function opcaoDistribuicao(itens: { nome: string; hm3: number | null; pct: number | null }[]): EChartsOption {
  const ord = [...itens].sort((x, y) => (x.hm3 ?? 0) - (y.hm3 ?? 0));
  const total = ord.reduce((t, i) => t + (i.hm3 ?? 0), 0);
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps) => {
        const p = (Array.isArray(ps) ? ps[0] : ps) as { dataIndex: number };
        const i = ord[p.dataIndex]!;
        return `<b>${i.nome}</b><br>${fmt(i.hm3, 2, ' hm³')} · ${fmt(total ? ((i.hm3 ?? 0) / total) * 100 : null, 1, '% do total')}<br>Volume útil: ${fmt(i.pct, 1, '%')}`;
      },
    },
    toolbox: { show: true, right: 4, top: 0, iconStyle: { borderColor: TEMA.fraco }, feature: { saveAsImage: { title: 'Baixar PNG', backgroundColor: TEMA.fundoExportacao, pixelRatio: 2 } } },
    grid: { left: 110, right: 70, top: 24, bottom: 24 },
    xAxis: eixoValor('hm³'),
    yAxis: { type: 'category', data: ord.map((i) => i.nome), axisLabel: { color: TEMA.texto } },
    series: [
      {
        name: 'Armazenamento',
        type: 'bar',
        data: ord.map((i) => i.hm3),
        itemStyle: { color: COR.atual, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: TEMA.texto, formatter: (p) => fmt(p.value as number, 1, ' hm³') },
      },
    ],
  };
}
