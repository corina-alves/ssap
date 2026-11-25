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
    // sem eixo de tempo: só o botão de baixar (vem do EChart)
    toolbox: { feature: { dataZoom: { show: false }, restore: { show: false } } },
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

// ---------------------------------------------------------------- operação do Cantareira (cantareira.tsx)

/**
 * Cores dos três reservatórios que despejam no PCJ (e das bacias deles no
 * radar), na ordem fixa; validadas no fundo do painel (#11294b) com o
 * validador de paleta: faixa de luminosidade, croma, daltonismo e contraste.
 */
export const COR_RESERVATORIO = { jaguari: '#3b97d6', cachoeira: '#36a35c', atibainha: '#a476e0' } as const;
const COR_MM = '#d95926';
const COR_MINIMO = '#e66767';
const COR_REFERENCIA = '#9fb5cb';

type Lugar = 'insideEndTop' | 'insideEndBottom' | 'insideStartTop' | 'insideStartBottom' | 'insideMiddleTop' | 'insideMiddleBottom';
/** Linha de referência horizontal com o texto junto dela (linhas próximas: textos em lugares diferentes). */
const referencia = (y: number, texto: string, cor: string, tipo: 'dashed' | 'dotted' = 'dashed', lugar: Lugar = 'insideEndTop') => ({
  yAxis: y,
  lineStyle: { color: cor, type: tipo, width: 1.4 },
  label: { formatter: texto, position: lugar, color: TEMA.texto, fontSize: 11 },
});
/** Legenda à esquerda, sem chegar nos botões da barra de ferramentas (à direita). */
const legenda = { type: 'scroll' as const, top: 0, left: 0, right: 118, textStyle: { color: TEMA.texto }, pageTextStyle: { color: TEMA.texto } };

type Dica = { dataIndex: number; seriesIndex: number; marker: string; seriesName: string; value: unknown };
const lista = (ps: unknown) => (Array.isArray(ps) ? ps : [ps]) as Dica[];

/** Vazão despachada (descarregada) de cada reservatório para o PCJ, empilhada: o topo é o total. */
export function opcaoDespachada(serie: { data: string; jaguari: number | null; cachoeira: number | null; atibainha: number | null; total: number | null }[]): EChartsOption {
  const camada = (nome: string, chave: 'jaguari' | 'cachoeira' | 'atibainha') => ({
    name: nome,
    type: 'line' as const,
    stack: 'pcj',
    step: 'middle' as const,
    showSymbol: false,
    lineStyle: { width: 1.5, color: COR_RESERVATORIO[chave] },
    itemStyle: { color: COR_RESERVATORIO[chave] },
    areaStyle: { color: COR_RESERVATORIO[chave], opacity: 0.55 },
    data: serie.map((d) => d[chave]),
  });
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => {
        const l = lista(ps);
        const d = serie[l[0]?.dataIndex ?? 0];
        return `<b>${d ? dataBr(d.data) : ''}</b><br>${l.map((p) => `${p.marker}${p.seriesName}: ${fmt(p.value as number | null, 2, ' m³/s')}`).join('<br>')}<br><b>Total para o PCJ: ${fmt(d?.total, 2, ' m³/s')}</b>`;
      },
    },
    legend: legenda,
    grid: { left: 52, right: 24, top: 58, bottom: 56 },
    xAxis: eixoTempo(serie.map((d) => diaMes(d.data))),
    yAxis: eixoValor('m³/s'),
    dataZoom: zoom,
    series: [camada('Jaguari/Jacareí (Rio Jaguari)', 'jaguari'), camada('Cachoeira (Rio Atibaia)', 'cachoeira'), camada('Atibainha (Rio Atibaia)', 'atibainha')],
  };
}

const LUGARES_MEDIA: Lugar[] = ['insideStartTop', 'insideEndTop', 'insideMiddleBottom'];

