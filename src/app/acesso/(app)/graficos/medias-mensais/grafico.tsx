'use client';

import Chart from 'chart.js/auto';
import { useEffect, useRef } from 'react';

export type SerieGrafico = { nome: string; valores: (number | null)[]; cor: string; percentual?: boolean; tracejada?: boolean };

const numBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Linhas em dois eixos: valores na unidade à esquerda e a série percentual à direita. */
export function GraficoDoisEixos({ rotulos, series, unidade, rotuloPct, descricao }: { rotulos: string[]; series: SerieGrafico[]; unidade: string; rotuloPct: string; descricao: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    Chart.defaults.font.family = getComputedStyle(canvas.current).fontFamily; // Montserrat da página, não a Helvetica do Chart.js
    const grafico = new Chart(canvas.current, {
      type: 'line',
      data: {
        labels: rotulos,
        datasets: series.map((s) => ({
          label: s.nome,
          data: s.valores,
          yAxisID: s.percentual ? 'y1' : 'y',
          borderColor: s.cor,
          backgroundColor: s.cor,
          borderDash: s.tracejada ? [6, 4] : [],
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 3,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y === null ? '—' : numBR.format(c.parsed.y)}` } },
        },
        scales: {
          y: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: unidade }, ticks: { callback: (v) => numBR.format(Number(v)) } },
          y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: rotuloPct }, ticks: { callback: (v) => numBR.format(Number(v)) } },
        },
      },
    });
    return () => grafico.destroy();
  }, [rotulos, series, unidade, rotuloPct]);

  return (
    <div className="acesso-grafico acesso-grafico--grande">
      <canvas ref={canvas} role="img" aria-label={descricao} />
    </div>
  );
}
