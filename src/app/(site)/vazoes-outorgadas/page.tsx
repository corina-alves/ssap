import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import '@/styles/legado/pagina-vazoes-outorgadas.css';
import { Esqueleto, EsqueletoGrafico } from '@/components/carregamento';
import { GraficoOutorgas } from '@/components/graficos-php';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { Hero } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { OUTORGAS, painelOutorgas, situacaoUso, type PainelOutorgas } from '@/lib/hidrologia/outorgas';
import { hojeSp, textoReserva } from '@/lib/integracoes/comum';

export const metadata: Metadata = {
  title: 'Vazões Outorgadas',
  description: 'Vazões captadas em relação aos limites outorgados dos sistemas produtores da RMSP.',
};

const n = (v: number | null | undefined, sufixo = '') =>
  v == null ? '-' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${sufixo}`;

/** Enquanto carrega, o lugar do valor fica em esqueleto. */
const ou = (carregando: boolean, valor: () => ReactNode, largura = '4rem') => (carregando ? <Esqueleto largura={largura} style={{ display: 'inline-block' }} /> : valor());

function Kpi({ rotulo, icone, valor, legenda, pequeno }: { rotulo: string; icone: string; valor?: string; legenda?: string; pequeno?: boolean }) {
  return (
    <div className="col-sm-6 col-xl-3">
      <div className="out-kpi">
        <div className="out-kpi-top">
          <small>{rotulo}</small>
          <div className="out-kpi-icon">
            <i className={`bi ${icone}`} />
          </div>
        </div>
        {valor === undefined ? <Esqueleto className="esq-valor" largura="55%" /> : <strong style={pequeno ? { fontSize: '1.05rem' } : undefined}>{valor}</strong>}
        <span>{legenda ?? <Esqueleto largura="70%" />}</span>
      </div>
    </div>
  );
}

/**
 * Indicadores, gráfico, uso por sistema e tabela. Sem `d` (SABESP ainda
 * respondendo), a mesma estrutura com nomes e limites — que são fixos — e os
 * valores medidos em esqueleto.
 */
function Painel({ d, aviso }: { d: PainelOutorgas | null; aviso?: string }) {
  const carregando = !d;
  const sistemas = d?.sistemas ?? OUTORGAS.map((o) => ({ ...o, transposicao: o.transposicao ?? 0, captacao: null, percentual: null, margem: null }));
  return (
    <>
      <section className="row g-3 mb-3">
        <Kpi rotulo="Limites de retirada" icone="bi-droplet" valor={d ? n(d.totalOutorga) : undefined} legenda="m³/s — sem incluir a transposição" />
        <Kpi rotulo="Captação observada" icone="bi-water" valor={d ? n(d.totalCaptacao) : undefined} legenda="m³/s captados" />
        <Kpi rotulo="Uso da outorga" icone="bi-speedometer2" valor={d ? n(d.percentualTotal, '%') : undefined} legenda="da soma dos limites" />
        <Kpi
          rotulo="Maior utilização"
          icone="bi-bar-chart-line"
          valor={d ? (d.maiorUso?.nome ?? '-') : undefined}
          legenda={d ? (d.maiorUso ? `${n(d.maiorUso.percentual, '%')} da outorga` : 'Sem dado') : undefined}
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
                {d ? (
                  <>
                    Dados de {dataBr(d.data)}
                    {aviso ? ` (${aviso})` : ''}
                  </>
                ) : (
                  <Esqueleto largura="8rem" />
                )}
              </small>
            </div>
            <div className="out-panel-body">
              {d ? (
                <div className="out-chart" style={{ height: 420 }}>
                  <GraficoOutorgas sistemas={d.sistemas.map(({ nome, captacao, outorga }) => ({ nome, captacao, outorga }))} />
                </div>
              ) : (
                <EsqueletoGrafico altura={420} rotulo="Carregando o gráfico de captação…" />
              )}
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
                {sistemas.map((s) => {
                  const cor = situacaoUso(s.percentual).cor;
                  return (
                    <div key={s.id} className="out-use">
                      <div className="out-use-top">
                        <strong>{s.nome}</strong>
                        <strong style={{ color: cor }}>{ou(carregando, () => n(s.percentual, '%'), '3rem')}</strong>
                      </div>
                      <div className="out-bar">
                        {carregando ? <Esqueleto altura="100%" /> : <span style={{ width: `${Math.min(s.percentual ?? 0, 100)}%`, background: cor }} />}
                      </div>
                      <div className="out-detail">
                        <span>
                          Captação: <strong>{ou(carregando, () => `${n(s.captacao)} m³/s`)}</strong>
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
              {sistemas.map((s) => {
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
                      <strong>{ou(carregando, () => `${n(s.captacao)} m³/s`)}</strong>
                    </td>
                    <td className="text-end">{n(s.outorga)} m³/s</td>
                    <td className="text-end">
                      <strong style={{ color: st.cor }}>{ou(carregando, () => n(s.percentual, '%'), '3rem')}</strong>
                    </td>
                    <td className="text-end">{ou(carregando, () => `${n(s.margem)} m³/s`)}</td>
                    <td className="text-center">{ou(carregando, () => <span className={`out-badge ${st.classe}`}>{st.rotulo}</span>, '5rem')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

async function Conteudo({ data }: { data: string }) {
  const r = await painelOutorgas(data);
  if (!r.ok) return <div className="alert alert-warning">{r.mensagem}</div>;
  return <Painel d={r.dados} aviso={r.desatualizado ? textoReserva(r.fonte, r.obtidoEm) : undefined} />;
}

export default async function VazoesOutorgadas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = dataDaUrl((await searchParams).data);

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

          <Suspense key={data} fallback={<Painel d={null} />}>
            <Conteudo data={data} />
          </Suspense>

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
