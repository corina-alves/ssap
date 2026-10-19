'use client';

import { useEffect } from 'react';
import { PaginaAviso } from '@/components/pagina-aviso';

/** Falha inesperada numa tela da área de acesso: a moldura (menu lateral) continua na tela. */
export default function ErroAcesso({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <PaginaAviso codigo="Ops" titulo="Não foi possível abrir esta tela" texto="Ocorreu uma falha temporária. Tente de novo; se continuar, informe o código abaixo ao suporte." referencia={error.digest}>
      <button type="button" className="pagina-aviso__primario" onClick={() => retry()}>
        Tentar de novo
      </button>
    </PaginaAviso>
  );
}