/**
 * Chuva por radar no mês nas bacias dos reservatórios: o acumulado dia a dia de
 * cada bacia (linhas) e a média climatológica do mês de cada reservatório
 * (tracejadas, mesma cor); a chuva de cada dia vai na dica.
 */
export function opcaoChuvaRadarMes(
  dias: string[],
  bacias: { chave: 'jaguari' | 'cachoeira' | 'atibainha'; reservatorio: string; dias: { data: string; mm: number | null }[]; climatologia: { media: number } | null }[],
): EChartsOption {
  const porDia = bacias.map((b) => new Map(b.dias.map((d) => [d.data, d.mm])));
  const max = Math.max(0, ...bacias.map((b) => b.climatologia?.media ?? 0), ...bacias.map((_, i) => acumular(dias.map((d) => porDia[i]!.get(d) ?? null)).reduce<number>((m, x) => Math.max(m, x ?? 0), 0)));
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => {
        const l = lista(ps);
        const dia = dias[l[0]?.dataIndex ?? 0]!;
        const linhas = l.map((p) => {
          const b = bacias[p.seriesIndex]!;
          return `${p.marker}${b.reservatorio}: ${fmt(porDia[p.seriesIndex]!.get(dia), 1, ' mm')} no dia · ${fmt(p.value as number | null, 1, ' mm')} no mês${b.climatologia ? ` (média do mês: ${fmt(b.climatologia.media, 0, ' mm')})` : ''}`;
        });
        return `<b>${dataBr(dia)}</b><br>${linhas.join('<br>')}`;
      },
    },
    legend: legenda,
    grid: { left: 52, right: 16, top: 58, bottom: 28 },
    xAxis: eixoTempo(dias.map(diaMes)),
    yAxis: eixoValor('mm no mês', { min: 0, max: Math.max(10, Math.ceil((max * 1.12) / 10) * 10) }),
    series: bacias.map((b, i) => ({
      name: b.reservatorio,
      type: 'line' as const,
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 2, color: COR_RESERVATORIO[b.chave] },
      itemStyle: { color: COR_RESERVATORIO[b.chave] },
      data: acumular(dias.map((d) => porDia[i]!.get(d) ?? null)),
      markLine: b.climatologia
        ? { silent: true, symbol: 'none', data: [referencia(b.climatologia.media, `média ${b.reservatorio}: ${fmt(b.climatologia.media, 0, ' mm')}`, COR_RESERVATORIO[b.chave], 'dashed', LUGARES_MEDIA[i % 3]!)] }
        : undefined,
    })),
  };
}

/**
 * Posto de controle, 15 dias: vazão média de cada dia (barras), a média móvel de
 * 15 dias (linha) e as metas de média móvel das Faixas 1–2 e 3–4 e a mínima
 * média diária (Res. ANA/DAEE 925, art. 5º, §§ 2º e 3º).
 */
export function opcaoControle15(dias: { data: string; vazao: number | null; mm15: number | null }[], metas: { faixas12: number; faixas34: number }, minimoDiario: number | null): EChartsOption {
  const linhas = [
    referencia(metas.faixas12, `meta Faixas 1–2: ${fmt(metas.faixas12, 1, ' m³/s')}`, COR_REFERENCIA, 'dashed', 'insideEndTop'),
    referencia(metas.faixas34, `meta Faixas 3–4: ${fmt(metas.faixas34, 1, ' m³/s')}`, COR_REFERENCIA, 'dotted', 'insideEndBottom'),
  ];
  // a mínima diária igual a uma meta (Atibaia e Buenópolis nas Faixas 3–4) iria em cima dela: só o texto da meta
  if (minimoDiario !== null && minimoDiario !== metas.faixas34 && minimoDiario !== metas.faixas12) linhas.push(referencia(minimoDiario, `mínima diária: ${fmt(minimoDiario, 1, ' m³/s')}`, COR_MINIMO, 'dashed', 'insideStartBottom'));
  const max = Math.max(...dias.flatMap((d) => [d.vazao ?? 0, d.mm15 ?? 0]), metas.faixas12);
  return {
    tooltip: { trigger: 'axis', valueFormatter: (x) => fmt(x as number, 2, ' m³/s') },
    legend: legenda,
    grid: { left: 46, right: 16, top: 58, bottom: 28 },
    xAxis: eixoTempo(dias.map((d) => diaMes(d.data))),
    yAxis: eixoValor('m³/s', { min: 0, max: Math.ceil(max * 1.15) }),
    series: [
      { name: 'Média do dia', type: 'bar', barMaxWidth: 18, itemStyle: { color: COR_RESERVATORIO.jaguari, borderRadius: [4, 4, 0, 0] }, data: dias.map((d) => d.vazao), markLine: { silent: true, symbol: 'none', data: linhas } },
      { name: 'Média móvel de 15 dias', type: 'line', showSymbol: true, symbolSize: 8, lineStyle: { width: 2, color: COR_MM }, itemStyle: { color: COR_MM }, data: dias.map((d) => d.mm15) },
    ],
  };
}

