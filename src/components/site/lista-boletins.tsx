import Link from 'next/link';
import { dataBr } from '@/lib/formato';
import { contagemPorTipo, listarPublicados, sugestoesBoletins, type BoletimPublico } from '@/lib/publico';
import { SelectAutoEnvio } from './auto-envio';
import { BuscaAutocompletar } from '@/components/busca-autocompletar';

/**
 * Lista pública de boletins — mesmo markup de boletins.php /
 * includes/public_boletim_page.php (toolbar, itens .blt-item, paginação).
 */

const ICONES: Record<string, { icone: string; rotulo: string }> = {
  diario: { icone: 'bi-calendar2-day', rotulo: 'Diário' },
  mensal: { icone: 'bi-cloud-rain-heavy', rotulo: 'Mensal' },
  spi: { icone: 'bi-bar-chart', rotulo: 'Índice SPI' },
  integrado: { icone: 'bi-layers', rotulo: 'Integrado' },
};
const visual = (b: BoletimPublico) => ICONES[b.tipo_slug] ?? { icone: 'bi-file-earmark-pdf', rotulo: b.tipo_nome };
const POR_PAGINA = [10, 20, 30];

/** competência AAAA-MM → MM/AAAA */
const periodo = (c: string | null) => (c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : '');

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export async function ListaBoletins({
  base,
  sp,
  tipos,
  comFiltroTipo = false,
  rotuloSecao,
}: {
  /** endereço da página (para os links da paginação) */
  base: string;
  sp: Params;
  /** tipos fixos desta página (vazio = todos) */
  tipos?: string[];
  comFiltroTipo?: boolean;
  rotuloSecao: string;
}) {
  const busca = um(sp.q).trim().slice(0, 100);
  const pp = POR_PAGINA.includes(Number(um(sp.pp))) ? Number(um(sp.pp)) : 10;
  const tipoEscolhido = comFiltroTipo ? um(sp.tipo) : '';
  const filtroTipos = tipoEscolhido && tipoEscolhido !== 'todos' ? [tipoEscolhido] : tipos;

  const [{ total: totalGeral }, contagem, sugestoes] = await Promise.all([
    listarPublicados({ tipos: tipos }, 1),
    comFiltroTipo ? contagemPorTipo() : Promise.resolve([]),
    sugestoesBoletins(filtroTipos),
  ]);
  const { total } = await listarPublicados({ tipos: filtroTipos, busca }, 1);
  const paginas = Math.max(1, Math.ceil(total / pp));
  const pagina = Math.min(paginas, Math.max(1, Number(um(sp.pag)) || 1));
  const { itens } = await listarPublicados({ tipos: filtroTipos, busca }, pp, (pagina - 1) * pp);

  const url = (extra: Record<string, string | number>) => {
    const q = new URLSearchParams();
    if (tipoEscolhido && tipoEscolhido !== 'todos') q.set('tipo', tipoEscolhido);
    if (pp !== 10) q.set('pp', String(pp));
    if (busca) q.set('q', busca);
    for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const ini = Math.max(1, Math.min(pagina - 2, paginas - 4));
  const nums = Array.from({ length: Math.min(5, paginas) }, (_, i) => ini + i);

  return (
    <section className="sssp-section-card">
      <div className="sssp-section-card__head">
        <div className="sssp-section-card__title">
          <span>
            <i className="bi bi-journals" />
          </span>
          <div>
            <h2>{rotuloSecao}</h2>
            <p>
              {total} de {totalGeral} publicações
            </p>
          </div>
        </div>
      </div>
      <div className="sssp-section-card__body">
        <form className="blt-toolbar" method="get" action={base}>
          <div className="blt-filtros">
            {comFiltroTipo && (
              <div className="sssp-field">
                <label htmlFor="tipo">Tipo de boletim</label>
                <SelectAutoEnvio id="tipo" name="tipo" defaultValue={tipoEscolhido || 'todos'}>
                  <option value="todos">Todos os tipos</option>
                  {contagem.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {ICONES[t.slug]?.rotulo ?? t.nome} ({t.total})
                    </option>
                  ))}
                </SelectAutoEnvio>
              </div>
            )}
            <div className="sssp-field">
              <label htmlFor="pp">Por página</label>
              <SelectAutoEnvio id="pp" name="pp" defaultValue={String(pp)}>
                {POR_PAGINA.map((n) => (
                  <option key={n} value={n}>
                    {n} registros
                  </option>
                ))}
              </SelectAutoEnvio>
            </div>
          </div>
          <div className="blt-busca">
            <i className="bi bi-search" />
            <BuscaAutocompletar sugestoes={sugestoes} name="q" defaultValue={busca} placeholder="Buscar por título, data ou período..." rotulo="Buscar boletim" />
          </div>
        </form>

        {itens.length > 0 ? (
          <>
            <div className="blt-lista">
              {itens.map((b) => {
                const v = visual(b);
                const href = `/boletins/arquivo/${b.id}`;
                return (
                  <article className="blt-item" key={b.id}>
                    <div className="blt-item__icone">
                      <i className={`bi ${v.icone}`} />
                    </div>
                    <div>
                      <div className="blt-item__titulo">{b.titulo}</div>
                      <div className="blt-item__meta">
                        <span className="blt-badge">
                          <i className={`bi ${v.icone}`} />
                          {v.rotulo}
                        </span>
                        <span>
                          <i className="bi bi-calendar3 me-1" />
                          {dataBr(b.data_referencia)}
                        </span>
                        {b.competencia && (
                          <span>
                            <i className="bi bi-clock-history me-1" />
                            Período: {periodo(b.competencia)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="blt-item__acoes">
                      <a className="btn btn-sm btn-primary" href={href} target="_blank" rel="noopener">
                        <i className="bi bi-eye me-1" />
                        Visualizar
                      </a>
                      <a className="btn btn-sm btn-outline-primary" href={`${href}?baixar=1`}>
                        <i className="bi bi-download me-1" />
                        Baixar
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
            <nav className="blt-pager" aria-label="Paginação de boletins">
              <div className="blt-pager__info">
                Mostrando {(pagina - 1) * pp + 1}–{(pagina - 1) * pp + itens.length} de {total}
              </div>
              <div className="blt-pager__nums">
                <Link className={pagina <= 1 ? 'is-off' : ''} href={url({ pag: 1 })} aria-label="Primeira">
                  &laquo;
                </Link>
                <Link className={pagina <= 1 ? 'is-off' : ''} href={url({ pag: Math.max(1, pagina - 1) })} aria-label="Anterior">
                  &lsaquo;
                </Link>
                {nums.map((i) =>
                  i === pagina ? (
                    <span className="is-atual" key={i}>
                      {i}
                    </span>
                  ) : (
                    <Link key={i} href={url({ pag: i })}>
                      {i}
                    </Link>
                  ),
                )}
                <Link className={pagina >= paginas ? 'is-off' : ''} href={url({ pag: Math.min(paginas, pagina + 1) })} aria-label="Próxima">
                  &rsaquo;
                </Link>
                <Link className={pagina >= paginas ? 'is-off' : ''} href={url({ pag: paginas })} aria-label="Última">
                  &raquo;
                </Link>
              </div>
            </nav>
          </>
        ) : (
          <div className="sssp-component-error">
            <i className={`bi ${busca ? 'bi-search' : 'bi-folder2-open'}`} />
            <span>
              {busca
                ? `Nenhum boletim encontrado para "${busca}".`
                : comFiltroTipo
                  ? 'Nenhum boletim encontrado. Ajuste o filtro ou a busca.'
                  : 'Ainda não há arquivos publicados nesta categoria.'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
