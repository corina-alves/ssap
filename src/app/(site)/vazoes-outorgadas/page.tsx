import type { Metadata } from 'next';
import '@/styles/legado/pagina-vazoes-outorgadas.css';
import { GraficoOutorgas } from '@/components/graficos-php';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { Hero } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { painelOutorgas, situacaoUso } from '@/lib/hidrologia/outorgas';
import { hojeSp } from '@/lib/integracoes/comum';

export const metadata: Metadata = {
  title: 'Vazões Outorgadas',
  description: 'Vazões captadas em relação aos limites outorgados dos sistemas produtores da RMSP.',
};

const n = (v: number | null | undefined, sufixo = '') =>
  v == null ? '-' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${sufixo}`;

function Kpi({ rotulo, icone, valor, legenda, pequeno }: { rotulo: string; icone: string; valor: string; legenda: string; pequeno?: boolean }) {
  return (
    <div className="col-sm-6 col-xl-3">
      <div className="out-kpi">
        <div className="out-kpi-top">
          <small>{rotulo}</small>
          <div className="out-kpi-icon">
            <i className={`bi ${icone}`} />
          </div>
        </div>
        <strong style={pequeno ? { fontSize: '1.05rem' } : undefined}>{valor}</strong>
        <span>{legenda}</span>
      </div>
    </div>
  );
}

export default async function VazoesOutorgadas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = dataDaUrl((await searchParams).data);
  const r = await painelOutorgas(data);
  const d = r.ok ? r.dados : null;

  return (
    <>
      <Hero
        kicker="Outorgas e usos"
        titulo="Vazões Outorgadas"
        texto="Acompanhamento das vazões captadas em relação aos limites outorgados dos Sistemas Produtores da Região Metropolitana de São Paulo."
        icone="bi-droplet-half"
      />
      <main className="public-content out-page">
        <div className="container">
          <div className="out-toolbar">
            <div className="out-title">
              <h2>Painel de Vazões Outorgadas</h2>
              <p>Comparativo entre a captação observada e os limites outorgados dos Sistemas Produtores.</p>
            </div>
            <form className="out-date" method="get">
              <div>
                <label htmlFor="dataConsulta">Data de referência</label>
                <input type="date" id="dataConsulta" name="data" max={hojeSp()} min="2010-01-01" defaultValue={data} />
              </div>
              <button className="out-btn" type="submit">
                <i className="bi bi-arrow-clockwise" />
                Atualizar
              </button>
            </form>
          </div>

          {!d ? (
            <div className="alert alert-warning">{r.ok ? '' : r.mensagem}</div>
          ) : (
            <>
              <section className="row g-3 mb-3">
                <Kpi rotulo="Limites de retirada" icone="bi-droplet" valor={n(d.totalOutorga)} legenda="m³/s — sem incluir a transposição" />
                <Kpi rotulo="Captação observada" icone="bi-water" valor={n(d.totalCaptacao)} legenda="m³/s captados" />
                <Kpi rotulo="Uso da outorga" icone="bi-speedometer2" valor={n(d.percentualTotal, '%')} legenda="da soma dos limites" />
                <Kpi
                  rotulo="Maior utilização"
                  icone="bi-bar-chart-line"
                  valor={d.maiorUso?.nome ?? '-'}
                  legenda={d.maiorUso ? `${n(d.maiorUso.percentual, '%')} da outorga` : 'Sem dado'}
                  pequeno
                />
              </section>

              <section className="row g-3">
                <div className="col-xl-8">
                  <div className="out-panel">
                    <div className="out-panel-head">
                      <div className="out-panel-title">
                        <i className="bi bi-bar-chart-fill" />
                        <h3>Captação observada x Limite de retirada</h3>
                      </div>
                      <small className="text-secondary">
                        Dados de {dataBr(d.data)}
                        {r.ok && r.desatualizado ? ' (SABESP indisponível: últimos dados obtidos)' : ''}
                      </small>
                    </div>
                    <div className="out-panel-body">
                      <div className="out-chart" style={{ height: 420 }}>
                        <GraficoOutorgas sistemas={d.sistemas.map(({ nome, captacao, outorga }) => ({ nome, captacao, outorga }))} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-xl-4">
                  <div className="out-panel">
                    <div className="out-panel-head">
                      <div className="out-panel-title">
                        <i className="bi bi-percent" />
                        <h3>Utilização por sistema</h3>
                      </div>
                    </div>
                    <div className="out-panel-body">
                      <div className="out-use-list">
                        {d.sistemas.map((s) => {
                          const cor = situacaoUso(s.percentual).cor;
                          return (
                            <div key={s.id} className="out-use">
                              <div className="out-use-top">
                                <strong>{s.nome}</strong>
                                <strong style={{ color: cor }}>{n(s.percentual, '%')}</strong>
                              </div>
                              <div className="out-bar">
                                <span style={{ width: `${Math.min(s.percentual ?? 0, 100)}%`, background: cor }} />
                              </div>
                              <div className="out-detail">
                                <span>
                                  Captação: <strong>{n(s.captacao)} m³/s</strong>
                                </span>
                                <span>
                                  Limite: <strong>{n(s.outorga)} m³/s</strong>
                                </span>
                              </div>
                              {s.transposicao > 0 && (
                                <div className="out-detail" style={{ marginTop: 5, color: '#075bb5' }}>
                                  <span>
                                    <i className="bi bi-arrow-left-right" /> Transposição Paraíba do Sul
                                  </span>
                                  <strong>{n(s.transposicao)} m³/s</strong>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="out-panel out-table-card">
                <div className="out-panel-head">
                  <div className="out-panel-title">
                    <i className="bi bi-table" />
                    <h3>Detalhamento dos Sistemas Produtores</h3>
                  </div>
                </div>
                <div className="out-table-wrap">
                  <table className="out-table">
                    <thead>
                      <tr>
                        <th>Sistema</th>
                        <th className="text-end">Captação</th>
                        <th className="text-end">Limite de retirada</th>
                        <th className="text-end">Uso</th>
                        <th className="text-end">Margem</th>
                        <th className="text-center">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.sistemas.map((s) => {
                        const st = situacaoUso(s.percentual);
                        return (
                          <tr key={s.id}>
                            <td>
                              <div className="out-name">
                                <i className="bi bi-droplet-fill" />
                                {s.nome}
                              </div>
                              {s.transposicao > 0 && (
                                <small style={{ display: 'block', margin: '4px 0 0 39px', color: '#075bb5' }}>
                                  + {n(s.transposicao)} m³/s — Transposição Paraíba do Sul
                                </small>
                              )}
                            </td>
                            <td className="text-end">
                              <strong>{n(s.captacao)} m³/s</strong>
                            </td>
                            <td className="text-end">{n(s.outorga)} m³/s</td>
                            <td className="text-end">
                              <strong style={{ color: st.cor }}>{n(s.percentual, '%')}</strong>
                            </td>
                            <td className="text-end">{n(s.margem)} m³/s</td>
                            <td className="text-center">
                              <span className={`out-badge ${st.classe}`}>{st.rotulo}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          <div className="out-info">
            <i className="bi bi-info-circle-fill" />
            <div>
              <strong>Sobre os dados:</strong> as vazões de captação são obtidas no resumo diário dos Sistemas Produtores. Para o Sistema
              Cantareira, considera-se atualmente <strong>33,0 m³/s de limite de retirada</strong>, acrescidos de{' '}
              <strong>8,5 m³/s da transposição do Paraíba do Sul</strong>. O percentual de utilização do Cantareira é calculado sobre o
              limite de retirada de 23,0 m³/s; a transposição é apresentada separadamente.
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
