import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
// Mesmas folhas de estilo e mesma ordem do site PHP (components/header.php + public_layout.php)
import '@/styles/legado/system-v2.css';
import '@/styles/legado/sssp-system.css';
import '@/styles/legado/header.css';
import '@/styles/legado/filtros.css';
import '@/styles/legado/paginas_publicas.css';
import '@/styles/legado/cards_padrao.css';
import '@/styles/site.css';
import { Cabecalho } from '@/components/site/cabecalho';
import { Rodape } from '@/components/site/layout';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-inter' });

/** Moldura do site público — mesmo layout do site PHP (menu, rodapé, botão topo). */
export default function LayoutSite({ children }: { children: ReactNode }) {
  return (
    <div className={`public-page ${inter.variable}`}>
      <Cabecalho />
      {children}
      <Rodape />
    </div>
  );
}
