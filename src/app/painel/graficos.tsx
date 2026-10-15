'use client';

import type { ChartConfiguration, Plugin } from 'chart.js';
import { Canvas, type Montar } from '@/components/graficos-php';

/**
 * Gráficos do Painel de Situação Hídrica (porte de painel/assets/painel.js),
 * com as mesmas cores e configurações, sobre o fundo escuro do painel.
 */

const TEXTO = '#cfe2f3';
const GRADE = 'rgba(255,255,255,.10)';
const FONTE = "Inter, 'Segoe UI', Arial, sans-serif";

const ORDEM = ['Cantareira', 'Alto Tietê', 'Guarapiranga', 'Cotia', 'Rio Grande', 'Rio Claro', 'São Lourenço'];
const CORES: Record<string, string> = {
  Cantareira: '#0b4f8a',
  'Alto Tietê': '#12a8d2',
  Guarapiranga: '#1aa564',
  Cotia: '#7c5cff',
  'Rio Grande': '#e08600',
  'Rio Claro': '#0d6efd',
  'São Lourenço': '#e0475a',
};
// pesos de participação no SIM (mesma base usada na página de reservatórios)
const PESOS_SIM: Record<string, number> = {
  Cantareira: 50.5,
  'Alto Tietê': 28.8,
  Guarapiranga: 8.8,
  'Rio Grande': 5.8,
  'São Lourenço': 4.6,
  'Rio Claro': 0.7,
  Cotia: 0.8,
};
const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const fmt = (v: unknown, casas = 1, suf = '') => {
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + suf;
};

type Obj = Record<string, unknown>;

/** Padrão do painel (no PHP, Chart.defaults): texto claro, grade discreta, sem animação. */
function escuro(cfg: ChartConfiguration): ChartConfiguration {
  const o = (cfg.options ??= {}) as Obj;
  Object.assign(o, { responsive: true, maintainAspectRatio: false, animation: false, color: TEXTO, borderColor: GRADE, font: { family: FONTE } });
  const plugins = (o.plugins ??= {}) as Obj;
  const legenda = (plugins.legend ??= { display: false }) as Obj;
  legenda.labels = { color: TEXTO, ...(legenda.labels as Obj | undefined) };
  if (cfg.type !== 'doughnut') {
    const escalas = (o.scales ??= {}) as Record<string, Obj>;
    for (const id of new Set(['x', 'y', ...Object.keys(escalas)])) {
      const e = (escalas[id] ??= {});
      e.ticks = { color: TEXTO, ...(e.ticks as Obj | undefined) };
      e.grid = { color: GRADE, ...(e.grid as Obj | undefined) };
      e.border = { color: GRADE, ...(e.border as Obj | undefined) };
      if (e.title) e.title = { color: TEXTO, ...(e.title as Obj) };
    }
  }
  return cfg;
}

function Grafico({ chave, rotulo, montar }: { chave: string; rotulo: string; montar: Montar }) {
  return <Canvas sssp={false} chave={chave} rotulo={rotulo} montar={(l) => escuro(montar(l))} />;
}

const resumo = (rotulos: string[], valores: (number | null)[], suf: string) => rotulos.map((r, i) => `${r}: ${valores[i] == null ? 'sem dado' : fmt(valores[i], 1, suf)}`).join('; ');

// ---------------------------------------------------------------- volume

