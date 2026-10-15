import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cabecalho } from '@/components/acesso/pecas';
import { ScriptsLegado } from '@/components/acesso/scripts-legado';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { salasPainel } from '@/lib/acesso/painel';
import { acl, exigirSala } from '@/lib/auth/acl';
import { agregar, PERIODOS, PRIMEIRO_ANO, rotuloAno, SISTEMAS, VARIAVEIS } from '@/lib/hidrologia/analise-mlt';
import { FORMATOS, graficoMlt, type GraficoMlt, type Parametros } from '@/lib/hidrologia/grafico-mlt';
import { hojeSp } from '@/lib/integracoes/comum';
import { salvarGraficoMltAcao } from '../actions';
import { FormSalvarAnalise } from '../componentes';

export const metadata: Metadata = { title: 'Criar gráfico com MLT' };

const num = (v: number | null | undefined, casas = 1) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const Pct = ({ p, extra = '' }: { p: number | null; extra?: string }) =>
  p === null ? null : (
    <small className={p < 100 ? 'text-danger' : 'text-success'}>
      {' '}
      ({num(p, 0)}%{extra})
    </small>
  );

/**
 * Criar gráfico com MLT — séries mensais dos sistemas produtores (SSD)
 * comparadas à média de longo termo, por período. O gráfico pode ser salvo na
 * lista de Gráficos da sala (rascunho → publicar).
 */
