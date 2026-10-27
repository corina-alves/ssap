'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Linha de tabela que abre `href` ao ser clicada (o nome na primeira célula é
 * também um link, para o teclado e para abrir em outra aba). Sem rolar a
 * página: o gráfico fica logo abaixo da tabela.
 */
export function LinhaClicavel({ href, ativa, children }: { href: string; ativa: boolean; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className={`acp-linha-clicavel${ativa ? ' acp-linha-clicavel--ativa' : ''}`}
      aria-selected={ativa}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        router.push(href, { scroll: false });
      }}
    >
      {children}
    </tr>
  );
}
