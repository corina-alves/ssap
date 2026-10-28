'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

const ATUALIZAR_MS = 5 * 60 * 1000;
const LARGURA_DIAGRAMA = 1700;
const ALTURA_DIAGRAMA = 1048;
// Topo do diagrama do SIBH a esconder (menu do site), na escala original — igual ao sumário tradicional.
const RECORTE_TOPO = 64;

/** Recarrega os dados da página a cada 5 minutos (ou `intervaloMs`), só com a aba visível. */
export function AtualizacaoAutomatica({ intervaloMs = ATUALIZAR_MS }: { intervaloMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, intervaloMs);
    return () => clearInterval(t);
  }, [router, intervaloMs]);
  return null;
}

/** Diagrama unifilar ao vivo do SIBH, ajustado à largura do quadro. */
export function DiagramaUnifilar({ src, titulo = 'Diagrama unifilar Sistema Tietê-Pinheiros' }: { src: string; titulo?: string }) {
  const quadro = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const q = quadro.current;
    const f = frame.current;
    if (!q || !f) return;
    const ajustar = () => {
      const escala = q.clientWidth / LARGURA_DIAGRAMA;
      f.style.transform = `scale(${escala})`;
      f.style.top = `-${RECORTE_TOPO * escala}px`;
      q.style.height = `${(ALTURA_DIAGRAMA - RECORTE_TOPO) * escala}px`;
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(q);
    return () => obs.disconnect();
  }, []);
  return (
    <div className="sat-diagrama" ref={quadro}>
      <iframe ref={frame} src={src} title={titulo} loading="lazy" width={LARGURA_DIAGRAMA} height={ALTURA_DIAGRAMA} />
    </div>
  );
}
