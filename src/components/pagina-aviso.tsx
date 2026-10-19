import Link from 'next/link';
import type { ReactNode } from 'react';

/** Caixa centralizada das páginas de aviso (não encontrado, erro); estilos .pagina-aviso em globals.css. */
export function PaginaAviso({ codigo, titulo, texto, children, referencia }: { codigo: string; titulo: string; texto: string; children?: ReactNode; referencia?: string }) {
  return (
    <div className="pagina-aviso">
      <div className="pagina-aviso__caixa" role="alert">
        <div className="pagina-aviso__codigo">{codigo}</div>
        <h1>{titulo}</h1>
        <p>{texto}</p>
        <div className="pagina-aviso__acoes">
          {children}
          <Link className="pagina-aviso__secundario" href="/">
            Página inicial
          </Link>
        </div>
        {referencia && <small>Código de referência: {referencia}</small>}
      </div>
    </div>
  );
}
