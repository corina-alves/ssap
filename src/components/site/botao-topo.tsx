'use client';

import { useEffect, useState } from 'react';

/**
 * Botão "voltar ao topo" (mesmo comportamento do sssp-core.js do PHP): aparece
 * depois de rolar a página. `classe`: o estilo do site ou o da área restrita.
 */
export function BotaoTopo({ classe = 'sssp-topo' }: { classe?: string }) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const aoRolar = () => setVisivel(window.scrollY > 400);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);
  return (
    <button
      type="button"
      className={`${classe}${visivel ? ' is-visible' : ''}`}
      aria-label="Voltar ao topo"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <i className="bi bi-arrow-up" aria-hidden />
    </button>
  );
}
