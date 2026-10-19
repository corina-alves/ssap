import type { ReactNode } from 'react';
import '@/styles/legado/pagina-previsao-reservatorios.css';
import { Hero } from '@/components/site/layout';

/** Título da página fora do page.tsx: não depende de API e vem no pré-carregamento do link. */
export default function LayoutPrevisaoReservatorios({ children }: { children: ReactNode }) {
  return (
    <>
      <Hero
        kicker="Meteorologia"
        titulo="Previsão para os Sistemas Produtores"
        texto="Chuva prevista pela Open-Meteo para os sete sistemas produtores da Região Metropolitana de São Paulo, com horizonte de até sete dias. Somente dados reais da API."
        icone="bi-cloud-rain-heavy"
      />
      {children}
    </>
  );
}
