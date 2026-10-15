import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { inteiro, Paginacao, texto } from '@/components/paginacao';
import { listarAuditoria, opcoesFiltro, sugestoesUsuarios } from '@/lib/admin/auditoria';
import { salas as listarSalas } from '@/lib/admin/usuarios';
import { acl } from '@/lib/auth/acl';
import { dataHora } from '@/lib/formato';
import { BuscaAutocompletar } from '@/components/busca-autocompletar';

export const metadata: Metadata = { title: 'Auditoria' };

const POR_PAGINA = 30;

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Permissão global: vê tudo. Só em salas (gestor): só os registros dessas salas.
  const a = await acl();
  const escopo = a.globais.has('visualizar_logs') ? null : a.salasCom('visualizar_logs');
  if (escopo !== null && escopo.length === 0) redirect('/acesso/sem-acesso');

  const sp = await searchParams;
  const f = {
    usuario: texto(sp.usuario),
    sala: inteiro(sp.sala),
    modulo: texto(sp.modulo, 40),
    acao: texto(sp.acao, 40),
    de: texto(sp.de, 10),
    ate: texto(sp.ate, 10),
  };
  if (escopo !== null && f.sala && !escopo.includes(f.sala)) f.sala = 0;
  const pagina = Math.max(1, inteiro(sp.p));

  const [{ itens, total }, opcoes, todasSalas] = await Promise.all([
    listarAuditoria(escopo, { ...f, salaId: f.sala }, pagina, POR_PAGINA),
    opcoesFiltro(),
    listarSalas(),
  ]);
  const salas = escopo === null ? todasSalas : todasSalas.filter((s) => escopo.includes(s.id));

  return (
    <>
      <h1>Auditoria</h1>
      <p className="suave">
        {escopo === null ? 'Todas as ações registradas no sistema.' : 'Ações registradas nas salas que você gerencia.'}
      </p>
      <section className="cartao">
        <form className="filtros" method="get">
          <BuscaAutocompletar sugestoes={await sugestoesUsuarios(escopo)} name="usuario" defaultValue={f.usuario} placeholder="Usuário" rotulo="Usuário" />
          <select name="sala" defaultValue={f.sala || ''} aria-label="Sala">
            <option value="">Todas as salas</option>
            {salas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <select name="modulo" defaultValue={f.modulo} aria-label="Módulo">
            <option value="">Todos os módulos</option>
            {opcoes.modulos.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select name="acao" defaultValue={f.acao} aria-label="Ação">
            <option value="">Todas as ações</option>
            {opcoes.acoes.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <label className="inline">
            De <input type="date" name="de" defaultValue={f.de} />
          </label>
          <label className="inline">
            Até <input type="date" name="ate" defaultValue={f.ate} />
          </label>
          <button type="submit" className="botao botao-secundario">
            Filtrar
          </button>
        </form>

        {itens.length === 0 ? (
          <p className="suave">Nenhum registro encontrado.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Usuário</th>
                  <th>Sala</th>
                  <th>Ação</th>
                  <th>Descrição</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <small>{dataHora(l.criado_em)}</small>
                    </td>
                    <td>{l.usuario_nome ?? <span className="suave">—</span>}</td>
                    <td>
                      <small>{l.sala_nome ?? '—'}</small>
                    </td>
                    <td>
                      <code>
                        {l.modulo}.{l.acao}
                      </code>
                    </td>
                    <td>{l.descricao}</td>
                    <td>
                      <small className="mono">{l.ip ?? '—'}</small>
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
          base="/acesso/auditoria"
          params={{ ...f, sala: f.sala ? String(f.sala) : undefined }}
        />
      </section>
    </>
  );
}