/** Volume útil por sistema — atual × ano anterior, barra atual na cor do estágio. */
export function GraficoVolume({
  labels,
  atual,
  anterior,
  cores,
  rotuloAtual,
  rotuloAnterior,
}: {
  labels: string[];
  atual: (number | null)[];
  anterior: (number | null)[];
  cores: string[];
  rotuloAtual: string;
  rotuloAnterior: string;
}) {
  // linhas das faixas do protocolo (60 / 40 / 30 / 20 %)
  const faixa = (y: number, cor: string) => ({
    type: 'line' as const,
    yMin: y,
    yMax: y,
    borderColor: cor,
    borderWidth: 1.5,
    borderDash: [6, 5],
    label: { display: true, content: `${y}%`, position: 'start' as const, color: cor, backgroundColor: 'transparent', font: { size: 10, weight: 'bold' as const } },
  });
  return (
    <Grafico
      chave={[rotuloAtual, ...atual, ...anterior].join()}
      rotulo={`Volume útil em ${rotuloAtual}: ${resumo(labels, atual, '%')}. Em ${rotuloAnterior}: ${resumo(labels, anterior, '%')}.`}
      montar={({ ChartDataLabels }) => ({
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: rotuloAnterior, data: anterior, backgroundColor: 'rgba(255,255,255,.24)', borderRadius: 6 },
            { label: rotuloAtual, data: atual, backgroundColor: cores, borderRadius: 6 },
          ],
        },
        options: {
          plugins: {
            legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
            annotation: { annotations: { f60: faixa(60, '#f4b400'), f40: faixa(40, '#e08600'), f30: faixa(30, '#dc3545'), f20: faixa(20, '#800080') } },
            datalabels: { display: (c) => c.datasetIndex === 1, anchor: 'end', align: 'end', formatter: (x: number | null) => fmt(x, 0, '%'), color: '#eef6ff', font: { weight: 'bold' } },
          },
          scales: { y: { min: 0, max: 100, ticks: { callback: (x) => `${x}%` } }, x: { ticks: { autoSkip: false, maxRotation: 30 } } },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}

/** Participação de cada sistema no SIM (rosca). */
export function GraficoParticipacao() {
  return (
    <Grafico
      chave="pesos"
      rotulo={`Participação de cada sistema no SIM: ${ORDEM.map((s) => `${s} ${fmt(PESOS_SIM[s], 1, '%')}`).join('; ')}`}
      montar={({ ChartDataLabels }) => ({
        type: 'doughnut',
        data: {
          labels: ORDEM,
          datasets: [{ data: ORDEM.map((s) => PESOS_SIM[s]!), backgroundColor: ORDEM.map((s) => CORES[s]!), borderColor: 'rgba(4,31,58,.6)', borderWidth: 2 }],
        },
        options: {
          cutout: '52%',
          layout: { padding: 4 },
          plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, font: { size: 9 }, padding: 5 } },
            datalabels: { color: '#fff', font: { weight: 'bold', size: 10 }, formatter: (x: number) => (x >= 4 ? fmt(x, 0, '%') : '') },
            tooltip: { callbacks: { label: (c) => `${c.label}: ${fmt(c.parsed, 1, '%')}` } },
          },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}

// ---------------------------------------------------- chuva e vazão natural

export type LinhaComparativo = { sistema: string; dia: number | null; seteDias: number | null; mes: number | null; refs: (number | null)[]; mediaHistorica: number | null; mlt: number | null };

const VARIANTES = {
  chuva: { dia: 'Chuva do dia', sete: 'Chuva 7 dias', mes: 'Acum. mês', ref: 'Acum. mês', unidade: ' mm', eixo: 'mm' },
  vazao: { dia: 'Vazão natural', sete: 'Vazão 7 dias', mes: 'Vazão nat. mês', ref: 'Vazão mês', unidade: ' m³/s', eixo: 'm³/s' },
} as const;
const CORES_REFS = ['#5f7f9c', '#8aa0b5', '#c9d3dd'];

/** Dia, 7 dias, mês atual, anos de referência e média histórica em barras; MLT em linha (eixo da direita). */
export function GraficoComparativo({ tipo, linhas, anosReferencia, dataBr }: { tipo: 'chuva' | 'vazao'; linhas: LinhaComparativo[]; anosReferencia: number[]; dataBr: string }) {
  const v = VARIANTES[tipo];
  const labels = linhas.map((l) => l.sistema);
  const col = (f: (l: LinhaComparativo) => number | null) => linhas.map(f);
  const barra = (label: string, data: (number | null)[], cor: string) => ({ type: 'bar' as const, label, data, backgroundColor: cor, borderRadius: 4, order: 2 });
  return (
    <Grafico
      chave={JSON.stringify(linhas)}
      rotulo={`${v.dia} em ${dataBr}: ${resumo(labels, col((l) => l.dia), v.unidade)}. MLT: ${resumo(labels, col((l) => l.mlt), '%')}.`}
      montar={() => ({
        type: 'bar',
        data: {
          labels,
          datasets: [
            barra(`${v.dia} (${dataBr})`, col((l) => l.dia), '#12a8d2'),
            barra(v.sete, col((l) => l.seteDias), '#1aa564'),
            barra(`${v.mes} ${dataBr.slice(3)}`, col((l) => l.mes), '#0b4f8a'),
            ...anosReferencia.slice(0, 3).map((ano, i) => barra(`${v.ref} ${ano}`, col((l) => l.refs[i] ?? null), CORES_REFS[i]!)),
            barra('Média histórica', col((l) => l.mediaHistorica), '#e08600'),
            { type: 'line', label: 'MLT (%)', data: col((l) => l.mlt), yAxisID: 'mlt', borderColor: '#7c5cff', backgroundColor: '#7c5cff', borderWidth: 2.5, pointRadius: 3, tension: 0.2, order: 1 },
          ],
        },
        options: {
          plugins: {
            legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y, 1)}${(c.dataset as { yAxisID?: string }).yAxisID === 'mlt' ? '%' : v.unidade}` } },
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: v.eixo } },
            mlt: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: (x) => `${x}%` }, title: { display: true, text: 'MLT' } },
            x: { ticks: { autoSkip: false, maxRotation: 30 } },
          },
        },
      })}
    />
  );
}

// ------------------------------------------------------------ transposição

/** Volume transferido por mês (hm³). */
export function GraficoTransposicao({ meses }: { meses: { mes: number; volumeHm3: number }[] }) {
  const rotulos = meses.map((m) => MESES_CURTO[m.mes - 1] ?? String(m.mes));
  return (
    <Grafico
      chave={meses.map((m) => m.volumeHm3).join()}
      rotulo={`Volume transferido por mês: ${resumo(rotulos, meses.map((m) => m.volumeHm3), ' hm³')}`}
      montar={({ ChartDataLabels }) => ({
        type: 'line',
        data: {
          labels: rotulos,
          datasets: [
            { data: meses.map((m) => m.volumeHm3), borderColor: '#7c5cff', backgroundColor: 'rgba(124,92,255,.22)', borderWidth: 3, fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: '#7c5cff' },
          ],
        },
        options: {
          plugins: { datalabels: { align: 'top', anchor: 'end', formatter: (x: number | null) => fmt(x, 1), color: '#dcd2ff', font: { weight: 'bold' } } },
          scales: { y: { beginAtZero: true, title: { display: true, text: 'hm³' } } },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}

/** Medidor: volume acumulado no ano × limite anual vigente, com a marca do limite anterior. */
export function MedidorTransposicao({ acumulado, vigente, anterior }: { acumulado: number; vigente: number | null; anterior: number | null }) {
  const teto = vigente ?? (acumulado || 1);
  const marcaRef: Plugin<'doughnut'> = {
    id: 'pnlMarcaRef',
    afterDatasetsDraw(chart) {
      if (vigente === null || anterior === null || !teto || anterior > teto) return;
      const arco = chart.getDatasetMeta(0).data[0] as unknown as { x: number; y: number; innerRadius: number; outerRadius: number } | undefined;
      if (!arco) return;
      const ang = ((-90 + (anterior / teto) * 180) * Math.PI) / 180;
      const s = Math.sin(ang);
      const c = Math.cos(ang);
      const rInt = arco.innerRadius - 3;
      const rExt = arco.outerRadius + 5;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = '#e08600';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(arco.x + rInt * s, arco.y - rInt * c);
      ctx.lineTo(arco.x + rExt * s, arco.y - rExt * c);
      ctx.stroke();
      ctx.fillStyle = '#f0a94e';
      ctx.font = '700 11px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fmt(anterior, 0), arco.x + (rExt + 11) * s, arco.y - (rExt + 11) * c);
      ctx.restore();
    },
  };
  return (
    <Grafico
      chave={`${acumulado}:${vigente}:${anterior}`}
      rotulo={`Volume transferido no ano: ${fmt(acumulado, 1, ' hm³')}${vigente !== null ? ` de um limite de ${fmt(vigente, 1, ' hm³')}` : ''}`}
      montar={() => ({
        type: 'doughnut',
        data: {
          labels: ['Transferido', 'Disponível'],
          datasets: [{ data: [Math.min(acumulado, teto), Math.max(0, teto - acumulado)], backgroundColor: ['#12a8d2', 'rgba(255,255,255,.14)'], borderWidth: 0 }],
        },
        options: {
          rotation: -90,
          circumference: 180,
          cutout: '70%',
          layout: { padding: { top: 16, left: 8, right: 8 } },
          plugins: { tooltip: { callbacks: { label: (x) => `${x.label}: ${fmt(x.parsed, 1, ' hm³')}` } } },
        },
        plugins: [marcaRef as Plugin],
      })}
    />
  );
}
