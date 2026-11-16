'use client';

import type { ECharts, EChartsOption, ToolboxComponentOption, TooltipComponentOption } from 'echarts';
import { useCallback, useEffect, useRef } from 'react';

/** Cores e fonte do painel (fundo azul-marinho). */
export const TEMA = {
  texto: '#d6e4f0',
  fraco: '#8fa6bd',
  grade: 'rgba(255,255,255,.08)',
};

/**
 * Exportação em fundo branco, para documentos: cada cor do painel (feita para o
 * fundo escuro) vira a de papel. Texto e grade escurecem; as séries claras
 * demais no branco (azul-claro, âmbar, lilás, verde, salmão) passam para tons
 * validados no branco (faixa de luminosidade, daltonismo e contraste ≥ 3:1).
 * As cores dos reservatórios do Cantareira já passam no branco e ficam.
 */
const PAPEL: Record<string, string> = {
  // texto, eixos e grade
  [TEMA.texto]: '#1f2d3d',
  [TEMA.fraco]: '#5b6b7c', // também a do ano anterior, tracejada
  [TEMA.grade]: '#e3e8ee',
  '#9fb5cb': '#6b7f93', // metas (linhas de referência)
  // séries do painel (graficos.ts, COR)
  '#4fc3f7': '#2a78d6', // volume, chuva, afluente
  'rgba(79,195,247,.12)': 'rgba(42,120,214,.10)',
  '#c39bff': '#b0479a', // defluente
  '#ff7a8a': '#e34948', // captada
  '#ffb020': '#c98500', // acumulado, transferência
  '#2ecc71': '#1e9e5a', // natural, recuperação
  '#ff6b6b': '#d63c3c', // redução
  '#f4b400': '#d19a00', // faixa E1
  '#e66767': '#e34948', // mínima diária
};
const BRANCO = '#ffffff';

/** Troca as cores do painel pelas de papel em toda a opção (dados e funções ficam como estão). */
function paraPapel(v: unknown): unknown {
  if (typeof v === 'string') return PAPEL[v.toLowerCase()] ?? v;
  if (Array.isArray(v)) return v.map(paraPapel);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, paraPapel(x)]));
  }
  return v;
}

/** Ícone de download do próprio ECharts (o do "saveAsImage"). */
const ICONE_BAIXAR = 'path://M4.7,22.9L29.3,45.5L54.7,23.4M4.6,43.6L4.6,58L53.8,58L53.8,43.6M29.2,45.1L29.2,0';

const nomeArquivo = (titulo: string) =>
  `${
    titulo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90)
      .replace(/-$/, '') || 'grafico'
  }.png`;

/** Quebra o título em linhas que caibam na largura. */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && ctx.measureText(tentativa).width > largura) {
      linhas.push(atual);
      atual = palavra;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

const carregarImagem = (url: string) =>
  new Promise<HTMLImageElement>((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error('imagem do gráfico'));
    img.src = url;
  });

/**
 * PNG do gráfico em fundo branco, com o título em cima (fora do painel o
 * gráfico perde o cabeçalho do cartão). Desenha uma cópia fora da tela, com o
 * zoom e as séries escolhidas na legenda do gráfico da tela, sem a barra de
 * ferramentas e sem a régua de zoom; largura mínima de 760 px (2× para nitidez).
 */
async function baixarEmBranco(ec: typeof import('echarts'), grafico: ECharts, el: HTMLElement, titulo: string) {
  const largura = Math.max(el.clientWidth, 760);
  const altura = Math.max(el.clientHeight, 300);
  const fonte = getComputedStyle(el).fontFamily;
  const caixa = document.createElement('div');
  caixa.style.cssText = `position:fixed;left:-10000px;top:0;width:${largura}px;height:${altura}px`;
  document.body.appendChild(caixa);
  const copia = ec.init(caixa, null, { renderer: 'canvas', width: largura, height: altura });
  try {
    const op = paraPapel(grafico.getOption()) as EChartsOption & Record<string, unknown>;
    op.animation = false;
    op.backgroundColor = BRANCO;
    delete op.toolbox;
    const zooms = (Array.isArray(op.dataZoom) ? op.dataZoom : op.dataZoom ? [op.dataZoom] : []) as { type?: string; show?: boolean }[];
    if (zooms.some((z) => z.type === 'slider')) {
      // a régua some (o recorte continua) e o espaço dela vai para o gráfico
      op.dataZoom = zooms.map((z) => (z.type === 'slider' ? { ...z, show: false } : z)) as EChartsOption['dataZoom'];
      const grades = (Array.isArray(op.grid) ? op.grid : op.grid ? [op.grid] : []) as { bottom?: unknown }[];
      op.grid = grades.map((g) => (typeof g.bottom === 'number' && g.bottom >= 44 ? { ...g, bottom: g.bottom - 26 } : g)) as EChartsOption['grid'];
    }
    copia.setOption(op, true);
    const imagem = await carregarImagem(copia.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: BRANCO }));

    const tela = document.createElement('canvas');
    const ctx = tela.getContext('2d');
    if (!ctx) return;
    ctx.font = `600 15px ${fonte}`;
    const linhas = quebrar(ctx, titulo, largura - 24);
    const topo = 14 + linhas.length * 20;
    tela.width = largura * 2;
    tela.height = (altura + topo) * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = BRANCO;
    ctx.fillRect(0, 0, largura, altura + topo);
    ctx.fillStyle = PAPEL[TEMA.texto]!;
    ctx.font = `600 15px ${fonte}`;
    ctx.textBaseline = 'top';
    linhas.forEach((l, i) => ctx.fillText(l, 12, 10 + i * 20));
    ctx.drawImage(imagem, 0, topo, largura, altura);

    const a = document.createElement('a');
    a.href = tela.toDataURL('image/png');
    a.download = nomeArquivo(titulo);
    a.click();
  } finally {
    copia.dispose();
    caixa.remove();
  }
}

