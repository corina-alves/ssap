'use client';

import { useEffect, useRef } from 'react';
import type { Chart as ChartJs, ChartConfiguration, Plugin } from 'chart.js';

/**
 * Gráficos iguais aos do site PHP: Chart.js 4 + chartjs-plugin-datalabels 2 +
 * chartjs-plugin-annotation 3, com as MESMAS configurações dos arquivos
 * assets/js/*.js da referência (cores, rótulos, eixos, dicas). Os dados vêm do
 * servidor; cada componente só monta o gráfico no navegador.
 */

// ------------------------------------------------------------ carregamento

type Libs = { Chart: typeof ChartJs; ChartDataLabels: Plugin };
let libs: Promise<Libs> | null = null;

function carregarLibs(): Promise<Libs> {
  libs ??= Promise.all([import('chart.js/auto'), import('chartjs-plugin-datalabels'), import('chartjs-plugin-annotation')]).then(
    ([chart, datalabels, annotation]) => {
      const Chart = chart.default;
      // annotation é registrado globalmente (o UMD do PHP se registra sozinho);
      // datalabels é passado por gráfico, como no PHP (plugins: [ChartDataLabels]).
      Chart.register(annotation.default);
      return { Chart, ChartDataLabels: datalabels.default as unknown as Plugin };
    },
  );
  return libs;
}

// ------------------------------------------- padrão SSSP (sssp-charts.js)

/** Fonte/cor/legenda que o sssp-charts.js põe em Chart.defaults nas páginas internas (não na Home). */
const FONTE = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const COR_TEXTO = '#3b4a59';

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** deepMerge do sssp-charts.js: `b` sobrescreve `a`. */
function mesclar(a: Obj, b: Obj): Obj {
  for (const k of Object.keys(b)) {
    const va = a[k];
    const vb = b[k];
    if (ehObj(vb) && ehObj(va)) mesclar(va, vb);
    else a[k] = vb;
  }
  return a;
}

/**
 * No PHP esses valores vêm de Chart.defaults (globais). Aqui são aplicados por
 * gráfico para não vazar para os gráficos da Home, que usam o padrão do Chart.js.
 */
function padraoSssp(cfg: ChartConfiguration): ChartConfiguration {
  const fonte = { family: FONTE, size: 13 };
  const base: Obj = {
    color: COR_TEXTO,
    plugins: {
      legend: { labels: { usePointStyle: true, boxWidth: 10, color: COR_TEXTO, font: { ...fonte } } },
      tooltip: { titleFont: { ...fonte }, bodyFont: { ...fonte }, footerFont: { ...fonte } },
      datalabels: { color: COR_TEXTO, font: { family: FONTE } },
    },
  };
  const tipo = cfg.type as string | undefined;
  if (tipo !== 'doughnut' && tipo !== 'pie') {
    const escalas = Object.keys((cfg.options?.scales as Obj | undefined) ?? {});
    for (const id of new Set(['x', 'y', ...escalas])) {
      ((base.scales ??= {}) as Obj)[id] = { ticks: { color: COR_TEXTO, font: { ...fonte } }, title: { color: COR_TEXTO, font: { ...fonte } } };
    }
  }
  return { ...cfg, options: mesclar(base, (cfg.options ?? {}) as Obj) as ChartConfiguration['options'] };
}

/** base() do sssp-charts.js — opções comuns de precipitação/vazão/previsão. */
function baseSssp(over: Obj): Obj {
  return mesclar(
    {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { padding: 14 } },
        tooltip: {
          backgroundColor: 'rgba(17,34,51,.94)',
          padding: 10,
          titleFont: { weight: '600' },
          borderColor: 'rgba(255,255,255,.12)',
          borderWidth: 1,
        },
        datalabels: { display: false },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 12 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.06)' }, ticks: { font: { size: 12 } } },
      },
    },
    over,
  );
}

const CORES = { azul: '#0b4f8a', azulClaro: '#4a90c4', ciano: '#0d7ea4', verde: '#2e7d54', laranja: '#e08600', vermelho: '#c0392b', cinza: '#8a99a8', roxo: '#7d3c98' };
const PALETA = [CORES.azul, CORES.ciano, CORES.laranja, CORES.verde, CORES.roxo, CORES.vermelho, CORES.cinza];

