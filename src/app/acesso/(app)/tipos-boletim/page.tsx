import type { Metadata } from 'next';
import Link from 'next/link';
import { inteiro } from '@/components/paginacao';
import { listarSalas } from '@/lib/admin/salas';
import { listarTipos, PERIODICIDADES } from '@/lib/admin/tipos-boletim';
import { exigirPermissao } from '@/lib/auth/acl';

export const metadata: Metadata = { title: 'Tipos de boletim' };

export default async function PaginaTipos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPermissao('gerenciar_salas');
  const salaId = inteiro((await searchParams).sala);
  const [tipos, salas] = await Promise.all([listarTipos(salaId || undefined), listarSalas()]);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Tipos de boletim</h1>
          <p className="suave">Os boletins de cada sala são cadastrados por upload do PDF pronto.</p>
        </div>
        <Link href={`/acesso/tipos-boletim/novo${salaId ? `?sala=${salaId}` : ''}`} className="botao">
          Novo tipo
        </Link>
      </div>
      <section className="cartao">
        <form className="filtros" method="get">
          <select name="sala" defaultValue={salaId || ''} aria-label="Sala">
            <option value="">Todas as salas</option>
            {salas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="botao botao-secundario">
            Filtrar
          </button>
        </form>
        {tipos.length === 0 ? (
          <p className="suave">Nenhum tipo de boletim.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Sala</th>
                  <th>Periodicidade</th>
                  <th>Regras</th>
                  <th>Boletins</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tipos.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.nome}</strong>
                      <br />
                      <small className="suave mono">{t.slug}</small>
                    </td>
                    <td>
                      <small>{t.sala_sigla ?? t.sala_nome}</small>
                    </td>
                    <td>{PERIODICIDADES[t.periodicidade]}</td>
                    <td>
                      {!t.ativo && <span className="etiqueta status-inativo">Inativo</span>}
                      {t.exige_revisao && <span className="etiqueta">Revisão</span>}
                      <span className="etiqueta">{t.publico ? 'Público' : 'Interno'}</span>
                    </td>
                    <td>{t.total_boletins}</td>
                    <td>
                      <Link href={`/acesso/tipos-boletim/${t.id}`}>Editar</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
