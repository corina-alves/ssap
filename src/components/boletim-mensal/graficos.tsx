'use client';

import Chart from 'chart.js/auto';
import type { Plugin } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { useEffect, useRef, type RefObject } from 'react';
import type { TabelaVolumes } from '@/lib/hidrologia/volumes-mensais';

/**
 * Gráficos do boletim mensal (Chart.js), usados também na página de Sistemas
 * produtores: o comparativo de volumes (mês atual × mês anterior × ano anterior)
 * e o gráfico de cada sistema (volume em barras, chuva e vazões em linhas).
 */

type GraficoBarras = Chart<'bar', (number | null)[], string>;
const TEXTO = '#111';
const numBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const num1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Fundo branco no PNG (o canvas é transparente). */
const fundoBranco: Plugin<'bar'> = {
  id: 'fundoBranco',
  beforeDraw: (c) => {
    const ctx = c.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
  },
};

/** Espaço entre a legenda e o gráfico, para os valores das barras mais altas não ficarem embaixo da legenda. */
const espacoLegenda: Plugin<'bar'> = {
  id: 'espacoLegenda',
  beforeInit: (c) => {
    const legenda = c.legend as unknown as { fit: () => void; height: number } | undefined;
    if (!legenda) return;
    const ajustar = legenda.fit.bind(legenda);
    legenda.fit = function () {
      ajustar();
      this.height += 26;
    };
  },
};

const CORES_COMPARATIVO = ['#5ab4e8', '#2f8be6', '#0d3a8f']; // atual, mês anterior, ano anterior (como no boletim)

