'use client';

import Chart from 'chart.js/auto';
import { useEffect, useRef } from 'react';

export type PontoGrafico = { dia: string; hora: string; nivel: number | null; vazao: number | null };

const NIVEL_SO = '#29a8d8'; // nível sozinho: azul
const NIVEL = '#e020b0'; // nível com vazão: magenta
const VAZAO = '#29a8d8';
const REFERENCIA = '#d32f2f'; // referência de cheia: vermelho tracejado
const nf = (casas: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const n2 = nf(2);
const n0 = nf(0);
const diaMes = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/**
 * Nível (m) e, quando houver, vazão (m³/s, eixo da direita) hora a hora. Horas
 * de 4 em 4 no eixo, a data em negrito à meia-noite e uma linha tracejada na
 * virada de cada dia.
 */
export function GraficoPosto({ pontos, titulo, referenciaVazao = null }: { pontos: PontoGrafico[]; titulo: string; referenciaVazao?: number | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const temVazao = pontos.some((p) => p.vazao !== null);
    const ref = temVazao ? referenciaVazao : null;
    const rotuloRef = ref === null ? '' : `Referência de cheia (${n0.format(ref)} m³/s)`;
    const viradas = pontos.flatMap((p, i) => (i > 0 && p.dia !== pontos[i - 1]!.dia ? [i] : []));
    const rotulo = (i: number) => {
      const p = pontos[i]!;
      if (i === 0 || viradas.includes(i)) return diaMes(p.dia);
      return Number(p.hora.slice(0, 2)) % 4 === 0 && p.hora.endsWith(':00') ? p.hora : '';
    };
    const serie = (nome: string, campo: 'nivel' | 'vazao', cor: string, eixo: string) => ({
      label: nome,
      data: pontos.map((p) => p[campo]),
      yAxisID: eixo,
      borderColor: cor,
      backgroundColor: cor,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0,
      spanGaps: true,
    });

    Chart.defaults.font.family = getComputedStyle(canvas.current).fontFamily; // Montserrat da página, não a Helvetica do Chart.js
    const grafico = new Chart(canvas.current, {
      type: 'line',
      data: {
        labels: pontos.map((p) => `${diaMes(p.dia)} ${p.hora}`),
        datasets: [
          serie('Nível (m)', 'nivel', temVazao ? NIVEL : NIVEL_SO, 'y'),
          ...(temVazao ? [serie('Vazão (m³/s)', 'vazao', VAZAO, 'y1')] : []),
          // Linha horizontal da referência de cheia: série constante no eixo da vazão (entra na legenda e na escala).
          ...(ref !== null
            ? [
                {
                  label: rotuloRef,
                  data: pontos.map(() => ref),
                  yAxisID: 'y1',
                  borderColor: REFERENCIA,
                  backgroundColor: REFERENCIA,
                  borderWidth: 2,
                  borderDash: [7, 5],
                  pointRadius: 0,
                  pointHoverRadius: 0,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'line' } },
          tooltip: {
            filter: (c) => c.dataset.label !== rotuloRef,
            callbacks: {
              label: (c) => {
                const v = c.parsed.y;
                if (v === null || v === undefined) return `${c.dataset.label}: —`;
                return c.dataset.yAxisID === 'y1' ? `Vazão: ${n0.format(v)} m³/s` : `Nível: ${n2.format(v)} m`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              autoSkip: false,
              maxRotation: 0,
              callback: (_v, i) => rotulo(i),
              font: (ctx) => ({ weight: ctx.index === 0 || viradas.includes(ctx.index) ? 'bold' : 'normal' }),
            },
          },
          y: {
            position: 'left',
            title: { display: true, text: 'Nível (m)' },
            ticks: { callback: (v) => n2.format(Number(v)) },
          },
          ...(temVazao
            ? {
                y1: {
                  position: 'right' as const,
                  title: { display: true, text: 'Vazão (m³/s)' },
                  grid: { drawOnChartArea: false },
                  ticks: { callback: (v: string | number) => n0.format(Number(v)) },
                },
              }
            : {}),
        },
      },
      plugins: [
        {
          // Linha tracejada vertical na virada de cada dia.
          id: 'viradaDia',
          afterDatasetsDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            ctx.save();
            ctx.strokeStyle = '#b7c3cf';
            ctx.setLineDash([4, 4]);
            for (const i of viradas) {
              const x = scales.x!.getPixelForValue(i);
              ctx.beginPath();
              ctx.moveTo(x, chartArea.top);
              ctx.lineTo(x, chartArea.bottom);
              ctx.stroke();
            }
            ctx.restore();
          },
        },
        {
          // Etiqueta "Referência de cheia (vazão): 1.311 m³/s" logo acima da linha, à esquerda.
          id: 'rotuloReferencia',
          afterDatasetsDraw(chart) {
            if (ref === null || !chart.scales.y1) return;
            const { ctx, chartArea } = chart;
            const y = chart.scales.y1.getPixelForValue(ref);
            if (y < chartArea.top || y > chartArea.bottom) return;
            const texto = `Referência de cheia (vazão): ${n0.format(ref)} m³/s`;
            ctx.save();
            ctx.font = `600 11px ${Chart.defaults.font.family}`;
            const w = ctx.measureText(texto).width + 12;
            const x = chartArea.left + 8;
            const topo = Math.max(chartArea.top, y - 24);
            ctx.fillStyle = '#fdecec';
            ctx.strokeStyle = '#f2b8b8';
            ctx.beginPath();
            ctx.roundRect(x, topo, w, 18, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = REFERENCIA;
            ctx.textBaseline = 'middle';
            ctx.fillText(texto, x + 6, topo + 9);
            ctx.restore();
          },
        },
      ],
    });
    return () => grafico.destroy();
  }, [pontos, referenciaVazao]);

  return (
    <div className="pg-grafico">
      <canvas ref={canvas} role="img" aria-label={titulo} />
    </div>
  );
}
