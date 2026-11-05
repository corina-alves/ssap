'use client';

import type { EChartsOption } from 'echarts';
import { useMemo } from 'react';
import { CORES, Grafico } from './grafico';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const mm = (v: unknown) => (typeof v === 'number' ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm` : '—');
/** [mês, linha, desvio] da célula da matriz, a partir dos parâmetros que o ECharts passa. */
const celula = (p: unknown) => (p as { data: [number, number, number | null] }).data;

/** Barras: média climatológica de cada mês; linha: chuva de cada mês do ano escolhido (mês inválido fica sem ponto). */
export function GraficoMensal({ clima, ano, observado, rotuloClima, arquivo }: { clima: (number | null)[]; ano: number; observado: (number | null)[]; rotuloClima: string; arquivo: string }) {
  const opcao = useMemo<EChartsOption>(
    () => ({
      tooltip: { trigger: 'axis', valueFormatter: mm },
      xAxis: { type: 'category', data: MESES, axisLine: { lineStyle: { color: CORES.fraco } } },
      yAxis: { type: 'value', name: 'mm', splitLine: { lineStyle: { color: CORES.grade } } },
      series: [
        { name: rotuloClima, type: 'bar', data: clima, itemStyle: { color: CORES.climatologia }, barMaxWidth: 34 },
        { name: String(ano), type: 'line', data: observado, connectNulls: false, symbolSize: 7, lineStyle: { width: 2.5, color: CORES.observado }, itemStyle: { color: CORES.observado } },
      ],
    }),
    [clima, ano, observado, rotuloClima],
  );
  return <Grafico opcao={opcao} rotulo={`Climatologia mensal e chuva de ${ano}`} arquivo={arquivo} />;
}

/** Total de cada ano com os 12 meses válidos, a média de referência e os extremos destacados. */
export function GraficoAnual({ anos, media, rotuloMedia, periodo, arquivo }: { anos: { ano: number; chuva: number }[]; media: number | null; rotuloMedia: string; periodo: [number, number]; arquivo: string }) {
  const opcao = useMemo<EChartsOption>(() => {
    const ref = anos.filter((a) => a.ano >= periodo[0] && a.ano <= periodo[1]);
    const seco = ref.length ? ref.reduce((a, b) => (b.chuva < a.chuva ? b : a)) : null;
    const chuvoso = ref.length ? ref.reduce((a, b) => (b.chuva > a.chuva ? b : a)) : null;
    return {
      tooltip: { trigger: 'axis', valueFormatter: mm },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6 }],
      grid: { left: 56, right: 24, top: 44, bottom: 64 },
      xAxis: { type: 'category', data: anos.map((a) => String(a.ano)), axisLine: { lineStyle: { color: CORES.fraco } } },
      yAxis: { type: 'value', name: 'mm/ano', splitLine: { lineStyle: { color: CORES.grade } } },
      series: [
        {
          name: 'Total anual',
          type: 'bar',
          data: anos.map((a) => ({
            value: a.chuva,
            itemStyle: { color: a.ano === seco?.ano ? CORES.seco : a.ano === chuvoso?.ano ? CORES.chuvoso : a.ano >= periodo[0] && a.ano <= periodo[1] ? CORES.climatologia : '#c9d6e3' },
          })),
          markLine: media === null ? undefined : { symbol: 'none', label: { formatter: `${rotuloMedia}: ${mm(media)}`, position: 'insideEndTop' }, lineStyle: { color: CORES.observado, type: 'dashed' }, data: [{ yAxis: media }] },
        },
      ],
    };
  }, [anos, media, rotuloMedia, periodo]);
  return <Grafico opcao={opcao} altura={300} rotulo="Precipitação anual ao longo da série histórica" arquivo={arquivo} />;
}

/** Matriz UGRHI × mês: cor = desvio (%) em relação à climatologia do mês. */
export function GraficoMatriz({ linhas, ano, arquivo }: { linhas: { rotulo: string; desvios: (number | null)[] }[]; ano: number; arquivo: string }) {
  const opcao = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          const d = celula(p);
          return `${linhas[d[1]]!.rotulo} — ${MESES[d[0]]}/${ano}<br/>${d[2] === null ? 'sem dado' : `${d[2] > 0 ? '+' : ''}${d[2].toLocaleString('pt-BR')}% da climatologia`}`;
        },
      },
      grid: { left: 190, right: 16, top: 30, bottom: 60 },
      xAxis: { type: 'category', data: MESES, position: 'top', splitArea: { show: true } },
      yAxis: { type: 'category', data: linhas.map((l) => l.rotulo), inverse: true, axisLabel: { fontSize: 11 } },
      visualMap: {
        min: -60,
        max: 60,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        text: ['+60% (mais chuva)', '−60% (menos chuva)'],
        inRange: { color: ['#b35806', '#f1a340', '#f7f7f7', '#67a9cf', '#2166ac'] },
        outOfRange: { color: '#d5dbe0' },
      },
      series: [
        {
          name: 'Desvio (%)',
          type: 'heatmap',
          data: linhas.flatMap((l, y) => l.desvios.map((d, x) => [x, y, d])),
          label: { show: true, fontSize: 10, formatter: (p) => (celula(p)[2] === null ? '' : String(Math.round(celula(p)[2]!))) },
          emphasis: { itemStyle: { borderColor: '#26343d', borderWidth: 1 } },
        },
      ],
    }),
    [linhas, ano],
  );
  return <Grafico opcao={opcao} altura={Math.max(360, linhas.length * 22 + 100)} rotulo={`Desvio mensal da chuva em relação à climatologia, por UGRHI, em ${ano}`} arquivo={arquivo} />;
}

/** Quantidade de postos com pelo menos um mês válido em cada ano (mudanças da rede). */
export function GraficoRede({ anos, arquivo }: { anos: { ano: number; postos: number }[]; arquivo: string }) {
  const opcao = useMemo<EChartsOption>(
    () => ({
      tooltip: { trigger: 'axis' },
      grid: { left: 44, right: 16, top: 30, bottom: 30 },
      xAxis: { type: 'category', data: anos.map((a) => String(a.ano)) },
      yAxis: { type: 'value', name: 'postos', minInterval: 1, splitLine: { lineStyle: { color: CORES.grade } } },
      series: [{ name: 'Postos com dado', type: 'line', step: 'middle', areaStyle: { opacity: 0.15 }, data: anos.map((a) => a.postos), itemStyle: { color: CORES.observado }, symbol: 'none' }],
    }),
    [anos],
  );
  return <Grafico opcao={opcao} altura={200} rotulo="Postos com dado em cada ano" arquivo={arquivo} />;
}
