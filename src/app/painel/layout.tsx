import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import '@/styles/painel.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '600', '700', '800', '900'], variable: '--font-inter' });

/** Painel de parede: tela cheia, sem o menu nem o rodapé do site. */
export default function LayoutPainel({ children }: { children: ReactNode }) {
  return <div className={inter.variable}>{children}</div>;
}