const horaBr = (t: number) => new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Posto de controle, 7 dias hora a hora: vazão em cima (com a mínima média
 * diária) e nível embaixo, cada um no seu gráfico, com o mesmo eixo do tempo.
 */
export function opcaoControle7(horas: { t: number; nivel: number | null; vazao: number | null }[], minimoDiario: number | null): EChartsOption {
  const eixoHora = (grade: number, rotulos: boolean) => ({
    type: 'time' as const,
    gridIndex: grade,
    axisLabel: { show: rotulos, color: TEMA.fraco, formatter: (v: number) => new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }) },
    axisLine: { lineStyle: { color: TEMA.grade } },
    splitLine: { show: false },
  });
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      formatter: (ps) => {
        const l = lista(ps);
        const v = (p: Dica) => p.value as [number, number | null];
        return `<b>${l[0] ? horaBr(v(l[0])[0]) : ''}</b><br>${l.map((p) => `${p.marker}${p.seriesName}: ${fmt(v(p)[1], 2, p.seriesName === 'Nível' ? ' m' : ' m³/s')}`).join('<br>')}`;
      },
    },
    legend: legenda,
    grid: [
      { left: 46, right: 16, top: 60, height: '30%' },
      { left: 46, right: 16, top: '70%', bottom: 26 },
    ],
    xAxis: [eixoHora(0, false), eixoHora(1, true)],
    yAxis: [
      eixoValor('vazão (m³/s)', {
        gridIndex: 0,
        splitNumber: 3,
        min: (v: { min: number }) => Math.max(0, Math.floor(Math.min(v.min, minimoDiario ?? v.min) * 0.9)),
        nameTextStyle: { color: TEMA.fraco, align: 'left' },
      }),
      eixoValor('nível (m)', { gridIndex: 1, scale: true, splitNumber: 2, nameTextStyle: { color: TEMA.fraco, align: 'left' } }),
    ],
    series: [
      {
        name: 'Vazão',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 2, color: COR_RESERVATORIO.jaguari },
        itemStyle: { color: COR_RESERVATORIO.jaguari },
        data: horas.map((h) => [h.t, h.vazao]),
        markLine: minimoDiario === null ? undefined : { silent: true, symbol: 'none', data: [referencia(minimoDiario, `mínima diária: ${fmt(minimoDiario, 1, ' m³/s')}`, COR_MINIMO)] },
      },
      { name: 'Nível', type: 'line', xAxisIndex: 1, yAxisIndex: 1, showSymbol: false, lineStyle: { width: 2, color: COR_RESERVATORIO.cachoeira }, itemStyle: { color: COR_RESERVATORIO.cachoeira }, data: horas.map((h) => [h.t, h.nivel]) },
    ],
  };
}

/**
 * Posto do diagrama: vazão (em cima) e nível (embaixo) médios de cada dia, cada
 * um no seu gráfico com o mesmo eixo do tempo; a dica mostra os dois. Posto que
 * só mede nível: só o nível.
 */