// ------------------------------------------------------------ formatação

/** SSSP.num */
const num = (v: unknown, casas = 1, suf = '') => {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  return Number.isNaN(n) ? '-' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + suf;
};
/** inteiro() de reservatorios.js */
const inteiro = (v: unknown, suf = '') => {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  return Number.isNaN(n) ? '-' : Math.round(n).toLocaleString('pt-BR') + suf;
};
/** inteiro() de precipitacao.js / vazao.js */
const inteiroVazio = (v: unknown) => {
  const n = Number(v);
  return Number.isNaN(n) ? '' : Math.round(n).toLocaleString('pt-BR');
};
const umaCasa = (v: unknown, suf = '') => num(v, 1, suf);

// ------------------------------------------------------------ componente base

export type Montar = (l: Libs) => ChartConfiguration;

/** <canvas> com o gráfico; refeito quando `chave` muda. */
export function Canvas({ montar, chave, rotulo, sssp = true, id, className }: { montar: Montar; chave: string; rotulo: string; sssp?: boolean; id?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const montarRef = useRef(montar);
  montarRef.current = montar;

  useEffect(() => {
    let grafico: ChartJs | null = null;
    let cancelado = false;
    carregarLibs().then((l) => {
      if (cancelado || !ref.current) return;
      const cfg = montarRef.current(l);
      grafico = new l.Chart(ref.current, sssp ? padraoSssp(cfg) : cfg);
    });
    return () => {
      cancelado = true;
      grafico?.destroy();
    };
  }, [chave, sssp]);

  return (
    <canvas ref={ref} id={id} className={className} role="img" aria-label={rotulo}>
      {rotulo}
    </canvas>
  );
}

const resumo = (rotulos: string[], valores: (number | null)[], suf: string) =>
  rotulos.map((r, i) => `${r}: ${valores[i] === null || valores[i] === undefined ? 'sem dado' : num(valores[i], 1, suf)}`).join('; ');

// ======================================================== Home (index.php)

/** "Principais Sistemas" — barras horizontais (graficoResumoCantareiraSim). */
export function GraficoResumoSistemas({ cantareira, altoTiete, sim }: { cantareira: number | null; altoTiete: number | null; sim: number | null }) {
  const dados = [cantareira ?? 0, altoTiete ?? 0, sim ?? 0];
  const rotulos = ['Cantareira', 'Alto Tietê', 'SIM'];
  return (
    <Canvas
      id="graficoResumoCantareiraSim"
      sssp={false}
      chave={dados.join()}
      rotulo={`Volume útil atual: ${resumo(rotulos, [cantareira, altoTiete, sim], '%')}`}
      montar={({ ChartDataLabels }) => ({
        type: 'bar',
        data: {
          labels: rotulos,
          datasets: [
            {
              label: 'Volume útil (%)',
              data: dados,
              backgroundColor: ['#0bb287', '#153d78', '#153d78'],
              borderRadius: 8,
              borderSkipped: false,
              barThickness: 28,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 8, right: 48, bottom: 5, left: 0 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (c) => c[0]?.label ?? '',
                label: (c) => 'Volume útil: ' + Number(c.parsed.x).toFixed(1) + '%',
              },
            },
            datalabels: {
              anchor: 'end',
              align: 'right',
              clamp: true,
              color: '#142d50',
              font: { size: 13, weight: 'bold' },
              formatter: (v: number) => Number(v).toFixed(1) + '%',
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              max: 100,
              ticks: { stepSize: 20, color: '#9aa8b8', font: { size: 9 }, callback: (v) => v + '%' },
              grid: { color: 'rgba(98,119,141,.14)' },
              border: { display: false },
            },
            y: {
              ticks: { color: '#17365f', font: { size: 11, weight: 'bold' }, padding: 8 },
              grid: { display: false },
              border: { display: false },
            },
          },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}

/** "Evolução do Volume - Cantareira" da Home (graficoCantareira). */
export function GraficoCantareiraHome({ pontos }: { pontos: { ano: number; volume: number | null }[] }) {
  return (
    <Canvas
      id="graficoCantareira"
      sssp={false}
      chave={pontos.map((p) => `${p.ano}:${p.volume}`).join()}
      rotulo={`Volume do Cantareira por ano: ${resumo(pontos.map((p) => String(p.ano)), pontos.map((p) => p.volume), '%')}`}
      montar={({ ChartDataLabels }) => ({
        type: 'line',
        data: {
          labels: pontos.map((p) => p.ano),
          datasets: [
            {
              label: 'Cantareira (%)',
              data: pontos.map((p) => p.volume),
              borderColor: '#1565c0',
              backgroundColor: 'rgba(21,101,192,0.08)',
              borderWidth: 4,
              tension: 0.3,
              pointRadius: 5,
              pointHoverRadius: 7,
              pointBackgroundColor: '#1565c0',
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { right: 16 } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => Number(c.parsed.y).toFixed(1) + '%' } },
            datalabels: { align: 'top', anchor: 'end', color: '#24364b', font: { size: 11, weight: 'bold' }, formatter: (v: number | null) => Number(v).toFixed(1) + '%' },
          },
          scales: { y: { beginAtZero: true, max: 120, title: { display: true, color: '#24364b', text: 'Volume (%)' } } },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}

// ================================================ Reservatórios (reservatorios.js)

/** Linhas de faixa SEM rótulo numérico no topo do gráfico. */
function faixas() {
  const mk = (y: number, cor: string) => ({ type: 'line' as const, yMin: y, yMax: y, borderColor: cor, borderWidth: 2, borderDash: [6, 6] });
  return { f60: mk(60, '#f4b400'), f40: mk(40, '#e08600'), f30: mk(30, '#dc3545'), f20: mk(20, '#800080') };
}

/** "Comparativo de volumes" (grafSistema). */
export function GraficoVolumeSistemas({
  labels,
  volAtual,
  volAnterior,
  rotuloAtual,
  rotuloAnterior,
}: {
  labels: string[];
  volAtual: (number | null)[];
  volAnterior: (number | null)[];
  rotuloAtual: string;
  rotuloAnterior: string;
}) {
  return (
    <Canvas
      id="grafSistema"
      chave={[rotuloAtual, ...volAtual, ...volAnterior].join()}
      rotulo={`Volume útil em ${rotuloAtual}: ${resumo(labels, volAtual, '%')}. Em ${rotuloAnterior}: ${resumo(labels, volAnterior, '%')}.`}
      montar={({ ChartDataLabels }) => ({
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: rotuloAnterior, data: volAnterior, backgroundColor: '#9dc3e6' },
            { label: rotuloAtual, data: volAtual, backgroundColor: '#0b4f8a' },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 18 } },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top' },
            datalabels: { anchor: 'end', align: 'top', offset: 4, formatter: (v: number | null) => umaCasa(v, '') },
            tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + umaCasa(c.parsed.y, '%') } },
            annotation: { annotations: faixas() },
          },
          scales: {
            y: { beginAtZero: true, max: 120, title: { display: true, text: 'Volume (%)' }, ticks: { callback: (v) => inteiro(v, '%') } },
          },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}

const PESOS: Record<string, number> = {
  Cantareira: 50.5,
  'Alto Tietê': 28.8,
  Guarapiranga: 8.8,
  'Rio Grande': 5.8,
  'São Lourenço': 4.6,
  'Rio Claro': 0.7,
  Cotia: 0.8,
};

/** Rosca com o peso de cada sistema no SIM (graficoPizza). */
export function GraficoPesosSim() {
  return (
    <Canvas
      id="graficoPizza"
      className="mt-3"
      chave="pesos"
      rotulo={`Participação de cada sistema no SIM: ${Object.entries(PESOS)
        .map(([k, v]) => `${k} ${num(v, 1, '%')}`)
        .join('; ')}`}
      montar={({ ChartDataLabels }) => ({
        type: 'doughnut',
        data: {
          // Valor de todas as fatias também na legenda (as pequenas não comportam rótulo).
          labels: Object.keys(PESOS).map((k) => `${k} (${num(PESOS[k], 1, '%')})`),
          datasets: [
            {
              data: Object.values(PESOS),
              backgroundColor: ['#0b4f8a', '#0d7ea4', '#16a6c9', '#198754', '#6c7f91', '#e08600', '#8c1c24'],
              borderColor: '#fff',
              borderWidth: 1,
            },
          ],
        },
        options: {
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 11, font: { size: 10 } } },
            // Valor em cima da fatia, só nas que comportam o rótulo.
            datalabels: {
              display: (c) => Number(c.dataset.data[c.dataIndex]) >= 4,
              color: '#fff',
              font: { size: 12, weight: 'bold' },
              formatter: (v: number) => num(v, 1, '%'),
            },
            tooltip: { callbacks: { label: (c) => c.label } },
          },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}

/** "Acompanhamento do Cantareira / SIM" (serieLinha). */
export function GraficoSerieAnual({ id, label, anos, valores, cor }: { id: string; label: string; anos: number[]; valores: (number | null)[]; cor: string }) {
  return (
    <Canvas
      id={id}
      chave={valores.join()}
      rotulo={`${label} por ano: ${resumo(anos.map(String), valores, '%')}`}
      montar={({ ChartDataLabels }) => ({
        type: 'line',
        data: {
          labels: anos,
          datasets: [{ label, data: valores, borderColor: cor, backgroundColor: cor + '22', borderWidth: 3, tension: 0.3, fill: true, pointRadius: 4, spanGaps: true }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            datalabels: {
              align: 'top',
              anchor: 'end',
              offset: 4,
              color: '#12263a',
              font: { weight: 'bold', size: 11 },
              formatter: (v: number | null) => (v == null ? '' : inteiro(v, '%')),
            },
            tooltip: { callbacks: { label: (c) => (c.parsed.y == null ? 'Sem dado' : inteiro(c.parsed.y, '%')) } },
          },
          scales: { y: { beginAtZero: true, max: 120, title: { display: true, text: 'Volume (%)' }, ticks: { callback: (v) => inteiro(v, '%') } } },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "Volume mensal transferido" (transpGrafico). */
export function GraficoTransposicaoMensal({ meses }: { meses: { mes: number; volumeHm3: number | null }[] }) {
  const rotulos = meses.map((m) => MESES_CURTO[m.mes - 1] ?? String(m.mes));
  return (
    <Canvas
      id="transpGrafico"
      chave={meses.map((m) => m.volumeHm3).join()}
      rotulo={`Volume transferido por mês, em hm³: ${resumo(rotulos, meses.map((m) => m.volumeHm3), ' hm³')}`}
      montar={({ ChartDataLabels }) => ({
        type: 'line',
        data: {
          labels: rotulos,
          datasets: [
            {
              label: 'Volume transferido (hm³)',
              data: meses.map((m) => m.volumeHm3),
              borderColor: '#0b4f8a',
              backgroundColor: 'rgba(11,79,138,.15)',
              borderWidth: 2.5,
              tension: 0.3,
              fill: true,
              pointRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            datalabels: { align: 'top', anchor: 'end', offset: 4, color: '#12263a', font: { weight: 'bold', size: 10 }, formatter: (v: number | null) => umaCasa(v) },
            tooltip: { callbacks: { label: (c) => umaCasa(c.parsed.y, ' hm³') } },
          },
          scales: { y: { beginAtZero: true, title: { display: true, text: 'Volume (hm³)' } } },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}

/** Meia-rosca do acumulado no ano com a marca do limite anterior (transpGauge). */
export function GraficoTransposicaoGauge({ acumulado, vigente, anterior }: { acumulado: number; vigente: number | null; anterior: number | null }) {
  const teto = vigente ?? (acumulado || 1);
  const restante = Math.max(0, teto - acumulado);

  // Marca de referência do limite anterior (ex.: 162 hm³) sobre o arco.
  const refMarcador: Plugin<'doughnut'> = {
    id: 'refMarcador',
    afterDatasetsDraw(chart) {
      if (vigente === null || anterior === null || !teto || anterior > teto) return;
      const arco = chart.getDatasetMeta(0).data[0] as unknown as { x: number; y: number; innerRadius: number; outerRadius: number } | undefined;
      if (!arco) return;
      const ang = ((-90 + (anterior / teto) * 180) * Math.PI) / 180;
      const sin = Math.sin(ang);
      const cos = Math.cos(ang);
      const rInt = arco.innerRadius - 3;
      const rExt = arco.outerRadius + 5;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = '#e0770e';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(arco.x + rInt * sin, arco.y - rInt * cos);
      ctx.lineTo(arco.x + rExt * sin, arco.y - rExt * cos);
      ctx.stroke();
      ctx.fillStyle = '#e0770e';
      ctx.font = '700 12px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(umaCasa(anterior).replace(',0', ''), arco.x + (rExt + 11) * sin, arco.y - (rExt + 11) * cos);
      ctx.restore();
    },
  };

  return (
    <Canvas
      id="transpGauge"
      chave={`${acumulado}:${vigente}:${anterior}`}
      rotulo={`Volume transferido no ano: ${num(acumulado, 1, ' hm³')}${vigente !== null ? ` de um limite de ${num(vigente, 1, ' hm³')}` : ''}`}
      montar={() => ({
        type: 'doughnut',
        data: {
          labels: ['Transferido', 'Disponível'],
          datasets: [{ data: [Math.min(acumulado, teto), restante], backgroundColor: ['#0b4f8a', '#e2e8f0'], borderWidth: 0 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          rotation: -90,
          circumference: 180,
          cutout: '72%',
          layout: { padding: { top: 18, left: 10, right: 10 } },
          plugins: {
            legend: { display: false },
            datalabels: { display: false },
            tooltip: { callbacks: { label: (c) => c.label + ': ' + umaCasa(c.parsed, ' hm³') } },
          },
        },
        plugins: [refMarcador as Plugin],
      })}
    />
  );
}

// ===================================== Precipitação e Vazão (precipitacao.js / vazao.js)

export type LinhaGraficoSistema = {
  sistema: string;
  dia: number | null;
  seteDias: number | null;
  mes: number | null;
  refs: (number | null)[];
  mediaHistorica: number | null;
  mlt: number | null;
};

const VARIANTES = {
  chuva: {
    id: 'graficoChuvas',
    rotulos: ['Chuva dia', 'Chuva 7 dias', 'Mês atual'],
    cores: ['#1f77b4', '#7fb3d5', '#227542'],
    coresRefs: ['#8e44ad', '#e7bf82', '#af1400'],
    corMedia: '#fc9d10',
    unidade: ' mm',
    tituloY: 'Precipitação (mm)',
  },
  vazao: {
    id: 'graficoVazao',
    rotulos: ['Vazão do dia', 'Últimos 7 dias', 'Média do mês'],
    cores: ['#1f77b4', '#7fb3d5', '#227542'],
    coresRefs: ['#9467bd', '#ffbb78', '#af1400'],
    corMedia: '#ff7f0e',
    unidade: ' m³/s',
    tituloY: 'Vazão (m³/s)',
  },
} as const;

/** "Precipitação por sistema" / "Vazão natural por sistema": 7 barras + linha da MLT no eixo da direita. */
export function GraficoSistemas({ tipo, linhas, anosReferencia }: { tipo: 'chuva' | 'vazao'; linhas: LinhaGraficoSistema[]; anosReferencia: number[] }) {
  const v = VARIANTES[tipo];
  const labels = linhas.map((l) => l.sistema);
  const col = (f: (l: LinhaGraficoSistema) => number | null) => linhas.map(f);
  return (
    <Canvas
      id={v.id}
      chave={JSON.stringify(linhas)}
      rotulo={`${v.tituloY} por sistema. Mês atual: ${resumo(labels, col((l) => l.mes), v.unidade)}. MLT: ${resumo(labels, col((l) => l.mlt), '%')}.`}
      montar={({ ChartDataLabels }) => ({
        type: 'bar',
        data: {
          labels,
          datasets: [
            { type: 'bar', label: v.rotulos[0], data: col((l) => l.dia), backgroundColor: v.cores[0], order: 1 },
            { type: 'bar', label: v.rotulos[1], data: col((l) => l.seteDias), backgroundColor: v.cores[1], order: 1 },
            { type: 'bar', label: v.rotulos[2], data: col((l) => l.mes), backgroundColor: v.cores[2], order: 1 },
            ...anosReferencia.slice(0, 3).map((ano, i) => ({
              type: 'bar' as const,
              label: String(ano),
              data: col((l) => l.refs[i] ?? null),
              backgroundColor: v.coresRefs[i],
              order: 1,
            })),
            { type: 'bar', label: 'Média histórica', data: col((l) => l.mediaHistorica), backgroundColor: v.corMedia, order: 1 },
            {
              type: 'line',
              label: 'MLT – Média de Longo Termo (%)',
              data: col((l) => l.mlt),
              borderColor: '#0b4f8a',
              backgroundColor: '#0b4f8a',
              borderWidth: 4,
              borderDash: [3, 6],
              pointRadius: 5,
              tension: 0.3,
              yAxisID: 'y1',
              order: 0,
              spanGaps: true,
              datalabels: {
                display: true,
                anchor: 'end',
                align: 'top',
                offset: 8,
                color: '#0b4f8a',
                font: { weight: 'bold', size: 14 },
                backgroundColor: 'rgba(255,255,255,.82)',
                borderRadius: 4,
                padding: 4,
                formatter: (x: number | null) => (x == null ? '' : inteiroVazio(x) + '%'),
              },
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: (c) => c.dataset.label + ': ' + inteiroVazio(c.parsed.y) + ((c.dataset as { yAxisID?: string }).yAxisID === 'y1' ? '%' : v.unidade),
              },
            },
            datalabels: {
              anchor: 'end',
              align: 'top',
              color: '#42556a',
              font: { size: 12, weight: 600 },
              formatter: (x: number | null, ctx) => ((ctx.dataset as { type?: string }).type === 'line' ? '' : x ? inteiroVazio(x) : ''),
            },
          },
          scales: {
            // grace: folga acima do maior valor, para os rótulos não invadirem a legenda.
            y: { beginAtZero: true, grace: '10%', position: 'left', title: { display: true, text: v.tituloY } },
            y1: { beginAtZero: true, grace: '15%', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'MLT (%)' } },
          },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}

// ====================================================== Previsão (sssp-charts.js)

/** "Chuva prevista" do município (criarPrevisao): barras de chuva + linhas de temperatura. */
export function GraficoPrevisaoMunicipio({ labels, chuva, tmax, tmin }: { labels: string[]; chuva: (number | null)[]; tmax: (number | null)[]; tmin: (number | null)[] }) {
  return (
    <Canvas
      id="graficoPrevisao"
      chave={[...labels, ...chuva].join()}
      rotulo={`Chuva prevista por dia: ${resumo(labels, chuva, ' mm')}`}
      montar={() => ({
        type: 'bar',
        data: {
          labels,
          datasets: [
            { type: 'bar', label: 'Chuva (mm)', data: chuva, backgroundColor: CORES.azul, borderRadius: 4, yAxisID: 'y', order: 2, maxBarThickness: 46 },
            { type: 'line', label: 'Temp. máx. (°C)', data: tmax, borderColor: CORES.laranja, backgroundColor: CORES.laranja, yAxisID: 'y1', tension: 0.3, order: 1 },
            { type: 'line', label: 'Temp. mín. (°C)', data: tmin, borderColor: CORES.ciano, backgroundColor: CORES.ciano, yAxisID: 'y1', tension: 0.3, order: 1 },
          ],
        },
        options: baseSssp({
          scales: {
            y: { title: { display: true, text: 'Chuva (mm)' } },
            y1: { position: 'right', beginAtZero: false, grid: { drawOnChartArea: false }, title: { display: true, text: 'Temperatura (°C)' } },
          },
        }) as ChartConfiguration['options'],
      })}
    />
  );
}

/** "Evolução diária" da previsão por sistema (criarPrecipitacao com séries em linha). */
export function GraficoPrevisaoSistemas({ labels, series }: { labels: string[]; series: { sistema: string; chuva: (number | null)[] }[] }) {
  return (
    <Canvas
      id="grafPrevisaoSistemas"
      chave={JSON.stringify(series)}
      rotulo={`Chuva prevista por dia em cada sistema: ${series.map((s) => `${s.sistema} (${resumo(labels, s.chuva, ' mm')})`).join('. ')}`}
      montar={() => ({
        type: 'line',
        data: {
          labels,
          datasets: series.map((s, i) => {
            const cor = PALETA[i % PALETA.length]!;
            return { type: 'line' as const, label: s.sistema, data: s.chuva, backgroundColor: cor, borderColor: cor, borderWidth: 2, borderRadius: 4, tension: 0.3, maxBarThickness: 46 };
          }),
        },
        options: baseSssp({ scales: { y: { title: { display: true, text: 'Chuva prevista (mm/dia)' } } } }) as ChartConfiguration['options'],
      })}
    />
  );
}

// ============================================ Curva de Contingência (curva_contingencia.php)

type PontoXY = { x: number; y: number };
const emMs = (ymd: string) => Date.parse(`${ymd}T12:00:00Z`);
const mesAno = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
};

/**
 * "Projeção de Volume — SIM e Cantareira": curvas de contingência × observado,
 * com as linhas de 40%, 30% e 20%. O eixo do tempo é linear em milissegundos,
 * com uma marca por mês (o PHP usava o adaptador de datas do Chart.js).
 */
export function GraficoCurvaContingencia({
  inicio,
  fim,
  curvaSim,
  curvaCantareira,
  observado,
  fonteCantareira,
}: {
  inicio: string;
  fim: string;
  curvaSim: { data: string; valor: number }[];
  curvaCantareira: { data: string; valor: number }[];
  observado: { data: string; sim: number | null; cantareira: number | null }[];
  /** Fonte do Cantareira observado, mostrada na legenda. */
  fonteCantareira?: string;
}) {
  const obsSim = observado.filter((o) => o.sim !== null);
  const obsCant = observado.filter((o) => o.cantareira !== null);
  const ultimoSim = obsSim.length ? emMs(obsSim[obsSim.length - 1]!.data) : null;
  const ultimoCant = obsCant.length ? emMs(obsCant[obsCant.length - 1]!.data) : null;
  const linha = (y: number, cor: string) => ({
    type: 'line' as const, yMin: y, yMax: y, borderColor: cor, borderWidth: 2, borderDash: [6, 6],
    label: { display: true, content: `${y}%`, position: 'end' as const },
  });
  const serie = (label: string, tipo: string, data: PontoXY[], cor: string, largura: number, destaque: number | null, ordem: number) => ({
    label: `${label} · ${tipo}`, data, borderColor: cor, backgroundColor: cor, pointBackgroundColor: cor, pointBorderColor: cor,
    borderWidth: largura, pointRadius: (c: { raw: unknown }) => ((c.raw as PontoXY | undefined)?.x === destaque ? 3 : 0),
    pointHoverRadius: 4, pointBorderWidth: 0, tension: 0.25, spanGaps: true, order: ordem,
  });

  return (
    <Canvas
      id="grafico"
      chave={`${inicio}|${fim}|${observado.length}|${ultimoSim}|${ultimoCant}`}
      rotulo={`Curva de contingência e volume observado do SIM e do Cantareira, de ${inicio} a ${fim}.`}
      montar={() => ({
        type: 'line',
        data: {
          datasets: [
            serie('SIM', 'Curva de Contingência', curvaSim.map((p) => ({ x: emMs(p.data), y: p.valor })), '#00a8ff', 3, ultimoSim, 1),
            serie('SIM', 'Observado', obsSim.map((o) => ({ x: emMs(o.data), y: o.sim! })), '#0047d6', 2.5, ultimoSim, 0),
            serie('Cantareira', 'Curva de Contingência', curvaCantareira.map((p) => ({ x: emMs(p.data), y: p.valor })), '#2ecc71', 3, ultimoCant, 1),
            serie('Cantareira', fonteCantareira ? `Observado (${fonteCantareira.split(';')[0]})` : 'Observado', obsCant.map((o) => ({ x: emMs(o.data), y: o.cantareira! })), '#00953f', 2.5, ultimoCant, 0),
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { font: { size: 13 }, usePointStyle: true, pointStyle: 'line', pointStyleWidth: 34 } },
            tooltip: {
              callbacks: {
                title: (c) => new Date(c[0]!.parsed.x ?? 0).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
                label: (c) => `${c.dataset.label}: ${num(c.parsed.y, 2, '%')}`,
              },
            },
            annotation: { annotations: { a40: linha(40, '#f39c12'), a30: linha(30, '#dc3545'), a20: linha(20, '#6f42c1') } },
          },
          scales: {
            x: {
              type: 'linear',
              min: emMs(inicio),
              max: emMs(fim),
              // uma marca no dia 1 de cada mês
              afterBuildTicks: (eixo) => {
                const marcas: { value: number }[] = [];
                const d = new Date(eixo.min);
                d.setUTCDate(1);
                d.setUTCHours(12, 0, 0, 0);
                if (d.getTime() < eixo.min) d.setUTCMonth(d.getUTCMonth() + 1);
                for (; d.getTime() <= eixo.max; d.setUTCMonth(d.getUTCMonth() + 1)) marcas.push({ value: d.getTime() });
                eixo.ticks = marcas;
              },
              ticks: { maxRotation: 45, minRotation: 45, callback: (v) => mesAno(Number(v)) },
              title: { display: true, text: 'Data', font: { size: 14, weight: 'bold' } },
            },
            y: {
              min: 10,
              max: 100,
              ticks: { stepSize: 10, callback: (v) => `${v}%` },
              title: { display: true, text: 'Volume útil (%)', font: { size: 14, weight: 'bold' } },
            },
          },
        },
      })}
    />
  );
}

// ============================================ Vazões Outorgadas (vazoes-outorgadas.php)

/** "Captação observada x Limite de retirada" — barras horizontais por sistema. */
export function GraficoOutorgas({ sistemas }: { sistemas: { nome: string; captacao: number | null; outorga: number }[] }) {
  const nomes = sistemas.map((s) => s.nome);
  const barra = { borderRadius: 7, borderSkipped: false as const, barPercentage: 0.72, categoryPercentage: 0.72 };
  return (
    <Canvas
      id="graficoOutorgas"
      sssp={false}
      chave={sistemas.map((s) => `${s.captacao}/${s.outorga}`).join()}
      rotulo={`Captação observada: ${resumo(nomes, sistemas.map((s) => s.captacao), ' m³/s')}. Limite de retirada: ${resumo(nomes, sistemas.map((s) => s.outorga), ' m³/s')}`}
      montar={({ ChartDataLabels }) => ({
        type: 'bar',
        data: {
          labels: nomes,
          datasets: [
            { label: 'Captação observada', data: sistemas.map((s) => s.captacao ?? 0), backgroundColor: '#0aa58f', ...barra },
            { label: 'Limite de retirada', data: sistemas.map((s) => s.outorga), backgroundColor: '#173d78', ...barra },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 6, right: 36 } },
          plugins: {
            legend: { position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'circle', color: '#42566b', font: { size: 11, weight: 600 } } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${num(c.parsed.x, 1, ' m³/s')}` } },
            datalabels: { anchor: 'end', align: 'right', clamp: true, color: '#18324a', font: { size: 10, weight: 'bold' }, formatter: (v: number) => num(v, 1) },
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: 'rgba(104,123,142,.12)' },
              border: { display: false },
              ticks: { color: '#8190a0', font: { size: 9 } },
              title: { display: true, text: 'Vazão (m³/s)', color: '#617487', font: { size: 10, weight: 700 } },
            },
            y: { grid: { display: false }, border: { display: false }, ticks: { color: '#173a67', font: { size: 10, weight: 700 } } },
          },
        },
        plugins: [ChartDataLabels],
      })}
    />
  );
}