export default async function CriarMlt({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const bruto = await searchParams;
  const p: Parametros = Object.fromEntries(Object.entries(bruto).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v)?.trim()]));
  const a = await acl();
  const sala = await exigirSala(p.s || 'alfredo-pisani', 'visualizar_graficos');
  if (!(await salasPainel(a)).find((s) => s.id === sala.id)?.modulos.some((m) => m.slug === 'graficos')) notFound();

  const anoAtual = Number(hojeSp().slice(0, 4));
  let g: GraficoMlt | null = null;
  try {
    g = await graficoMlt(p, anoAtual);
  } catch {
    g = null;
  }
  // Seleções mostradas no formulário mesmo se o SSD falhar
  const sel = {
    sistema: g?.sistema ?? (SISTEMAS[p.sistema ?? ''] ? p.sistema! : 'cantareira'),
    variavel: g?.variavel ?? 'chuva',
    periodo: g?.periodo ?? 'chuvoso',
    formato: g?.formato ?? 'mensal',
  };
  const somaChuva = VARIAVEIS[sel.variavel].agregacao === 'soma';
  const atravessa = sel.periodo === 'chuvoso' || sel.periodo === 'hidrologico';
  const anosOpcoes = Array.from({ length: anoAtual - PRIMEIRO_ANO + 1 }, (_, k) => anoAtual - k);

  return (
    <>
      <Cabecalho
        titulo="Criar gráfico com MLT"
        subtitulo="Sistemas produtores (SSD SP Águas) comparados à média de longo termo, por período chuvoso, seco, ano civil ou hidrológico."
        trilha={[
          ['Painel', '/acesso'],
          ['Gráficos', `/acesso/graficos?sala=${sala.id}`],
          ['Criar gráfico com MLT', null],
        ]}
      />

      <form className="acesso-card mb-3" method="get">
        <input type="hidden" name="s" value={sala.slug} />
        <div className="row g-2 align-items-end">
          <div className="col-md-3">
            <label className="form-label small" htmlFor="sistema">
              Sistema
            </label>
            <SelectAutoEnvio className="form-select" id="sistema" name="sistema" defaultValue={sel.sistema}>
              {Object.entries(SISTEMAS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.nome}
                </option>
              ))}
            </SelectAutoEnvio>
          </div>
          <div className="col-md-3">
            <label className="form-label small" htmlFor="variavel">
              Variável
            </label>
            <SelectAutoEnvio className="form-select" id="variavel" name="variavel" defaultValue={sel.variavel}>
              {Object.entries(VARIAVEIS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.rotulo} ({v.unidade})
                </option>
              ))}
            </SelectAutoEnvio>
          </div>
          <div className="col-md-3">
            <label className="form-label small" htmlFor="periodo">
              Período
            </label>
            <SelectAutoEnvio className="form-select" id="periodo" name="periodo" defaultValue={sel.periodo}>
              {Object.entries(PERIODOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.rotulo}
                </option>
              ))}
            </SelectAutoEnvio>
          </div>
          <div className="col-md-3">
            <label className="form-label small" htmlFor="formato">
              Formato do gráfico
            </label>
            <SelectAutoEnvio className="form-select" id="formato" name="formato" defaultValue={sel.formato}>
              {Object.entries(FORMATOS)
                .filter(([k]) => k !== 'acumulado' || somaChuva)
                .map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
            </SelectAutoEnvio>
          </div>
        </div>
        <div className="row g-2 align-items-end mt-1">
          {sel.formato === 'anual' ? (
            <>
              <div className="col-6 col-md-2">
                <label className="form-label small" htmlFor="de">
                  De (início do período)
                </label>
                <input className="form-control" type="number" id="de" name="de" min={PRIMEIRO_ANO} max={anoAtual} defaultValue={g?.de ?? ''} />
              </div>
              <div className="col-6 col-md-2">
                <label className="form-label small" htmlFor="ate">
                  Até
                </label>
                <input className="form-control" type="number" id="ate" name="ate" min={PRIMEIRO_ANO} max={anoAtual} defaultValue={g?.ate ?? ''} />
              </div>
            </>
          ) : (
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="col-6 col-md-2">
                <label className="form-label small" htmlFor={`ano${i}`}>
                  {atravessa ? 'Período' : 'Ano'} {i}
                </label>
                <SelectAutoEnvio className="form-select" id={`ano${i}`} name={`ano${i}`} defaultValue={String(g?.anos[i - 1] ?? '')}>
                  <option value="">—</option>
                  {anosOpcoes.map((y) => (
                    <option key={y} value={y}>
                      {rotuloAno(sel.periodo, y)}
                    </option>
                  ))}
                </SelectAutoEnvio>
              </div>
            ))
          )}
          <div className="col-6 col-md-1">
            <label className="form-label small" htmlFor="mlt_de">
              MLT de
            </label>
            <input className="form-control" type="number" id="mlt_de" name="mlt_de" min={PRIMEIRO_ANO} max={anoAtual} defaultValue={g?.mltDe ?? ''} />
          </div>
          <div className="col-6 col-md-1">
            <label className="form-label small" htmlFor="mlt_ate">
              até
            </label>
            <input className="form-control" type="number" id="mlt_ate" name="mlt_ate" min={PRIMEIRO_ANO} max={anoAtual} defaultValue={g?.mltAte ?? ''} />
          </div>
          <div className="col-md-auto ms-auto">
            <button className="btn btn-primary" type="submit">
              <i className="bi bi-arrow-repeat me-1" /> Montar gráfico
            </button>
          </div>
        </div>
      </form>

      {!g ? (
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle" /> Não foi possível obter os dados do SSD agora. Tente novamente em instantes.
        </div>
      ) : (
        <>
          <div className="row g-3 mb-3">
            {g.kpis.map(([icone, valor, rotulo]) => (
              <div key={rotulo} className="col-6 col-xl-3">
                <div className="acesso-kpi acesso-kpi--aprovado">
                  <i className={`bi ${icone}`} />
                  <div>
                    <span className="acesso-kpi__valor">{valor}</span>
                    <span className="acesso-kpi__rotulo">{rotulo}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <section className="acesso-card mb-3">
            <h2 className="h6 mb-2">{g.titulo}</h2>
            <div className="acesso-grafico acesso-grafico--grande">
              <canvas key={JSON.stringify(p)} data-grafico={JSON.stringify({ ...g.grafico, titulo: g.titulo })} role="img" aria-label={g.titulo} />
            </div>
            {g.formato === 'anual' && <p className="small text-secondary mt-2 mb-0">* período em andamento (a % da MLT compara só os meses já medidos).</p>}
          </section>

          {a.pode('criar_graficos', sala.id) && (
            <FormSalvarAnalise
              acao={salvarGraficoMltAcao}
              titulo={g.titulo}
              ocultos={{
                s: sala.slug, sistema: g.sistema, variavel: g.variavel, periodo: g.periodo, formato: g.formato,
                mlt_de: String(g.mltDe), mlt_ate: String(g.mltAte),
                ...(g.de !== null ? { de: String(g.de), ate: String(g.ate) } : Object.fromEntries([1, 2, 3, 4].map((i) => [`ano${i}`, String(g.anos[i - 1] ?? '')]))),
              }}
            />
          )}

          <section className="acesso-card">
            <div className="table-responsive">
              {g.tabela.tipo === 'anual' ? (
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>{g.nomePeriodo}</th>
                      <th className="text-end">
                        {g.nomeVar} ({g.unidade})
                      </th>
                      <th className="text-end">MLT comparável</th>
                      <th className="text-end">% da MLT</th>
                      <th className="text-end">Meses com dado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...g.tabela.linhas].reverse().map(({ y, r }) => (
                      <tr key={y}>
                        <td>
                          {rotuloAno(g.periodo, y)}
                          {!r.completo && <span className="badge text-bg-light border ms-1">em andamento</span>}
                        </td>
                        <td className="text-end">{num(r.valor)}</td>
                        <td className="text-end">{num(r.mlt)}</td>
                        <td className={`text-end ${r.pct !== null && r.pct < 100 ? 'text-danger' : 'text-success'}`}>{num(r.pct, 0)}%</td>
                        <td className="text-end">
                          {r.meses}/{g.rotulosMeses.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th className="text-end">{g.nomeMlt}</th>
                      {g.tabela.anos.map(({ y }) => (
                        <th key={y} className="text-end">
                          {rotuloAno(g.periodo, y)} <small className="text-secondary fw-normal">(% MLT)</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rotulosMeses.map((mes, i) => {
                      const ref = g.tabela.tipo === 'mensal' ? g.tabela.mlt[i] : null;
                      return (
                        <tr key={mes}>
                          <td>{mes}</td>
                          <td className="text-end">{num(ref)}</td>
                          {g.tabela.tipo === 'mensal' &&
                            g.tabela.anos.map(({ y, valores }) => (
                              <td key={y} className="text-end">
                                {num(valores[i])}
                                <Pct p={valores[i] != null && ref ? (valores[i]! / ref) * 100 : null} />
                              </td>
                            ))}
                        </tr>
                      );
                    })}
                    <tr className="fw-bold">
                      <td>{g.agregacao === 'soma' ? 'Total' : 'Média'}</td>
                      <td className="text-end">{num(agregar(g.tabela.mlt, g.agregacao))}</td>
                      {g.tabela.anos.map(({ y, resumo }) => (
                        <td key={y} className="text-end">
                          {num(resumo.valor)}
                          <Pct p={resumo.pct} extra={resumo.completo ? '' : `, ${resumo.meses} meses`} />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
            <p className="small text-secondary mt-2 mb-0">
              Fonte: SSD SP Águas (séries mensais). MLT = média de cada mês de {g.mltDe} a {g.mltAte}.{' '}
              {g.agregacao === 'soma' ? 'Chuva do período = soma dos meses.' : 'Valor do período = média dos meses.'} Período em andamento: a %
              compara só com a MLT dos meses já medidos.
            </p>
          </section>
        </>
      )}

      <ScriptsLegado scripts={['/acesso/vendor/chartjs/chart.umd.min.js', '/acesso/js/graficos.js']} />
    </>
  );
}
