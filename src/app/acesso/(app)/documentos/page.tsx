import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { inteiro, Paginacao, texto } from '@/components/paginacao';
import { acl } from '@/lib/auth/acl';
import { categorias, listar, salasDocumentos, sugestoesTitulos } from '@/lib/documentos';
import { dataBr, extensao, tamanho } from '@/lib/formato';
import { BuscaAutocompletar } from '@/components/busca-autocompletar';

export const metadata: Metadata = { title: 'Documentos' };

const POR_PAGINA = 20;

export default async function PaginaDocumentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const a = await acl();
  const salas = await salasDocumentos(a, 'visualizar_documentos');
  if (!salas.length) redirect('/acesso/sem-acesso');
  const podeEnviar = (await salasDocumentos(a, 'enviar_documentos')).length > 0;

  const sp = await searchParams;
  const f = { sala: inteiro(sp.sala), categoria: inteiro(sp.categoria), busca: texto(sp.busca) };
  const pagina = Math.max(1, inteiro(sp.p));
  const ids = salas.map((s) => s.id);
  const [{ itens, total }, cats] = await Promise.all([
    listar(ids, { salaId: f.sala, categoriaId: f.categoria, busca: f.busca }, pagina, POR_PAGINA),
    categorias(ids),
  ]);

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Documentos</h1>
          <p className="suave">Notas técnicas, relatórios, apresentações e atas das salas.</p>
        </div>
        {podeEnviar && (
          <Link href="/acesso/documentos/novo" className="botao">
            Enviar documento
          </Link>
        )}
      </div>
      {sp.excluido && <div className="alerta alerta-ok">Documento excluído.</div>}
      <section className="cartao">
        <form className="filtros" method="get">
          <BuscaAutocompletar sugestoes={await sugestoesTitulos(salas.map((s) => s.id))} name="busca" defaultValue={f.busca} placeholder="Buscar no título ou na descrição" rotulo="Buscar" />
          {salas.length > 1 && (
            <select name="sala" defaultValue={f.sala || ''} aria-label="Sala">
              <option value="">Todas as salas</option>
              {salas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          )}
          <select name="categoria" defaultValue={f.categoria || ''} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="botao botao-secundario">
            Filtrar
          </button>
        </form>
        {itens.length === 0 ? (
          <p className="suave">Nenhum documento encontrado.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Documento</th>
                  <th>Sala / categoria</th>
                  <th>Arquivo</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((d) => (
                  <tr key={d.id}>
                    <td>{dataBr(d.data)}</td>
                    <td>
                      <Link href={`/acesso/documentos/${d.id}`}>
                        <strong>{d.titulo}</strong>
                      </Link>
                      {d.publico && <span className="etiqueta status-ativo">público</span>}
                      {d.descricao && (
                        <>
                          <br />
                          <small className="suave">{d.descricao.slice(0, 140)}</small>
                        </>
                      )}
                    </td>
                    <td>
                      <small>
                        {d.sala}
                        {d.categoria_nome && ` · ${d.categoria_nome}`}
                      </small>
                    </td>
                    <td>
                      <a href={`/acesso/documentos/${d.id}/arquivo`}>
                        <small>
                          {extensao(d.nome_original)}, {tamanho(d.tamanho)}
                        </small>
                      </a>
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
          base="/acesso/documentos"
          params={{ busca: f.busca, sala: f.sala ? String(f.sala) : undefined, categoria: f.categoria ? String(f.categoria) : undefined }}
        />
      </section>
    </>
  );
}
