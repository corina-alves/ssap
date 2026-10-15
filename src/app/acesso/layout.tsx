import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
// Mesmas folhas de estilo e mesma ordem da área /acesso do PHP (templates/app_inicio.php).
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import '@/styles/acesso/acesso.css';
import '@/styles/acesso/ajustes.css';

export const metadata: Metadata = {
  title: { default: 'Painel', template: '%s · Salas de Situação SP-Águas' },
  robots: { index: false, follow: false },
};

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-inter' });

export default function LayoutAcesso({ children }: { children: ReactNode }) {
  // a classe só publica a variável --font-inter para as telas da área
  return <div className={inter.variable}>{children}</div>;
}
