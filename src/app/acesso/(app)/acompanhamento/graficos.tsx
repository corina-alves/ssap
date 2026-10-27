'use client';

import type { ECharts, EChartsOption } from 'echarts';
import { useEffect, useRef } from 'react';

/**
 * Gráficos dos acompanhamentos (ECharts, tema claro da área): ao passar o
 * mouse, a dica mostra todos os valores do ponto. Cores do kit da marca.
 */

const COR = {
  azul: '#0454fc',
  azulEscuro: '#0039c0',
  azulClaro: '#7ea6fd',
  profundo: '#0a1633',
  verde: '#04b454',
  alerta: '#dc3545',
  texto: '#3b4a59',
  fraco: '#5b6b7b',
  grade: '#e6ecf3',
};
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fmt = (v: unknown, casas = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : '—';

function base(el: HTMLElement, opcao: EChartsOption): EChartsOption {
  return {
    backgroundColor: 'transparent',
    textStyle: { color: COR.texto, fontFamily: getComputedStyle(el).fontFamily },
    animationDuration: 400,
    tooltip: { trigger: 'axis', confine: true, backgroundColor: 'rgba(10,22,51,.95)', borderColor: 'rgba(255,255,255,.15)', textStyle: { color: '#fff' } },
    // clicar num item da legenda esconde a série; clicar de novo mostra
    legend: { top: 0, selectedMode: true, itemGap: 18, textStyle: { color: COR.profundo, fontSize: 13, fontWeight: 600 }, inactiveColor: '#c3ccd6' },
    toolbox: { right: 4, top: 0, feature: { saveAsImage: { title: 'Baixar PNG', pixelRatio: 2, backgroundColor: '#fff' } } },
    grid: { left: 52, right: 24, top: 52, bottom: 40 },
    ...opcao,
  };
}

/** Gráfico ECharts (carregado sob demanda) que acompanha o tamanho do contêiner. */
function Grafico({ opcao, altura, rotulo }: { opcao: EChartsOption; altura: number; rotulo: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const grafico = useRef<ECharts | null>(null);
  const atual = useRef(opcao);
  atual.current = opcao;
  useEffect(() => {
    let vivo = true;
    let observador: ResizeObserver | undefined;
    import('echarts').then((ec) => {
      if (!vivo || !ref.current) return;
      grafico.current = ec.init(ref.current, null, { renderer: 'canvas' });
      grafico.current.setOption(base(ref.current, atual.current), true);
      observador = new ResizeObserver(() => grafico.current?.resize());
      observador.observe(ref.current);
    });
    return () => {
      vivo = false;
      observador?.disconnect();
      grafico.current?.dispose();
      grafico.current = null;
    };
  }, []);
  useEffect(() => {
    if (grafico.current && ref.current) grafico.current.setOption(base(ref.current, opcao), true);
  }, [opcao]);
  return <div ref={ref} style={{ height: altura }} role="img" aria-label={rotulo} />;
}

const linhaReferencia = (valor: number) => ({
  silent: true,
  symbol: 'none',
  lineStyle: { color: COR.alerta, type: 'dashed' as const, width: 2 },
  label: { formatter: `Referência ${fmt(valor, 1)}`, color: COR.alerta, position: 'insideEndTop' as const },
  data: [{ yAxis: valor }],
});

/** Vazão média diária no mês: SAISP × Sabesp (barras) e a referência. */
export function GraficoMesTransposicao({ dias, referencia }: { dias: { dia: string; saisp: number | null; sabesp: number | null }[]; referencia: number }) {
  const opcao: EChartsOption = {
    tooltip: { trigger: 'axis', valueFormatter: (v) => `${fmt(v)} m³/s` },
    xAxis: { type: 'category', data: dias.map((d) => `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`), axisLabel: { color: COR.fraco } },
    yAxis: { type: 'value', name: 'm³/s', scale: true, splitLine: { lineStyle: { color: COR.grade } }, axisLabel: { color: COR.fraco } },
    series: [
      { name: 'SAISP (média das leituras)', type: 'bar', data: dias.map((d) => d.saisp), itemStyle: { color: COR.azulEscuro, borderRadius: [3, 3, 0, 0] }, markLine: linhaReferencia(referencia) },
      { name: 'Sabesp (média diária)', type: 'bar', data: dias.map((d) => d.sabesp), itemStyle: { color: COR.azulClaro, borderRadius: [3, 3, 0, 0] } },
    ],
  };
  return <Grafico opcao={opcao} altura={340} rotulo="Vazão média diária no mês: SAISP e Sabesp" />;
}

/** Leituras do SAISP ao longo do dia (linha), com os valores de hora em hora, a máxima, a mínima e a referência. */
export function GraficoDiaTransposicao({ leituras, referencia }: { leituras: { hora: string; valor: number }[]; referencia: number }) {
  const opcao: EChartsOption = {
    tooltip: { trigger: 'axis', valueFormatter: (v) => `${fmt(v)} m³/s` },
    xAxis: { type: 'category', boundaryGap: false, data: leituras.map((l) => l.hora), axisLabel: { color: COR.fraco, interval: 11 } },
    yAxis: { type: 'value', name: 'm³/s', scale: true, splitLine: { lineStyle: { color: COR.grade } }, axisLabel: { color: COR.fraco } },
    series: [
      {
        name: 'Vazão SAISP',
        type: 'line',
        data: leituras.map((l) => l.valor),
        symbolSize: 5,
        lineStyle: { color: COR.azul, width: 2 },
        itemStyle: { color: COR.azul },
        areaStyle: { color: 'rgba(4,84,252,.08)' },
        // valor escrito de hora em hora (a cada 6 leituras)
        label: { show: true, position: 'top', fontSize: 12, fontWeight: 700, color: COR.profundo, formatter: (p) => (p.dataIndex % 6 === 0 ? fmt(p.value, 2) : '') },
        markPoint: {
          symbolSize: 42,
          label: { fontSize: 10, formatter: (p) => fmt(p.value, 2) },
          data: [
            { type: 'max', name: 'Máxima', itemStyle: { color: COR.azulEscuro } },
            { type: 'min', name: 'Mínima', itemStyle: { color: COR.verde } },
          ],
        },
        markLine: linhaReferencia(referencia),
      },
    ],
  };
  return <Grafico opcao={opcao} altura={340} rotulo="Vazão observada pelo SAISP ao longo do dia" />;
}

/** Volumes de espera: volume útil do sistema no ano (barras), operacional e ano anterior (linhas). */
export function GraficoVolumesEspera({
  ano,
  volume,
  anterior,
  operacional,
  periodos = false,
}: {
  ano: number;
  volume: (number | null)[];
  anterior: (number | null)[];
  operacional: (number | null)[];
  /** separa o período chuvoso (dez–mai) do seco (jun–nov) com faixas de fundo e divisas tracejadas */
  periodos?: boolean;
}) {
  const faixa = (nome: string, de: string, ate: string, cor: string, rotulo = true) => [
    {
      name: rotulo ? nome : '',
      xAxis: de,
      itemStyle: { color: cor, borderColor: COR.fraco, borderWidth: 1, borderType: 'dashed' as const },
      label: { position: 'insideTop' as const, color: COR.profundo, fontSize: 12, fontWeight: 700, distance: 6 },
    },
    { xAxis: ate },
  ];
  const chuvoso = 'rgba(4,84,252,.08)';
  const seco = 'rgba(245,183,42,.12)';
  const opcao: EChartsOption = {
    tooltip: { trigger: 'axis', valueFormatter: (v) => `${fmt(v, 1)}%` },
    xAxis: { type: 'category', data: MESES, axisLabel: { color: COR.fraco } },
    // com os períodos, sobra espaço acima de 100% para os nomes das faixas não cobrirem os valores
    yAxis: {
      type: 'value',
      min: 0,
      max: periodos ? 118 : 100,
      interval: 20,
      axisLabel: { color: COR.fraco, formatter: (v: number) => (v <= 100 ? `${v}%` : '') },
      splitLine: { lineStyle: { color: COR.grade } },
    },
    series: [
      {
        name: `Volume útil ${ano}`,
        type: 'bar',
        barMaxWidth: 44,
        ...(periodos
          ? {
              markArea: {
                silent: true,
                data: [
                  faixa('Período chuvoso (dez–mai)', 'Jan', 'Mai', chuvoso),
                  faixa('Período seco (jun–nov)', 'Jun', 'Nov', seco),
                  faixa('Chuvoso', 'Dez', 'Dez', chuvoso),
                ] as never,
              },
            }
          : {}),
        data: volume.map((v, i) => (v === null ? null : { value: v, itemStyle: { color: v > (operacional[i] ?? 101) ? '#f59e0b' : COR.azul, borderRadius: [4, 4, 0, 0] } })),
        itemStyle: { color: COR.azul },
        label: { show: true, position: 'top', fontSize: 13, fontWeight: 700, color: COR.profundo, formatter: (p) => fmt(p.value, 1) },
      },
      { name: 'Operacional (acima: espera)', type: 'line', data: operacional, lineStyle: { color: COR.verde, width: 3 }, itemStyle: { color: COR.verde }, symbolSize: 7 },
      { name: `Volume útil ${ano - 1}`, type: 'line', data: anterior, lineStyle: { color: COR.fraco, width: 2, type: 'dashed' }, itemStyle: { color: COR.fraco }, symbolSize: 5 },
    ],
  };
  return <Grafico opcao={opcao} altura={360} rotulo={`Volume útil do sistema e volume operacional, mês a mês, em ${ano}`} />;
}
