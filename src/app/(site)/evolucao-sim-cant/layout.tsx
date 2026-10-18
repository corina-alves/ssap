import type { ReactNode } from 'react';
import { Hero } from '@/components/site/layout';

/**
 * Título da página fora do page.tsx: não depende de API, vem no pré-carregamento
 * do link e continua na tela quando o filtro muda (só a página é renderizada de novo).
 */
export default function LayoutEvolucaoHistorica({ children }: { children: ReactNode }) {
  return (
    <>
      <Hero
        kicker="Série histórica"
        titulo="Evolução Histórica do Volume Armazenado"
        texto="Compare, na mesma data de referência de cada ano, os volumes do Sistema Cantareira e do Sistema Integrado Metropolitano (SIM)."
        icone="bi-clock-history"
      />
      {children}
    </>
  );
}
