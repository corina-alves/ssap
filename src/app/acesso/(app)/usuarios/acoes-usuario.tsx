'use client';

import { useActionState } from 'react';
import {
  desbloquearUsuario,
  excluirUsuario,
  gerarLinkSenha,
  type EstadoUsuario,
} from './actions';
import { Mensagens } from './form-usuario';

const vazio: EstadoUsuario = { erros: [], versao: 0 };

/** Ações pontuais sobre um usuário já cadastrado. */
export function AcoesUsuario({
  id,
  bloqueadoAte,
  podeExcluir,
}: {
  id: number;
  bloqueadoAte: string | null;
  podeExcluir: boolean;
}) {
  const [eLink, aLink, pLink] = useActionState(gerarLinkSenha, vazio);
  const [eDesb, aDesb, pDesb] = useActionState(desbloquearUsuario, vazio);
  const [eExc, aExc, pExc] = useActionState(excluirUsuario, vazio);
  const estado = [eLink, eDesb, eExc].reduce((a, b) => (b.versao > a.versao ? b : a));

  const confirmar = (msg: string) => (e: React.FormEvent) => {
    if (!window.confirm(msg)) e.preventDefault();
  };

  return (
    <section className="cartao">
      <h2>Outras ações</h2>
      <Mensagens estado={estado} />
      <div className="linha">
        <form action={aLink} onSubmit={confirmar('Gerar um novo link de redefinição de senha? Links anteriores deixam de valer.')}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="botao botao-secundario" disabled={pLink}>
            Gerar link de redefinição de senha
          </button>
        </form>
        {bloqueadoAte && (
          <form action={aDesb}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="botao botao-secundario" disabled={pDesb}>
              Remover bloqueio (até {bloqueadoAte})
            </button>
          </form>
        )}
        {podeExcluir && (
          <form
            action={aExc}
            onSubmit={confirmar('Excluir este usuário? Ele perde o acesso imediatamente. O histórico é preservado.')}
            className="empurra"
          >
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="botao botao-perigo" disabled={pExc}>
              Excluir usuário
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
