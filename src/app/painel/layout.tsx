import { Montserrat } from 'next/font/google';
import type { ReactNode } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import '@/styles/painel.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-montserrat' });

/** Painel de parede: tela cheia, sem o menu nem o rodapé do site. */
export default function LayoutPainel({ children }: { children: ReactNode }) {
  return <div className={montserrat.variable}>{children}</div>;
}
