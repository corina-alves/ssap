import type { Metadata } from 'next';
import Link from 'next/link';
import { inteiro, Paginacao, texto } from '@/components/paginacao';
import { listar, ROTULO_STATUS, salas as listarSalas, STATUS, sugestoesBusca } from '@/lib/admin/usuarios';
import { exigirPermissao } from '@/lib/auth/acl';
import { dataHora } from '@/lib/formato';
import { BuscaAutocompletar } from '@/components/busca-autocompletar';

export const metadata: Metadata = { title: 'Usuários' };

const POR_PAGINA = 20;

export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPermissao('gerenciar_usuarios');
  const sp = await searchParams;
  const filtros = { busca: texto(sp.busca), status: texto(sp.status, 20), sala: inteiro(sp.sala) };
  const pagina = Math.max(1, inteiro(sp.p));

  const [{ itens, total }, salas] = await Promise.all([
    listar({ busca: filtros.busca, status: filtros.status, salaId: filtros.sala }, pagina, POR_PAGINA),
    listarSalas(),
  ]);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Usuários</h1>
          <p className="suave">Cadastro de usuários, perfis e acesso às Salas de Situação.</p>
        </div>
        <Link href="/acesso/usuarios/novo" className="botao">
          Novo usuário
        </Link>
      </div>
      {sp.excluido && <div className="alerta alerta-ok">Usuário excluído.</div>}

      <section className="cartao">
        <form className="filtros" method="get">
          <BuscaAutocompletar sugestoes={await sugestoesBusca()} name="busca" defaultValue={filtros.busca} placeholder="Buscar por nome, e-mail ou login" rotulo="Buscar" />
          <select name="sala" defaultValue={filtros.sala || ''} aria-label="Sala">
            <option value="">Todas as salas</option>
            {salas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={filtros.status} aria-label="Situação">
            <option value="">Todas as situações</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="botao botao-secundario">
            Filtrar
          </button>
        </form>

        {itens.length === 0 ? (
          <p className="suave">Nenhum usuário encontrado.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Login</th>
                  <th>Acesso</th>
                  <th>Situação</th>
                  <th>Último acesso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {itens.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.nome}</strong>
                      <br />
                      <small className="suave">{u.email}</small>
                    </td>
                    <td>{u.login}</td>
                    <td>
                      {u.perfis_globais && <span className="etiqueta etiqueta-primaria">{u.perfis_globais}</span>}
                      {u.salas ? (
                        <small> {u.salas}</small>
                      ) : (
                        !u.perfis_globais && <small className="texto-erro">Sem acesso a salas</small>
                      )}
                    </td>
                    <td>
                      <span className={`etiqueta status-${u.status}`}>{ROTULO_STATUS[u.status]}</span>
                      {u.bloqueado_temp && <span className="etiqueta status-bloqueado">Bloqueio temp.</span>}
                    </td>
                    <td>
                      <small>{dataHora(u.ultimo_acesso)}</small>
                    </td>
                    <td>
                      <Link href={`/acesso/usuarios/${u.id}`}>Editar</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacao
          total={total}
          pagina={pagina}
          porPagina={POR_PAGINA}
          base="/acesso/usuarios"
          params={{ busca: filtros.busca, status: filtros.status, sala: filtros.sala ? String(filtros.sala) : undefined }}
        />
      </section>
    </>
  );
}
