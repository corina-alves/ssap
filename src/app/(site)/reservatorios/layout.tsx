import type { ReactNode } from 'react';
import '@/styles/legado/pagina-reservatorios.css';
import { Hero } from '@/components/site/layout';

/**
 * Título da página fora do page.tsx: não depende de API, vem no pré-carregamento
 * do link e continua na tela quando a data muda (só a página é renderizada de novo).
 */
export default function LayoutReservatorios({ children }: { children: ReactNode }) {
  return (
    <>
      <Hero
        kicker="Sistemas Produtores"
        titulo="Reservatórios da RMSP"
        texto="Acompanhamento dos principais sistemas produtores da Região Metropolitana de São Paulo: volume útil, precipitação, variação diária, comparação histórica e enquadramento por estágios operacionais."
        icone="bi-water"
      />
      {children}
    </>
  );
}
