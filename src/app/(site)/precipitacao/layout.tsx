import type { ReactNode } from 'react';
import '@/styles/legado/pagina-precipitacao.css';
import { Hero } from '@/components/site/layout';

/**
 * Título da página fora do page.tsx: não depende de API, vem no pré-carregamento
 * do link e continua na tela quando a data muda (só a página é renderizada de novo).
 */
export default function LayoutPrecipitacao({ children }: { children: ReactNode }) {
  return (
    <>
      <Hero
        kicker="Monitoramento Pluviométrico"
        titulo="Precipitação dos Sistemas Produtores"
        texto="Acompanhamento da chuva observada nos sistemas produtores da Região Metropolitana de São Paulo: chuva do dia, acumulado em 7 dias, acumulado mensal, comparação com anos de referência e média histórica."
        icone="bi-cloud-rain"
      />
      {children}
    </>
  );
}
