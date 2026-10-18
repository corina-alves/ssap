import type { ReactNode } from 'react';
import '@/styles/legado/pagina-curva-contingencia.css';
import { Hero } from '@/components/site/layout';

/**
 * Título da página fora do page.tsx: não depende de API, vem no pré-carregamento
 * do link e continua na tela quando o período muda (só a página é renderizada de novo).
 */
export default function LayoutCurvaContingencia({ children }: { children: ReactNode }) {
  return (
    <>
      <Hero
        kicker="Planejamento e contingência"
        titulo="Curva de Contingência"
        texto="Acompanhamento da projeção de volume útil do Sistema Integrado Metropolitano (SIM) e do Sistema Cantareira, comparando os valores observados com as curvas de referência."
        icone="bi-graph-up-arrow"
      />
      {children}
    </>
  );
}