export function opcaoPostoDias(dias: { data: string; vazao: number | null; nivel: number | null }[]): EChartsOption {
  const comVazao = dias.some((d) => d.vazao !== null);
  const rotulos = dias.map((d) => diaMes(d.data));
  const eixoX = (grade: number, mostrar: boolean) => ({ ...eixoTempo(rotulos), gridIndex: grade, axisLabel: { show: mostrar, color: TEMA.fraco } });
  const nivel = {
    name: 'Nível médio',
    type: 'line' as const,
    xAxisIndex: comVazao ? 1 : 0,
    yAxisIndex: comVazao ? 1 : 0,
    showSymbol: true,
    symbolSize: 6,
    lineStyle: { width: 2, color: COR_RESERVATORIO.cachoeira },
    itemStyle: { color: COR_RESERVATORIO.cachoeira },
    data: dias.map((d) => d.nivel),
  };
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      formatter: (ps) => {
        const d = dias[lista(ps)[0]?.dataIndex ?? 0];
        return d ? `<b>${dataBr(d.data)}</b>${comVazao ? `<br>Vazão média: ${fmt(d.vazao, 2, ' m³/s')}` : ''}<br>Nível médio: ${fmt(d.nivel, 2, ' m')}` : '';
      },
    },
    legend: legenda,
    grid: comVazao
      ? [
          { left: 52, right: 16, top: 52, height: '27%' },
          { left: 52, right: 16, top: '63%', bottom: 50 },
        ]
      : [{ left: 52, right: 16, top: 52, bottom: 50 }],
    xAxis: comVazao ? [eixoX(0, false), eixoX(1, true)] : [eixoX(0, true)],
    yAxis: comVazao
      ? [eixoValor('vazão (m³/s)', { gridIndex: 0, scale: true, splitNumber: 3, nameTextStyle: { color: TEMA.fraco, align: 'left' } }), eixoValor('nível (m)', { gridIndex: 1, scale: true, splitNumber: 3, nameTextStyle: { color: TEMA.fraco, align: 'left' } })]
      : [eixoValor('nível (m)', { gridIndex: 0, scale: true, nameTextStyle: { color: TEMA.fraco, align: 'left' } })],
    dataZoom: [{ type: 'inside' as const, xAxisIndex: comVazao ? [0, 1] : [0] }, { type: 'slider' as const, xAxisIndex: comVazao ? [0, 1] : [0], height: 14, bottom: 6, textStyle: { color: TEMA.fraco }, borderColor: TEMA.grade }],
    series: comVazao
      ? [{ name: 'Vazão média', type: 'line' as const, xAxisIndex: 0, yAxisIndex: 0, showSymbol: true, symbolSize: 6, lineStyle: { width: 2, color: COR_RESERVATORIO.jaguari }, itemStyle: { color: COR_RESERVATORIO.jaguari }, data: dias.map((d) => d.vazao) }, nivel]
      : [nivel],
  };
}

/** Chuva por radar na bacia: a de cada dia (barras) e o acumulado no período (linha), no mesmo eixo (mm). */
export function opcaoChuvaDias(dias: { data: string; chuva: number | null }[]): EChartsOption {
  const v = dias.map((d) => d.chuva);
  return {
    tooltip: { trigger: 'axis', valueFormatter: (x) => fmt(x as number, 1, ' mm') },
    legend: legenda,
    grid: { left: 52, right: 16, top: 58, bottom: 56 },
    xAxis: eixoTempo(dias.map((d) => diaMes(d.data))),
    yAxis: eixoValor('mm', { min: 0 }),
    dataZoom: zoom,
    series: [
      { name: 'Chuva do dia', type: 'bar', barMaxWidth: 12, itemStyle: { color: COR_RESERVATORIO.jaguari, borderRadius: [4, 4, 0, 0] }, data: v },
      { name: 'Acumulado no período', type: 'line', showSymbol: false, lineStyle: { width: 2, color: COR_MM }, itemStyle: { color: COR_MM }, data: acumular(v) },
    ],
  };
}

