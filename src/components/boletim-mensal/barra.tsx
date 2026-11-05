'use client';

import { useActionState } from 'react';
import { salvarTextosAcao } from '@/app/acesso/(app)/boletim_mensal/actions';
import { ESTADO_INICIAL } from '@/lib/admin/estado';
import { FORM_TEXTOS } from './editaveis';

/** Formulário único dos textos do boletim: as caixas de texto dos slides apontam para ele (atributo form). */
export function SalvarTextos({ salaId, mes }: { salaId: number; mes: string }) {
  const [estado, salvar, salvando] = useActionState(salvarTextosAcao, ESTADO_INICIAL);
  return (
    <form id={FORM_TEXTOS} action={salvar} className="d-inline-flex align-items-center gap-2">
      <input type="hidden" name="sala_id" value={salaId} />
      <input type="hidden" name="mes" value={mes} />
      <button type="submit" className="btn btn-sm btn-primary" disabled={salvando}>
        <i className="bi bi-save" /> {salvando ? 'Salvando…' : 'Salvar textos'}
      </button>
      {estado.mensagem && <span className="small text-success">{estado.mensagem}</span>}
      {estado.erros.length > 0 && <span className="small text-danger">{estado.erros.join(' ')}</span>}
    </form>
  );
}

export function Imprimir() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      <i className="bi bi-printer" /> Imprimir / Salvar PDF
    </button>
  );
}
