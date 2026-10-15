import type { Metadata } from 'next';
import { ADMIN, listarPerfis, matriz, permissoesPorModulo, ROTULO_MODULO } from '@/lib/admin/perfis';
import { exigirPermissao } from '@/lib/auth/acl';
import { ExcluirPerfil, MatrizPerfis, NovoPerfil } from './componentes';

export const metadata: Metadata = { title: 'Perfis e permissões' };

export default async function PaginaPerfis() {
  await exigirPermissao('gerenciar_permissoes');
  const [perfis, grupos, m] = await Promise.all([listarPerfis(), permissoesPorModulo(), matriz()]);

  return (
    <>
      <h1>Perfis e permissões</h1>
      <p className="suave">
        Perfis globais valem em todas as salas; perfis por sala são atribuídos a cada usuário em cada sala.
      </p>

      <MatrizPerfis perfis={perfis} grupos={grupos} rotulos={ROTULO_MODULO} matriz={m} admin={ADMIN} />

      <section className="cartao">
        <h2>Perfis</h2>
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Perfil</th>
                <th>Escopo</th>
                <th>Vínculos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {perfis.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.nome}</strong> {p.sistema && <span className="etiqueta">de fábrica</span>}
                    <br />
                    <small className="suave">{p.descricao}</small>
                  </td>
                  <td>{p.escopo === 'global' ? 'Global' : 'Por sala'}</td>
                  <td>{p.em_uso}</td>
                  <td>{!p.sistema && <ExcluirPerfil id={p.id} nome={p.nome} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <NovoPerfil />
    </>
  );
}
