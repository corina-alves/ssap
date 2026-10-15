import type { Metadata } from 'next';
import Link from 'next/link';
import '@/styles/legado/pagina-boletins.css';
import { inteiro, texto } from '@/components/paginacao';
import { Atalhos } from '@/components/site/atalhos';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { listarPublicos, opcoesPublicas, sugestoesPublicas } from '@/lib/documentos';
import { dataBr, tamanho } from '@/lib/formato';
import { CATEGORIAS } from './categorias';
import { BuscaAutocompletar } from '@/components/busca-autocompletar';

export const metadata: Metadata = {
  title: 'Documentos',
  description: 'Resoluções, deliberações, atos, notas técnicas e demais documentos publicados pela Sala de Situação.',
};

const POR_PAGINA = 20;

export default async function Documentos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = { categoria: texto(sp.categoria, 60), busca: texto(sp.q) };
  const pagina = Math.max(1, inteiro(sp.pag));
  const [{ itens, total }, opcoes, sugestoes] = await Promise.all([
    listarPublicos({ categoria: f.categoria, busca: f.busca }, POR_PAGINA, (pagina - 1) * POR_PAGINA),
    opcoesPublicas(),
    sugestoesPublicas(),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const url = (p: number) => `/documentos?${new URLSearchParams({ ...(f.categoria ? { categoria: f.categoria } : {}), ...(f.busca ? { q: f.busca } : {}), pag: String(p) })}`;

  return (
    <>
      <Hero
        kicker="Documentos"
        titulo="Documentos da Sala de Situação"
        texto="Resoluções, deliberações, atos administrativos, notas técnicas e demais documentos publicados pela equipe."
        icone="bi-file-earmark-text"
      />
      <Principal>
        <Secao titulo="Categorias" icone="bi-folder2-open">
          <Atalhos
            itens={Object.entries(CATEGORIAS).map(([slug, c]) => ({ titulo: c.titulo, desc: c.intro, href: `/documentos/${slug}`, icone: c.icone }))}
          />
        </Secao>

        <Secao titulo="Documentos publicados" subtitulo={`${total} documento(s)`} icone="bi-journals">
          <form className="blt-toolbar" method="get">
            <div className="blt-filtros">
              <div className="sssp-field">
                <label htmlFor="categoria">Categoria</label>
                <SelectAutoEnvio id="categoria" name="categoria" defaultValue={f.categoria}>
                  <option value="">Todas as categorias</option>
                  {opcoes.categorias.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.nome}
                    </option>
                  ))}
                </SelectAutoEnvio>
              </div>
            </div>
            <div className="blt-busca">
              <i className="bi bi-search" />
              <BuscaAutocompletar sugestoes={sugestoes} name="q" defaultValue={f.busca} placeholder="Buscar no título ou na descrição..." rotulo="Buscar documento" />
            </div>
          </form>
          {itens.length === 0 ? (
            <div className="sssp-component-error">
              <i className="bi bi-folder2-open" />
              <span>{f.busca || f.categoria ? 'Nenhum documento encontrado. Ajuste o filtro ou a busca.' : 'Ainda não há documentos publicados.'}</span>
            </div>
          ) : (
            <>
              <div className="blt-lista">
                {itens.map((d) => (
                  <article className="blt-item" key={d.id}>
                    <div className="blt-item__icone">
                      <i className={`bi ${d.mime === 'application/pdf' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-text'}`} />
                    </div>
                    <div>
                      <div className="blt-item__titulo">{d.titulo}</div>
                      <div className="blt-item__meta">
                        {d.categoria_nome && (
                          <span className="blt-badge">
                            <i className="bi bi-folder2" />
                            {d.categoria_nome}
                          </span>
                        )}
                        <span>
                          <i className="bi bi-calendar3 me-1" />
                          {dataBr(d.data)}
                        </span>
                        <span>
                          <i className="bi bi-building me-1" />
                          {d.sala_nome}
                        </span>
                        <span>{tamanho(d.tamanho)}</span>
                      </div>
                      {d.descricao && <div className="small text-secondary mt-1">{d.descricao}</div>}
                    </div>
                    <div className="blt-item__acoes">
                      <a className="btn btn-sm btn-primary" href={`/documentos/arquivo/${d.id}`} target="_blank" rel="noopener">
                        <i className="bi bi-eye me-1" />
                        Abrir
                      </a>
                    </div>
                  </article>
                ))}
              </div>
              {paginas > 1 && (
                <nav className="blt-pager" aria-label="Paginação de documentos">
                  <div className="blt-pager__info">
                    Página {pagina} de {paginas}
                  </div>
                  <div className="blt-pager__nums">
                    <Link className={pagina <= 1 ? 'is-off' : ''} href={url(Math.max(1, pagina - 1))} aria-label="Anterior">
                      &lsaquo;
                    </Link>
                    <span className="is-atual">{pagina}</span>
                    <Link className={pagina >= paginas ? 'is-off' : ''} href={url(Math.min(paginas, pagina + 1))} aria-label="Próxima">
                      &rsaquo;
                    </Link>
                  </div>
                </nav>
              )}
            </>
          )}
        </Secao>
      </Principal>
    </>
  );
}
