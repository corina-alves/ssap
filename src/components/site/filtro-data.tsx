'use client';

import type { ReactNode } from 'react';

/**
 * Campo "Data de referência" no padrão do PHP (.sssp-filter-grid): ao mudar a
 * data o formulário é enviado sozinho; sem JavaScript, o botão envia.
 * `children`: status que chega depois (um <Suspense> com a data dos dados),
 * para o filtro aparecer sem esperar a fonte.
 */
export function FiltroData({ data, max, status, children }: { data: string; max: string; status?: string; children?: ReactNode }) {
  return (
    <form className="sssp-filter-grid" method="get">
      <div className="sssp-field">
        <label htmlFor="inputData">Data de referência</label>
        <input
          type="date"
          id="inputData"
          name="data"
          defaultValue={data}
          min="2010-01-01"
          max={max}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
      </div>
      <noscript>
        <button type="submit" className="btn btn-primary">
          Atualizar
        </button>
      </noscript>
      {status && <div className="sssp-status is-ok">{status}</div>}
      {children}
    </form>
  );
}
