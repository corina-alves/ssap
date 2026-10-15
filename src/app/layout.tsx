import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Sala de Situação Alfredo Pisani - SP-Águas', template: '%s · Sala de Situação Alfredo Pisani - SP-Águas' },
  description: 'Monitoramento hidrológico do Estado de São Paulo — SP Águas.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
