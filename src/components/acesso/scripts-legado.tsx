'use client';

import { useEffect } from 'react';

/**
 * Carrega, em ordem, scripts originais do PHP (public/acesso/...) depois que a
 * página está montada. Eles procuram os elementos por atributos data-*, então
 * precisam rodar de novo a cada visita — por isso são inseridos aqui, e não
 * com <script> no HTML (que a navegação interna do Next não reexecuta).
 */
export function ScriptsLegado({ scripts }: { scripts: string[] }) {
  const chave = scripts.join('|');
  useEffect(() => {
    let cancelado = false;
    const inseridos: HTMLScriptElement[] = [];
    (async () => {
      for (const src of chave.split('|')) {
        if (cancelado) return;
        await new Promise<void>((ok) => {
          const s = document.createElement('script');
          s.src = src;
          s.onload = s.onerror = () => ok();
          document.body.appendChild(s);
          inseridos.push(s);
        });
      }
    })();
    return () => {
      cancelado = true;
      inseridos.forEach((s) => s.remove());
    };
  }, [chave]);
  return null;
}