// ---------------------------------------------------------------- reservatório clicado num diagrama (grafico-reservatorio.tsx)

type DiaRes = { data: string; volumePct: number | null; volumeHm3: number | null; nivel: number | null; afluente: number | null; defluente: number | null };

const linhaDias = (nome: string, cor: string, valores: (number | null)[]) => ({
  name: nome,
  type: 'line' as const,
  showSymbol: true,
  symbolSize: 6,
  connectNulls: false,
  lineStyle: { width: 2, color: cor },
  itemStyle: { color: cor },
  data: valores,
});

/** Volume útil (%) de cada dia de um reservatório; hm³ e nível na dica. */
export function opcaoVolumeDias(dias: DiaRes[]): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => {
        const d = dias[lista(ps)[0]?.dataIndex ?? 0];
        if (!d) return '';
        const hm3 = d.volumeHm3 === null ? '' : ` (${fmt(d.volumeHm3, 2, ' hm³')})`;
        return `<b>${dataBr(d.data)}</b><br>Volume útil: ${fmt(d.volumePct, 2, '%')}${hm3}<br>Nível: ${fmt(d.nivel, 2, ' m')}`;
      },
    },
    legend: legenda,
    grid: { left: 52, right: 16, top: 52, bottom: 50 },
    xAxis: eixoTempo(dias.map((d) => diaMes(d.data))),
    yAxis: eixoValor('%', { scale: true, splitNumber: 4 }),
    dataZoom: zoom,
    series: [linhaDias('Volume útil', COR_RESERVATORIO.jaguari, dias.map((d) => d.volumePct))],
  };
}

/** Vazões afluente e defluente de cada dia de um reservatório. */
export function opcaoVazoesDias(dias: DiaRes[]): EChartsOption {
  return {
    tooltip: { trigger: 'axis', valueFormatter: (x) => fmt(x as number, 2, ' m³/s') },
    legend: legenda,
    grid: { left: 52, right: 16, top: 52, bottom: 50 },
    xAxis: eixoTempo(dias.map((d) => diaMes(d.data))),
    yAxis: eixoValor('m³/s', { scale: true, splitNumber: 4 }),
    dataZoom: zoom,
    series: [linhaDias('Afluente', COR.natural, dias.map((d) => d.afluente)), linhaDias('Defluente', COR.defluente, dias.map((d) => d.defluente))],
  };
}

// ---------------------------------------------------------------- volumes do Paraíba do Sul (paraiba-do-sul/volumes.tsx)

/**
 * Cores dos reservatórios nos gráficos de volume, na ordem fixa do grupo (cada
 * reservatório tem sempre a mesma): passos para fundo escuro da paleta
 * categórica, validados com o validador de paleta no fundo do painel (#11294b)
 * e no branco da exportação (faixa de luminosidade, croma, daltonismo e
 * contraste ≥ 3:1).
 */
export const COR_SERIE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'] as const;
/** Anos anteriores, do mais recente ao mais antigo: um tom só, cada vez mais perto do fundo (rampa validada). */
const COR_ANOS = ['#c3d2e1', '#9db2c7', '#7890a8', '#5d7690'];
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Dias do ano (MM-DD), com o 29/02 (de um ano bissexto qualquer). */
export const DIAS_ANO = dias('2024-01-01', '2024-12-31').map((d) => d.slice(5));
export const bissexto = (ano: number) => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;

const eixoPct = eixoValor('%', { min: 0, max: (x: { max: number }) => Math.max(100, Math.ceil(x.max / 10) * 10) });

