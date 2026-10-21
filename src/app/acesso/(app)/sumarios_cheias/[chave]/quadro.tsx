'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const ARQUIVO = /\/sumario_executivo_([a-z_]+)\.html$/;

/**
 * Quadro com o HTML original do sumário (mesma origem): a altura acompanha o
 * conteúdo, para rolar só a página da área; se o seletor "Boletim" do próprio
 * sumário abrir o outro, a página da área troca junto.
 */
export function QuadroSumario({ src, titulo, sala }: { src: string; titulo: string; sala: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const router = useRouter();

  useEffect(() => {
    const quadro = ref.current;
    if (!quadro) return;
    let observador: ResizeObserver | undefined;

    const aoCarregar = () => {
      observador?.disconnect();
      const janela = quadro.contentWindow;
      const doc = quadro.contentDocument;
      if (!janela || !doc?.body) return;
      const outro = ARQUIVO.exec(janela.location.pathname)?.[1];
      if (outro && !src.endsWith(`sumario_executivo_${outro}.html`)) {
        router.replace(`/acesso/sumarios_cheias/${outro}?s=${encodeURIComponent(sala)}`);
        return;
      }
      const ajustar = () => {
        quadro.style.height = `${doc.documentElement.scrollHeight}px`;
      };
      observador = new ResizeObserver(ajustar);
      observador.observe(doc.body);
      ajustar();
    };

    quadro.addEventListener('load', aoCarregar);
    if (quadro.contentDocument?.readyState === 'complete' && quadro.contentWindow?.location.href !== 'about:blank') aoCarregar();
    return () => {
      quadro.removeEventListener('load', aoCarregar);
      observador?.disconnect();
    };
  }, [src, sala, router]);

  return <iframe ref={ref} src={src} title={titulo} className="w-100 border rounded bg-white d-block" style={{ height: '80vh' }} />;
}