const fonte = (el: HTMLElement | null) => (el ? getComputedStyle(el).fontFamily : 'sans-serif');

/**
 * Dica no mesmo visual da dos gráficos do painel (Chart.js, páginas pública e
 * restrita): fundo preto translúcido, texto branco, cantos de 6 px, sem borda.
 * As linhas que marcam o dia apontado ficam discretas sobre o fundo escuro.
 */
const DICA: TooltipComponentOption = {
  trigger: 'axis',
  confine: true,
  backgroundColor: 'rgba(0,0,0,.8)',
  borderWidth: 0,
  borderRadius: 6,
  padding: [6, 8],
  extraCssText: 'box-shadow:none',
  axisPointer: { lineStyle: { color: 'rgba(255,255,255,.35)' }, shadowStyle: { color: 'rgba(255,255,255,.06)' } },
};

/**
 * Opções comuns: dica com todos os valores do dia, legenda clicável, zoom no
 * tempo e o PNG em fundo branco. Um gráfico pode esconder botões com
 * `toolbox.feature.<botão>.show = false` (o de baixar fica sempre).
 */
function base(el: HTMLElement | null, opcao: EChartsOption, baixar: () => void): EChartsOption {
  // a dica de cada gráfico (formato dos valores) entra por cima da comum, sem apagar as cores
  const propria = opcao.tooltip as TooltipComponentOption | undefined;
  const ferramentas = opcao.toolbox as ToolboxComponentOption | undefined;
  return {
    backgroundColor: 'transparent',
    textStyle: { color: TEMA.texto, fontFamily: fonte(el) },
    animationDuration: 400,
    legend: { type: 'scroll', top: 0, textStyle: { color: TEMA.texto }, pageTextStyle: { color: TEMA.texto } },
    grid: { left: 52, right: 24, top: 48, bottom: 56 },
    ...opcao,
    toolbox: {
      right: 4,
      top: 0,
      iconStyle: { borderColor: TEMA.fraco },
      ...ferramentas,
      feature: {
        dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom', back: 'Voltar zoom' } },
        restore: { title: 'Restaurar' },
        ...ferramentas?.feature,
        myBaixar: { title: 'Baixar PNG (fundo branco)', icon: ICONE_BAIXAR, onclick: baixar },
      },
    },
    tooltip: {
      ...DICA,
      ...propria,
      textStyle: { color: '#fff', fontSize: 12, fontFamily: fonte(el), ...propria?.textStyle },
      axisPointer: { ...DICA.axisPointer, ...propria?.axisPointer },
    },
  };
}

/** Gráfico ECharts (carregado sob demanda) que acompanha o tamanho do contêiner. */
export function EChart({ opcao, altura = 300, rotulo }: { opcao: EChartsOption | null; altura?: number; rotulo: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const grafico = useRef<ECharts | null>(null);
  const biblioteca = useRef<typeof import('echarts') | null>(null);
  // a opção mais recente: os dados podem chegar antes da biblioteca terminar de carregar
  // (gráfico montado sem opção); sem isto ele ficava em branco
  const ultima = useRef(opcao);
  ultima.current = opcao;
  // o título do PNG é o rótulo do gráfico (o mais recente)
  const titulo = useRef(rotulo);
  titulo.current = rotulo;
  const baixar = useCallback(() => {
    if (biblioteca.current && grafico.current && ref.current) {
      baixarEmBranco(biblioteca.current, grafico.current, ref.current, titulo.current).catch((e) => console.error('baixar gráfico', e));
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    let observador: ResizeObserver | undefined;
    import('echarts').then((ec) => {
      if (!vivo || !ref.current) return;
      biblioteca.current = ec;
      grafico.current = ec.init(ref.current, null, { renderer: 'canvas' });
      if (ultima.current) grafico.current.setOption(base(ref.current, ultima.current, baixar), true);
      observador = new ResizeObserver(() => grafico.current?.resize());
      observador.observe(ref.current);
    });
    return () => {
      vivo = false;
      observador?.disconnect();
      grafico.current?.dispose();
      grafico.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a opção nova entra pelo efeito abaixo
  }, []);

  useEffect(() => {
    if (grafico.current && opcao) grafico.current.setOption(base(ref.current, opcao, baixar), true);
  }, [opcao, baixar]);

  return <div ref={ref} className="pi-grafico" style={{ height: altura }} role="img" aria-label={rotulo} />;
}
