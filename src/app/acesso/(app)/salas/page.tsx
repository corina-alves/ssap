import type { Metadata } from 'next';
import Link from 'next/link';
import { listarSalas } from '@/lib/admin/salas';
import { exigirPermissao } from '@/lib/auth/acl';

export const metadata: Metadata = { title: 'Salas' };

export default async function PaginaSalas() {
  await exigirPermissao('gerenciar_salas');
  const salas = await listarSalas();

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Salas de Situação</h1>
          <p className="suave">Salas, módulos habilitados em cada uma e tipos de boletim.</p>
        </div>
        <Link href="/acesso/salas/nova" className="botao">
          Nova sala
        </Link>
      </div>
      <section className="cartao">
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Sala</th>
                <th>Módulos</th>
                <th>Usuários</th>
                <th>Tipos de boletim</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {salas.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.cor && <span className="amostra" style={{ background: s.cor }} aria-hidden />} <strong>{s.nome}</strong>
                    <br />
                    <small className="suave mono">{s.slug}</small>
                  </td>
                  <td>
                    <small>{s.modulos ?? '—'}</small>
                  </td>
                  <td>{s.total_usuarios}</td>
                  <td>
                    <Link href={`/acesso/tipos-boletim?sala=${s.id}`}>{s.total_tipos}</Link>
                  </td>
                  <td>
                    <span className={`etiqueta ${s.status === 'ativa' ? 'status-ativo' : 'status-inativo'}`}>
                      {s.status === 'ativa' ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td>
                    <Link href={`/acesso/salas/${s.id}`}>Editar</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
