import type { ReactNode } from 'react';
import '@/styles/legado/pagina-previsao.css';
import { Hero } from '@/components/site/layout';

/**
 * Título da página fora do page.tsx: não depende de API, vem no pré-carregamento
 * do link e continua na tela quando o município muda.
 */
export default function LayoutPrevisao({ children }: { children: ReactNode }) {
  return (
    <>
      <Hero
        kicker="Meteorologia"
        titulo="Previsão para os Municípios de São Paulo"
        texto="São Paulo é a referência principal. Pesquise qualquer município do Estado para consultar chuva, probabilidade de precipitação, temperatura, umidade do ar e vento nos próximos 7 dias."
        icone="bi-cloud-sun"
      />
      {children}
    </>
  );
}
