import type { ReactNode } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import '@/styles/painel.css';
import { montserrat } from '@/components/fonte';

/** Painel de parede: tela cheia, sem o menu nem o rodapé do site. */
export default function LayoutPainel({ children }: { children: ReactNode }) {
  return <div className={montserrat.variable}>{children}</div>;
}
