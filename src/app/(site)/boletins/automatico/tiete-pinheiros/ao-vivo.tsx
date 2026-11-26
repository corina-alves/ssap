'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

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

/**
 * Diagrama unifilar ao vivo do SIBH, ajustado à largura do quadro. O botão "Tela
 * cheia" (fora da impressão) mostra o diagrama na tela inteira, para
 * apresentação: o maior tamanho que cabe na tela, centralizado; Esc volta.
 */
export function DiagramaUnifilar({ src, titulo = 'Diagrama unifilar Sistema Tietê-Pinheiros' }: { src: string; titulo?: string }) {
  const moldura = useRef<HTMLDivElement>(null);
  const quadro = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [cheia, setCheia] = useState(false);
  const [pode, setPode] = useState(false);
  useEffect(() => {
    const m = moldura.current;
    const q = quadro.current;
    const f = frame.current;
    if (!m || !q || !f) return;
    const altura = ALTURA_DIAGRAMA - RECORTE_TOPO;
    const ajustar = () => {
      const tela = document.fullscreenElement === m;
      // na tela cheia, cabe na largura e na altura (menos a linha do botão); fora dela, só a largura
      const escala = tela ? Math.min(m.clientWidth / LARGURA_DIAGRAMA, (m.clientHeight - 56) / altura) : q.clientWidth / LARGURA_DIAGRAMA;
      f.style.transform = `scale(${escala})`;
      f.style.top = `-${RECORTE_TOPO * escala}px`;
      q.style.width = tela ? `${LARGURA_DIAGRAMA * escala}px` : '';
      q.style.height = `${altura * escala}px`;
    };
    const mudou = () => {
      setCheia(document.fullscreenElement === m);
      ajustar();
    };
    setPode(!!document.fullscreenEnabled);
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(m);
    document.addEventListener('fullscreenchange', mudou);
    return () => {
      obs.disconnect();
      document.removeEventListener('fullscreenchange', mudou);
    };
  }, []);
  const alternar = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else moldura.current?.requestFullscreen().catch(() => {});
  };
  return (
    <div className={`sat-diagrama-moldura${cheia ? ' is-tela-cheia' : ''}`} ref={moldura}>
      {pode && (
        <button type="button" className="sat-tela-cheia" onClick={alternar} aria-pressed={cheia} title={cheia ? 'Voltar ao tamanho normal (Esc)' : 'Mostrar o diagrama na tela inteira (para apresentação)'}>
          <i className={`bi ${cheia ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}`} aria-hidden /> {cheia ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      )}
      <div className="sat-diagrama" ref={quadro}>
        <iframe ref={frame} src={src} title={titulo} loading="lazy" width={LARGURA_DIAGRAMA} height={ALTURA_DIAGRAMA} />
      </div>
    </div>
  );
}
