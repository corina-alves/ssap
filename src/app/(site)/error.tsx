'use client';

import { useEffect } from 'react';
import { PaginaAviso } from '@/components/pagina-aviso';

/**
 * Falha inesperada numa página do site público. O menu e o rodapé continuam;
 * em produção o Next não repassa a mensagem do servidor, só o código (digest)
 * para localizar o erro no log.
 */
export default function ErroSite({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <PaginaAviso codigo="Ops" titulo="Não foi possível mostrar esta página" texto="Ocorreu uma falha temporária. Tente de novo em instantes." referencia={error.digest}>
      <button type="button" className="pagina-aviso__primario" onClick={() => retry()}>
        Tentar de novo
      </button>
    </PaginaAviso>
  );
}
