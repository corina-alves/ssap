'use client';

import type { ECharts, EChartsOption } from 'echarts';
import { useEffect, useRef } from 'react';

/** Cores do painel de climatologia (fundo claro). */
export const CORES = {
  climatologia: '#7a9cc6',
  observado: '#0b5394',
  seco: '#c0392b',
  chuvoso: '#1f6fb2',
  texto: '#26343d',
  fraco: '#64757f',
  grade: '#e3eaef',
};

const fonte = (el: HTMLElement | null) => (el ? getComputedStyle(el).fontFamily : 'sans-serif');

function base(el: HTMLElement | null, opcao: EChartsOption, arquivo: string): EChartsOption {
  return {
    backgroundColor: '#fff',
    textStyle: { color: CORES.texto, fontFamily: fonte(el) },
    animationDuration: 300,
    legend: { top: 0, textStyle: { color: CORES.texto } },
    toolbox: { right: 4, top: 0, feature: { saveAsImage: { title: 'Baixar PNG', name: arquivo, pixelRatio: 2, backgroundColor: '#fff' } } },
    grid: { left: 56, right: 24, top: 44, bottom: 40, containLabel: false },
    tooltip: { trigger: 'axis', confine: true },
    ...opcao,
  };
}

/** Gráfico ECharts (carregado sob demanda) que acompanha o tamanho do contêiner e exporta PNG. */
export function Grafico({ opcao, altura = 320, rotulo, arquivo }: { opcao: EChartsOption; altura?: number; rotulo: string; arquivo: string }) {
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
      grafico.current.setOption(base(ref.current, atual.current, arquivo), true);
      observador = new ResizeObserver(() => grafico.current?.resize());
      observador.observe(ref.current);
    });
    return () => {
      vivo = false;
      observador?.disconnect();
      grafico.current?.dispose();
      grafico.current = null;
    };
  }, [arquivo]);

  useEffect(() => {
    grafico.current?.setOption(base(ref.current, opcao, arquivo), true);
  }, [opcao, arquivo]);

  return <div ref={ref} className="clima-grafico" style={{ height: altura }} role="img" aria-label={rotulo} />;
}
