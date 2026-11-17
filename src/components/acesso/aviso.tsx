'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Aviso de sucesso de uma ação (salvo, excluído, enviado...): aparece no canto
 * superior direito e some sozinho. Parado com o mouse ou o foco em cima, não
 * some; o × fecha na hora. Erros continuam no corpo da página (Mensagem).
 */
export function AvisoSucesso({ children, segundos = 8 }: { children: ReactNode; segundos?: number }) {
  const [aberto, setAberto] = useState(true);
  const [parado, setParado] = useState(false);

  useEffect(() => {
    if (!aberto || parado) return;
    const relogio = setTimeout(() => setAberto(false), segundos * 1000);
    return () => clearTimeout(relogio);
  }, [aberto, parado, segundos]);

  if (!aberto) return null;
  return (
    <div
      className="acesso-aviso alert alert-success d-flex gap-2 align-items-start"
      role="status"
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
      onFocus={() => setParado(true)}
      onBlur={() => setParado(false)}
    >
      <i className="bi bi-check-circle flex-shrink-0" aria-hidden="true" />
      <div className="flex-grow-1">{children}</div>
      <button type="button" className="btn-close" aria-label="Fechar aviso" onClick={() => setAberto(false)} />
    </div>
  );
}
