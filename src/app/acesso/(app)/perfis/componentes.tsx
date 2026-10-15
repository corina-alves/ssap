'use client';

import { useActionState } from 'react';
import { Alertas } from '@/components/alertas';
import type { EstadoAdmin } from '@/lib/admin/estado';
import type { DadosPerfil, PerfilLista, Permissao } from '@/lib/admin/perfis';
import { criarPerfilAcao, excluirPerfilAcao, salvarMatrizAcao } from './actions';

const inicial = { erros: [], versao: 0 };

/** Matriz permissão × perfil. A coluna do Administrador do Sistema é fixa (todas). */
export function MatrizPerfis({
  perfis,
  grupos,
  rotulos,
  matriz,
  admin,
}: {
  perfis: PerfilLista[];
  grupos: [string, Permissao[]][];
  rotulos: Record<string, string>;
  matriz: Record<number, number[]>;
  admin: string;
}) {
  const [estado, acao, pendente] = useActionState(salvarMatrizAcao, inicial as EstadoAdmin);
  return (
    <section className="cartao">
      <h2>Permissões por perfil</h2>
      <Alertas erros={estado.erros} mensagem={estado.mensagem} />
      <form key={estado.versao} action={acao}>
        <div className="rolagem">
          <table className="tabela matriz">
            <thead>
              <tr>
                <th>Permissão</th>
                {perfis.map((p) => (
                  <th key={p.id} title={p.descricao ?? undefined}>
                    {p.nome}
                    <br />
                    <small className="suave">{p.escopo === 'global' ? 'global' : 'por sala'}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map(([modulo, permissoes]) => [
                <tr key={modulo} className="grupo">
                  <th colSpan={perfis.length + 1}>{rotulos[modulo] ?? modulo}</th>
                </tr>,
                ...permissoes.map((x) => (
                  <tr key={x.id}>
                    <td>
                      {x.descricao ?? x.slug}
                      <br />
                      <small className="suave mono">{x.slug}</small>
                    </td>
                    {perfis.map((p) =>
                      p.slug === admin ? (
                        <td key={p.id} className="centro-celula">
                          <input type="checkbox" checked disabled aria-label={`${p.nome}: ${x.slug} (sempre)`} />
                        </td>
                      ) : (
                        <td key={p.id} className="centro-celula">
                          <input
                            type="checkbox"
                            name={`p_${p.id}`}
                            value={x.id}
                            defaultChecked={matriz[p.id]?.includes(x.id)}
                            aria-label={`${p.nome}: ${x.slug}`}
                          />
                        </td>
                      ),
                    )}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <p className="suave">
          O Administrador do Sistema tem sempre todas as permissões, para ninguém trancar o sistema por engano.
        </p>
        <div className="acoes">
          <button type="submit" className="botao" disabled={pendente}>
            {pendente ? 'Salvando…' : 'Salvar permissões'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function NovoPerfil() {
  const [estado, acao, pendente] = useActionState(criarPerfilAcao, inicial as EstadoAdmin<DadosPerfil>);
  const v = estado.valores ?? { slug: '', nome: '', descricao: '', escopo: 'sala' };
  return (
    <section className="cartao">
      <h2>Novo perfil</h2>
      <Alertas erros={estado.erros} mensagem={estado.mensagem} />
      <form key={estado.versao} action={acao} className="formulario">
        <div className="colunas">
          <label>
            Nome
            <input name="nome" defaultValue={v.nome} maxLength={80} required />
          </label>
          <label>
            Identificador
            <input name="slug" defaultValue={v.slug} maxLength={40} pattern="[a-z][a-z0-9_]{1,39}" required />
            <small className="suave">Minúsculas, números e sublinhado (ex.: tecnico_campo).</small>
          </label>
          <label>
            Escopo
            <select name="escopo" defaultValue={v.escopo}>
              <option value="sala">Por sala — atribuído em cada sala</option>
              <option value="global">Global — vale em todas as salas</option>
            </select>
          </label>
        </div>
        <label>
          Descrição
          <input name="descricao" defaultValue={v.descricao} maxLength={255} />
        </label>
        <div className="acoes">
          <button type="submit" className="botao" disabled={pendente}>
            Criar perfil
          </button>
        </div>
      </form>
    </section>
  );
}

export function ExcluirPerfil({ id, nome }: { id: number; nome: string }) {
  const [estado, acao, pendente] = useActionState(excluirPerfilAcao, inicial as EstadoAdmin);
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!window.confirm(`Excluir o perfil "${nome}"?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="link" disabled={pendente}>
        Excluir
      </button>
      {estado.erros.length > 0 && <small className="texto-erro"> {estado.erros[0]}</small>}
    </form>
  );
}