/** "Comparativo do ano e mês anterior com o ano e mês atual (%)": barras agrupadas por sistema, com os valores. */
export function GraficoComparativoVolumes({ t, grafico, rotulo = 'Comparativo dos volumes úteis dos sistemas produtores: mês atual, mês anterior e ano anterior' }: { t: TabelaVolumes; grafico?: RefObject<GraficoBarras | null>; rotulo?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    Chart.defaults.font.family = getComputedStyle(canvas.current).fontFamily;
    const linhas = [...t.sistemas, t.sim];
    const r = t.rotulos;
    // Volume útil pode passar de 100% (ex.: Cotia 103,5% em out/2026): o eixo cresce, com folga para o rótulo.
    const maior = Math.max(...linhas.flatMap((l) => [l.atual, l.mesAnterior, l.anoAnterior]).filter((v): v is number => v !== null), 0);
    const topo = maior > 100 ? Math.ceil((maior + 6) / 20) * 20 : 100;
    const g: GraficoBarras = new Chart<'bar', (number | null)[], string>(canvas.current, {
      type: 'bar',
      plugins: [ChartDataLabels as Plugin<'bar'>, fundoBranco, espacoLegenda],
      data: {
        labels: linhas.map((l) => l.nome),
        datasets: [
          { label: `Volume Atual / ${r.atual}`, data: linhas.map((l) => l.atual), backgroundColor: CORES_COMPARATIVO[0] },
          { label: `Volume Mês Anterior / ${r.mesAnterior}`, data: linhas.map((l) => l.mesAnterior), backgroundColor: CORES_COMPARATIVO[1] },
          { label: `Volume Ano Anterior / ${r.anoAnterior}`, data: linhas.map((l) => l.anoAnterior), backgroundColor: CORES_COMPARATIVO[2] },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 18 } }, // espaço para o rótulo das barras perto de 100%
        plugins: {
          title: { display: true, text: 'Comparativo do ano e mês anterior com o ano e mês atual (%) - Sistemas Produtores da RMSP', font: { size: 15, weight: 'bold' }, color: TEXTO, padding: { bottom: 6 } },
          legend: { position: 'top', align: 'start', labels: { boxWidth: 16, color: TEXTO, font: { size: 13, weight: 'bold' } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y === null ? '—' : `${num1(c.parsed.y)}%`}` } },
          datalabels: { anchor: 'end', align: 'end', offset: 2, clip: false, font: { size: 12, weight: 'bold' }, color: TEXTO, formatter: (v: number | null) => (v === null ? '' : num1(v)) },
        },
        scales: {
          y: {
            min: 0,
            max: topo,
            title: { display: true, text: 'Volume (%)', color: TEXTO, font: { size: 14, weight: 'bold' } },
            ticks: { stepSize: 20, color: TEXTO, font: { size: 13, weight: 'bold' } },
            grid: { color: '#e3e3e3' },
          },
          x: {
            title: { display: true, text: 'Sistemas Produtores', color: TEXTO, font: { size: 14, weight: 'bold' } },
            ticks: { maxRotation: 15, minRotation: 0, color: TEXTO, font: { size: 13, weight: 'bold' } },
            grid: { color: '#e3e3e3' },
          },
        },
      },
    });
    if (grafico) grafico.current = g;
    return () => {
      g.destroy();
      if (grafico) grafico.current = null;
    };
  }, [t, grafico]);

  return <canvas ref={canvas} role="img" aria-label={rotulo} />;
}

const COR_SISTEMA = { volume: '#1a73e8', chuva: '#33d6e0', afluente: '#1e8a3a', defluente: '#c8302a' };

/**
 * Gráfico de um sistema produtor (o mesmo da página Sistemas produtores):
 * volume útil em barras, chuva em linha suave e vazões afluente e defluente em
 * linhas retas; eixos de vazão e volume à esquerda e de chuva à direita.
 */
export function GraficoSistema({
  nome,
  rotulos,
  valores,
  rotuloChuva,
}: {
  nome: string;
  rotulos: string[];
  valores: Record<'volume' | 'chuva' | 'afluente' | 'defluente', (number | null)[]>;
  rotuloChuva: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    Chart.defaults.font.family = getComputedStyle(canvas.current).fontFamily;
    const fonteEixo = { size: 13 };
    const fonteTitulo = { size: 14, weight: 'bold' as const };
    const eixo = (titulo: string, cor: string, position: 'left' | 'right', grade = false) => ({
      position,
      beginAtZero: true,
      title: { display: true, text: titulo, color: cor, font: fonteTitulo },
      ticks: { color: cor, font: fonteEixo, callback: (v: string | number) => numBR.format(Number(v)) },
      grid: grade ? { drawOnChartArea: true, color: '#e9edf1' } : { drawOnChartArea: false },
    });
    const linha = (rotulo: string, dados: (number | null)[], cor: string, yAxisID: string, suave: boolean) => ({
      type: 'line' as const,
      label: rotulo,
      data: dados,
      yAxisID,
      borderColor: cor,
      backgroundColor: cor,
      borderWidth: 2,
      tension: suave ? 0.4 : 0,
      cubicInterpolationMode: suave ? ('monotone' as const) : ('default' as const),
      pointRadius: 0,
      pointStyle: 'line' as const,
      spanGaps: true,
      fill: false,
      order: 1,
    });
    const g = new Chart(canvas.current, {
      data: {
        labels: rotulos,
        datasets: [
          { type: 'bar', label: 'Volume útil (%)', data: valores.volume, yAxisID: 'volume', backgroundColor: COR_SISTEMA.volume, borderColor: COR_SISTEMA.volume, barPercentage: 0.6, pointStyle: 'rect', order: 2 },
          linha(rotuloChuva, valores.chuva, COR_SISTEMA.chuva, 'chuva', true),
          linha('Vazão afluente (m³/s)', valores.afluente, COR_SISTEMA.afluente, 'vazao', false),
          linha('Vazão defluente (m³/s)', valores.defluente, COR_SISTEMA.defluente, 'vazao', false),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, color: TEXTO, font: { size: 12, weight: 'bold' }, sort: (a, b) => (a.datasetIndex ?? 0) - (b.datasetIndex ?? 0) } },
          tooltip: { itemSort: (a, b) => a.datasetIndex - b.datasetIndex },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#3d4b59', font: fonteEixo } },
          vazao: eixo('Vazão (m³/s)', '#5b6b7b', 'left', true),
          volume: eixo('Volume (%)', COR_SISTEMA.volume, 'left'),
          chuva: eixo('Chuva (mm)', '#5b6b7b', 'right'),
        },
      },
      plugins: [fundoBranco as unknown as Plugin],
    });
    return () => g.destroy();
  }, [nome, rotulos, valores, rotuloChuva]);

  return <canvas ref={canvas} role="img" aria-label={`Volume, chuva e vazões do Sistema ${nome}`} />;
}
