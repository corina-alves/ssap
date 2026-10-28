'use client';

import type { EChartsOption, ECharts, TooltipComponentOption } from 'echarts';
import { useEffect, useRef } from 'react';

/** Cores e fonte do painel (fundo azul-marinho). */
export const TEMA = {
  texto: '#d6e4f0',
  fraco: '#8fa6bd',
  grade: 'rgba(255,255,255,.08)',
  fundoExportacao: '#0b1f3a',
};

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

/** Opções comuns: dica com todos os valores do dia, legenda clicável, zoom no tempo e exportação em PNG. */
function base(el: HTMLElement | null, opcao: EChartsOption): EChartsOption {
  // a dica de cada gráfico (formato dos valores) entra por cima da comum, sem apagar as cores
  const propria = opcao.tooltip as TooltipComponentOption | undefined;
  return {
    backgroundColor: 'transparent',
    textStyle: { color: TEMA.texto, fontFamily: fonte(el) },
    animationDuration: 400,
    legend: { type: 'scroll', top: 0, textStyle: { color: TEMA.texto }, pageTextStyle: { color: TEMA.texto } },
    toolbox: {
      right: 4,
      top: 0,
      iconStyle: { borderColor: TEMA.fraco },
      feature: {
        dataZoom: { yAxisIndex: 'none', title: { zoom: 'Zoom', back: 'Voltar zoom' } },
        restore: { title: 'Restaurar' },
        saveAsImage: { title: 'Baixar PNG', backgroundColor: TEMA.fundoExportacao, pixelRatio: 2 },
      },
    },
    grid: { left: 52, right: 24, top: 48, bottom: 56 },
    ...opcao,
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

  useEffect(() => {
    let vivo = true;
    let observador: ResizeObserver | undefined;
    import('echarts').then((ec) => {
      if (!vivo || !ref.current) return;
      grafico.current = ec.init(ref.current, null, { renderer: 'canvas' });
      if (opcao) grafico.current.setOption(base(ref.current, opcao), true);
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
    if (grafico.current && opcao) grafico.current.setOption(base(ref.current, opcao), true);
  }, [opcao]);

  return <div ref={ref} className="pi-grafico" style={{ height: altura }} role="img" aria-label={rotulo} />;
}
