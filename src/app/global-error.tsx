'use client';

import './globals.css';
import { montserrat } from '@/components/fonte';
import { PaginaAviso } from '@/components/pagina-aviso';

/** Falha no próprio layout raiz: substitui o documento inteiro (precisa de <html> e <body>). */
export default function ErroGlobal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR" className={montserrat.variable}>
      <body>
        <title>Erro · Sala de Situação Alfredo Pisani - SP-Águas</title>
        <PaginaAviso codigo="Ops" titulo="O site está com uma falha temporária" texto="Tente de novo em instantes." referencia={error.digest}>
          <button type="button" className="pagina-aviso__primario" onClick={() => retry()}>
            Tentar de novo
          </button>
        </PaginaAviso>
      </body>
    </html>
  );
}
