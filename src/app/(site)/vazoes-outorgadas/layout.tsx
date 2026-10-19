import type { ReactNode } from 'react';
import '@/styles/legado/pagina-vazoes-outorgadas.css';
import { Hero } from '@/components/site/layout';

/**
 * Título da página fora do page.tsx: não depende de API, vem no pré-carregamento
 * do link e continua na tela quando a data muda (só a página é renderizada de novo).
 */
export default function LayoutVazoesOutorgadas({ children }: { children: ReactNode }) {
  return (
    <>
      <Hero
        kicker="Outorgas e usos"
        titulo="Vazões Outorgadas"
        texto="Acompanhamento das vazões captadas em relação aos limites outorgados dos Sistemas Produtores da Região Metropolitana de São Paulo."
        icone="bi-droplet-half"
      />
      {children}
    </>
  );
}