/** Volume útil (%) de cada reservatório no período, um por linha; `destaque`: mais grossa e por cima (o equivalente). */
export function opcaoVolumesReservatorios(dias: string[], series: { nome: string; valores: (number | null)[]; cor: string; destaque?: boolean }[]): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => {
        const l = lista(ps);
        const d = dias[l[0]?.dataIndex ?? 0];
        return `<b>${d ? dataBr(d) : ''}</b><br>${l.map((p) => `${p.marker}${p.seriesName}: ${fmt(p.value as number | null, 1, '%')}`).join('<br>')}`;
      },
    },
    legend: legenda,
    grid: { left: 52, right: 24, top: 58, bottom: 56 },
    xAxis: eixoTempo(dias.map(diaMes)),
    yAxis: eixoPct,
    dataZoom: zoom,
    series: series.map((s) => ({
      name: s.nome,
      type: 'line' as const,
      showSymbol: false,
      z: s.destaque ? 3 : 2,
      lineStyle: { width: s.destaque ? 3.5 : 2, color: s.cor },
      itemStyle: { color: s.cor },
      data: s.valores,
    })),
  };
}

/**
 * Volume útil (%) do ano atual × anos anteriores, alinhados por dia e mês: o ano
 * atual em destaque (com o valor no fim da linha), os anteriores numa rampa de
 * um tom só. `limite`: linha de referência (o do equivalente na Resolução 1.382).
 */
export function opcaoVolumeAnos(anos: { ano: number; valores: (number | null)[] }[], limite: { y: number; texto: string } | null): EChartsOption {
  const ordem = [...anos].sort((a, b) => b.ano - a.ano);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => {
        const d = DIAS_ANO[lista(ps)[0]?.dataIndex ?? 0] ?? '';
        // no 29/02, só os anos bissextos (nos outros, o valor ali só liga 28/02 a 01/03)
        const l = lista(ps).filter((p) => p.value !== null && p.value !== undefined && (d !== '02-29' || bissexto(Number(p.seriesName))));
        return `<b>${d.slice(3)}/${d.slice(0, 2)}</b><br>${l.map((p) => `${p.marker}${p.seriesName}: ${fmt(p.value as number, 1, '%')}`).join('<br>')}`;
      },
    },
    legend: legenda,
    grid: { left: 52, right: 96, top: 58, bottom: 56 },
    xAxis: {
      ...eixoTempo(DIAS_ANO),
      axisLabel: { color: TEMA.fraco, interval: (i: number) => DIAS_ANO[i]!.endsWith('-01'), formatter: (d: string) => MES_CURTO[Number(d.slice(0, 2)) - 1]! },
      axisTick: { interval: (i: number) => DIAS_ANO[i]!.endsWith('-01') },
    },
    yAxis: eixoPct,
    dataZoom: zoom,
    series: ordem.map((a, i) => {
      const atual = i === 0;
      const cor = atual ? COR.atual : COR_ANOS[Math.min(i - 1, COR_ANOS.length - 1)]!;
      // até o último dia com dado: o valor do fim da linha fica no lugar certo
      const fim = a.valores.findLastIndex((x) => x !== null) + 1;
      return {
        name: String(a.ano),
        type: 'line' as const,
        showSymbol: false,
        z: atual ? 3 : 2,
        lineStyle: { width: atual ? 3.5 : 1.8, color: cor },
        itemStyle: { color: cor },
        data: a.valores.slice(0, fim),
        // o ano no fim de cada linha (no atual, com o valor); nomes que se encostam vão para cima ou para baixo
        endLabel: {
          show: true,
          color: atual ? TEMA.texto : TEMA.fraco,
          fontWeight: atual ? ('bold' as const) : ('normal' as const),
          formatter: (p: { value: unknown }) => (atual ? `${a.ano}: ${fmt(p.value as number, 1, '%')}` : String(a.ano)),
        },
        labelLayout: { moveOverlap: 'shiftY' as const },
        markLine: atual && limite ? { silent: true, symbol: 'none', data: [referencia(limite.y, limite.texto, COR_REFERENCIA, 'dashed', 'insideStartTop')] } : undefined,
      };
    }),
  };
}
