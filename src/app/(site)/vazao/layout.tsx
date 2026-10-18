import type { ReactNode } from 'react';
import '@/styles/legado/pagina-vazao.css';
import { Hero } from '@/components/site/layout';

/**
 * Título da página fora do page.tsx: não depende de API, vem no pré-carregamento
 * do link e continua na tela quando a data muda (só a página é renderizada de novo).
 */
export default function LayoutVazao({ children }: { children: ReactNode }) {
  return (
    <>
      <Hero
        kicker="Monitoramento Fluviométrico"
        titulo="Vazão Natural dos Sistemas Produtores"
        texto="Acompanhamento da vazão natural dos sistemas produtores da Região Metropolitana de São Paulo: vazão do dia, média dos últimos 7 dias, vazão média mensal, anos de referência, média histórica e percentual da MLT."
        icone="bi-activity"
      />
      {children}
    </>
  );
}
