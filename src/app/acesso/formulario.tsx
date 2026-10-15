'use client';

import { useActionState, type ReactNode } from 'react';
import type { EstadoForm } from './actions';

/** Formulário ligado a uma Server Action, com lista de erros e botão pendente. */
export function Formulario({
  acao,
  rotuloBotao,
  icone = 'bi-check2',
  cancelar,
  children,
}: {
  acao: (estado: EstadoForm, form: FormData) => Promise<EstadoForm>;
  rotuloBotao: string;
  icone?: string;
  /** Link "Cancelar" ao lado do botão; sem ele, o botão ocupa a largura toda. */
  cancelar?: ReactNode;
  children: ReactNode;
}) {
  const [estado, formAction, pendente] = useActionState(acao, { erros: [] });
  return (
    <form action={formAction} noValidate>
      {estado.erros.map((e) => (
        <div key={e} className="alert alert-danger d-flex gap-2 align-items-start" role="alert">
          <i className="bi bi-exclamation-octagon flex-shrink-0" />
          <div>{e}</div>
        </div>
      ))}
      {children}
      <div className={cancelar ? 'd-flex gap-2 justify-content-end mt-4' : 'mt-2'}>
        {cancelar}
        <button type="submit" className={`btn btn-primary${cancelar ? '' : ' w-100 py-2'}`} disabled={pendente}>
          <i className={`bi ${icone} me-1`} /> {pendente ? 'Aguarde…' : rotuloBotao}
        </button>
      </div>
    </form>
  );
}
