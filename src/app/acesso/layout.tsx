import type { Metadata } from 'next';
import type { ReactNode } from 'react';
// Mesmas folhas de estilo e mesma ordem da área /acesso do PHP (templates/app_inicio.php).
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import '@/styles/acesso/acesso.css';
import '@/styles/acesso/ajustes.css';
import { montserrat } from '@/components/fonte';

export const metadata: Metadata = {
  title: { default: 'Painel', template: '%s · Salas de Situação SP-Águas' },
  robots: { index: false, follow: false },
};

export default function LayoutAcesso({ children }: { children: ReactNode }) {
  return <div className={montserrat.variable}>{children}</div>;
}
