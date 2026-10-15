import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cabecalho } from '@/components/acesso/pecas';
import { ScriptsLegado } from '@/components/acesso/scripts-legado';
import { salasPainel } from '@/lib/acesso/painel';
import { acl, exigirSala } from '@/lib/auth/acl';
import { MAX_LINHAS } from '@/lib/graficos-tabela';
import { PRIMEIRO_ANO, rotuloAno } from '@/lib/hidrologia/analise-mlt';
import { AGREGACOES, dataCurta, FORMATOS, graficoSsd, MAX_SERIES, PERIODOS, TIPOS, type Catalogo } from '@/lib/hidrologia/grafico-ssd';
import { hojeSp } from '@/lib/integracoes/comum';
import { salvarGraficoSsdAcao } from '../actions';
import { FormSalvarAnalise } from '../componentes';

export const metadata: Metadata = { title: 'Gráficos com dados do SSD' };

const num = (v: number | null | undefined, casas = 2) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const br = (ymd: string) => `${ymd.slice(8)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

function OpcoesLocais({ cat }: { cat: Catalogo | null }) {
  return (
    <>
      <option value="">—</option>
      {cat?.grupos.map(([grupo, lista]) => (
        <optgroup key={grupo} label={grupo}>
          {lista.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function OpcoesVariaveis({ cat }: { cat: Catalogo | null }) {
  return (
    <>
      <option value="">—</option>
      {cat?.variaveis.map(([k, n]) => (
        <option key={k} value={k}>
          {n}
        </option>
      ))}
    </>
  );
}

/**
 * Gráficos com dados do SSD SP Águas — qualquer série do catálogo: série no
 * tempo, comparação de anos × MLT ou comparação de locais. O gráfico pode ser
 * salvo na lista de Gráficos da sala. Os seletores são ligados pelo script
 * original do PHP (public/acesso/js/ssd-seletor.js).
 */
export default async function CriarSsd({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const a = await acl();
  const slug = (Array.isArray(sp.s) ? sp.s[0] : sp.s) || 'alfredo-pisani';
  const sala = await exigirSala(slug, 'visualizar_graficos');
  if (!(await salasPainel(a)).find((s) => s.id === sala.id)?.modulos.some((m) => m.slug === 'graficos')) notFound();

  const hoje = hojeSp();
  const anoAtual = Number(hoje.slice(0, 4));
  // no PHP os locais marcados vinham como locais[]; aqui o nome do campo é "locais"
  const g = await graficoSsd({ ...sp, locais: sp.locais ?? sp['locais[]'] }, hoje);
  const { cat, formato } = g;
  const mapa = Object.fromEntries([...(cat?.locais ?? [])].map(([id, l]) => [id, Object.keys(l.variaveis)]));
  const anosOpcoes = Array.from({ length: anoAtual - PRIMEIRO_ANO + 1 }, (_, k) => anoAtual - k);
  const periodoAno = g.hidro ? 'hidrologico' : 'ano';
  const montar = (
    <div className="col-md-auto ms-auto">
      <button className="btn btn-primary" type="submit">
        <i className="bi bi-arrow-repeat me-1" /> Montar gráfico
      </button>
    </div>
  );

  return (
    <>
      <Cabecalho
        titulo="Gráficos com dados do SSD"
        subtitulo="Qualquer série do SSD SP Águas: sistemas, reservatórios, túneis e transferências, ETAs, postos e bacias — chuva, vazões, volume, nível."
        trilha={[
          ['Painel', '/acesso'],
          ['Gráficos', `/acesso/graficos?sala=${sala.id}`],
          ['Dados do SSD', null],
        ]}
      />

      <form className="acesso-card mb-3" method="get" data-ssd-catalogo={JSON.stringify(mapa)}>
        <input type="hidden" name="s" value={sala.slug} />
        <div className="row g-2 align-items-end">
          <div className="col-md-4">
            <label className="form-label small" htmlFor="formato">
              O que comparar
            </label>
            <select className="form-select" id="formato" name="formato" defaultValue={formato} data-recarregar="">
              {Object.entries(FORMATOS).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          {formato !== 'anos' && (
            <>
              <div className="col-md-3">
                <label className="form-label small" htmlFor="periodo">
                  Período
                </label>
                <select className="form-select" id="periodo" name="periodo" defaultValue={g.periodo} data-periodo="">
                  {Object.entries(PERIODOS).map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-md-2" data-datas="">
                <label className="form-label small" htmlFor="de">
                  De
                </label>
                <input className="form-control" type="date" id="de" name="de" defaultValue={g.ini} max={hoje} />
              </div>
              <div className="col-6 col-md-2" data-datas="">
                <label className="form-label small" htmlFor="ate">
                  Até
                </label>
                <input className="form-control" type="date" id="ate" name="ate" defaultValue={g.fim} max={hoje} />
              </div>
              <div className="col-md-1">
                <label className="form-label small" htmlFor="freq">
                  Dados
                </label>
                <select className="form-select" id="freq" name="freq" defaultValue={g.freq}>
                  <option value="diaria">Diários</option>
                  <option value="mensal">Mensais</option>
                </select>
              </div>
            </>
          )}
        </div>

        {formato === 'tempo' && (
          <>
            <hr />
            <div className="row g-2">
              {g.linhas.map((l, k) => {
                const i = k + 1;
                return (
                  <div key={i} className="col-md-6 col-xl-4">
                    <div className="input-group input-group-sm">
                      <span className="input-group-text">{i}</span>
                      <label className="visually-hidden" htmlFor={`local${i}`}>
                        Local {i}
                      </label>
                      <select className="form-select" id={`local${i}`} name={`local${i}`} defaultValue={l.local || ''}>
                        <OpcoesLocais cat={cat} />
                      </select>
                      <label className="visually-hidden" htmlFor={`var${i}`}>
                        Variável {i}
                      </label>
                      <select className="form-select" id={`var${i}`} name={`var${i}`} defaultValue={l.variavel} data-ssd-variavel-de={`local${i}`}>
                        <OpcoesVariaveis cat={cat} />
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="row g-2 align-items-end mt-1">
              <div className="col-md-2">
                <label className="form-label small" htmlFor="tipo">
                  Gráfico
                </label>
                <select className="form-select" id="tipo" name="tipo" defaultValue={g.tipo}>
                  {Object.entries(TIPOS).map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              {montar}
            </div>
            <p className="small text-secondary mt-2 mb-0">
              Escolha até {MAX_SERIES} séries. As variáveis listadas mudam conforme o local. Dados diários: até 10 anos.
            </p>
          </>
        )}

        {formato === 'anos' && (
          <>
            <hr />
            <div className="row g-2 align-items-end">
              <div className="col-md-4">
                <label className="form-label small" htmlFor="local1">
                  Local
                </label>
                <select className="form-select" id="local1" name="local1" defaultValue={g.linhas[0]!.local || ''}>
                  <OpcoesLocais cat={cat} />
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label small" htmlFor="var1">
                  Variável
                </label>
                <select className="form-select" id="var1" name="var1" defaultValue={g.linhas[0]!.variavel} data-ssd-variavel-de="local1">
                  <OpcoesVariaveis cat={cat} />
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label small" htmlFor="hidro">
                  Ano
                </label>
                <select className="form-select" id="hidro" name="hidro" defaultValue={g.hidro ? '1' : '0'}>
                  <option value="0">Civil (jan–dez)</option>
                  <option value="1">Hidrológico (out–set)</option>
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label small" htmlFor="tipo">
                  Gráfico
                </label>
                <select className="form-select" id="tipo" name="tipo" defaultValue={g.tipo === 'barra' || g.tipo === 'barra-empilhada' ? 'barra' : 'linha'}>
                  <option value="linha">Linhas</option>
                  <option value="barra">Barras</option>
                </select>
              </div>
            </div>
            <div className="row g-2 align-items-end mt-1">
              {Array.from({ length: MAX_SERIES }, (_, k) => k + 1).map((i) => (
                <div key={i} className="col-4 col-md-1">
                  <label className="form-label small" htmlFor={`ano${i}`}>
                    Ano {i}
                  </label>
                  <select className="form-select form-select-sm" id={`ano${i}`} name={`ano${i}`} defaultValue={String(g.anosSel[i - 1] ?? '')}>
                    <option value="">—</option>
                    {anosOpcoes.map((y) => (
                      <option key={y} value={y}>
                        {rotuloAno(periodoAno, y)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="col-6 col-md-1">
                <label className="form-label small" htmlFor="mlt_de">
                  MLT de
                </label>
                <input className="form-control form-control-sm" type="number" id="mlt_de" name="mlt_de" min={PRIMEIRO_ANO} max={anoAtual} defaultValue={g.mltDe ?? ''} />
              </div>
              <div className="col-6 col-md-1">
                <label className="form-label small" htmlFor="mlt_ate">
                  até
                </label>
                <input className="form-control form-control-sm" type="number" id="mlt_ate" name="mlt_ate" min={PRIMEIRO_ANO} max={anoAtual} defaultValue={g.mltAte ?? ''} />
              </div>
              <div className="col-md-auto">
                <div className="form-check mb-1">
                  <input className="form-check-input" type="checkbox" id="acumulado" name="acumulado" value="1" defaultChecked={g.acumulado} />
                  <label className="form-check-label small" htmlFor="acumulado">
                    Acumulado (só chuva)
                  </label>
                </div>
              </div>
              {montar}
            </div>
          </>
        )}

        {formato === 'locais' && (
          <>
            <hr />
            <div className="row g-2 align-items-end">
              <div className="col-md-4">
                <label className="form-label small" htmlFor="var_locais">
                  Variável
                </label>
                <select className="form-select" id="var_locais" name="var_locais" defaultValue={g.varLocais} data-recarregar="">
                  <OpcoesVariaveis cat={cat} />
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label small" htmlFor="agregacao">
                  Valor no período
                </label>
                <select className="form-select" id="agregacao" name="agregacao" defaultValue={g.agregacao}>
                  {Object.entries(AGREGACOES).map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              {montar}
            </div>
            <fieldset className="mt-2">
              <legend className="form-label small mb-1">Locais (só os que têm a variável)</legend>
              {cat?.grupos.map(([grupo, lista]) => {
                const comVariavel = lista.filter(([id]) => cat.locais.get(id)?.variaveis[g.varLocais]);
                return comVariavel.length === 0 ? null : (
                  <div key={grupo}>
                    <div className="small text-secondary mt-2">{grupo}</div>
                    <div className="d-flex flex-wrap gap-3">
                      {comVariavel.map(([id, nome]) => (
                        <div key={id} className="form-check">
                          <input className="form-check-input" type="checkbox" id={`loc-${id}`} name="locais" value={id} defaultChecked={g.locaisSel.includes(id)} />
                          <label className="form-check-label small" htmlFor={`loc-${id}`}>
                            {nome}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </fieldset>
          </>
        )}
      </form>

      {g.erro && (
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle" /> {g.erro}
        </div>
      )}
      {g.avisos.map((aviso) => (
        <div key={aviso} className="alert alert-info py-2 small">
          <i className="bi bi-info-circle" /> {aviso}
        </div>
      ))}

      {g.grafico && (
        <>
          <section className="acesso-card mb-3">
            <h2 className="h6 mb-2">{g.titulo}</h2>
            <div className="acesso-grafico acesso-grafico--grande">
              <canvas data-grafico={JSON.stringify({ ...g.grafico, titulo: g.titulo })} role="img" aria-label={g.titulo} />
            </div>
          </section>

          {a.pode('criar_graficos', sala.id) && (
            <FormSalvarAnalise
              acao={salvarGraficoSsdAcao}
              titulo={g.titulo}
              ocultos={{ s: sala.slug, ...g.parametros }}
              listas={formato === 'locais' ? { locais: g.locaisSel.map(String) } : {}}
              nota={`Até ${MAX_LINHAS} pontos por gráfico salvo.`}
            />
          )}

          <section className="acesso-card">
            <div className="table-responsive">
              {formato === 'tempo' && (
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Série</th>
                      <th className="text-end">Média</th>
                      <th className="text-end">Mínimo</th>
                      <th className="text-end">Máximo</th>
                      <th className="text-end">Soma</th>
                      <th className="text-end">Último valor</th>
                      <th className="text-end">Dados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.resumoTempo.map((r) => (
                      <tr key={r.nome}>
                        <td>
                          {r.nome} <small className="text-secondary">{r.unidade}</small>
                        </td>
                        <td className="text-end">{num(r.media)}</td>
                        <td className="text-end">{num(r.minimo)}</td>
                        <td className="text-end">{num(r.maximo)}</td>
                        <td className="text-end">{num(r.soma)}</td>
                        <td className="text-end">
                          {num(r.ultimo)}
                          {r.ultimaData && <small className="text-secondary"> ({dataCurta(r.ultimaData, g.mensal)})</small>}
                        </td>
                        <td className="text-end">{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {formato === 'anos' && g.tabelaAnos && (
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th className="text-end">MLT</th>
                      {g.tabelaAnos.anos.map(({ y }) => (
                        <th key={y} className="text-end">
                          {rotuloAno(periodoAno, y)} <small className="text-secondary fw-normal">(% MLT)</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.grafico.rotulos.map((mes, i) => {
                      const ref = g.tabelaAnos!.mlt[i];
                      return (
                        <tr key={mes}>
                          <td>{mes}</td>
                          <td className="text-end">{num(ref)}</td>
                          {g.tabelaAnos!.anos.map(({ y, valores }) => {
                            const v = valores[i];
                            const pct = v != null && ref ? (v / ref) * 100 : null;
                            return (
                              <td key={y} className="text-end">
                                {num(v)}
                                {pct !== null && <small className={pct < 100 ? 'text-danger' : 'text-success'}> ({num(pct, 0)}%)</small>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {formato === 'locais' && (
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Local</th>
                      <th className="text-end">
                        {g.grafico.eixo_y} ({g.grafico.unidade})
                      </th>
                      <th className="text-end">Último dado</th>
                      <th className="text-end">Dados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.resumoLocais.map((r) => (
                      <tr key={r.nome}>
                        <td>{r.nome}</td>
                        <td className="text-end">{num(r.valor)}</td>
                        <td className="text-end small">{r.ultimaData ? dataCurta(r.ultimaData, g.mensal) : '—'}</td>
                        <td className="text-end">{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="small text-secondary mt-2 mb-0">
              Fonte: SSD SP Águas
              {formato === 'anos'
                ? ' (séries mensais). MLT = média de cada mês no intervalo escolhido.'
                : `, ${g.mensal ? 'dados mensais' : 'dados diários'} de ${br(g.ini)} a ${br(g.fim)}.`}
            </p>
          </section>
        </>
      )}

      <ScriptsLegado scripts={['/acesso/vendor/chartjs/chart.umd.min.js', '/acesso/js/graficos.js', '/acesso/js/ssd-seletor.js']} />
    </>
  );
}
