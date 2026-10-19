import { Suspense, type ReactNode } from 'react';
import { Esqueleto, EsqueletoGrafico, EsqueletoTabela } from '@/components/carregamento';
import { GraficoPesosSim, GraficoVolumeSistemas } from '@/components/graficos-php';
import { Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { ESTAGIOS, type LinhaSistema, type PainelReservatorios } from '@/lib/hidrologia/reservatorios';
import { SISTEMAS } from '@/lib/integracoes/sabesp';
import { EsqueletoTransposicao, SeriesAnuais, TransposicaoNoAno } from './secoes';

const num = (v: number | null, casas = 2, suf = '%') =>
  v === null ? '--' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}${suf}`;

/** Valor do dado ou, enquanto carrega (`d` nulo), o esqueleto no lugar. */
const ou = (d: unknown, valor: () => ReactNode, classe = 'esq-valor esq-centro') => (d ? valor() : <Esqueleto className={classe} />);

/** Mesmas faixas do PHP: classe is-<estagio> no card. */
function CardSistema({ s, ano }: { s: LinhaSistema; ano: number }) {
  const dif = s.difAno;
  return (
    <div className={`rsv-card is-${s.estagio.classe}`}>
      <h5>{s.nome}</h5>
      <div className="rsv-valor">{num(s.volume)}</div>
      {s.fonte === 'ana' && <span className="rsv-fonte">Dado: ANA</span>}
      <div className="rsv-estagio">{s.estagio.nome}</div>
      {dif !== null && (
        <div className={`rsv-dif ${dif >= 0 ? 'pos' : 'neg'}`}>
          {dif >= 0 ? '▲' : '▼'} {num(Math.abs(dif))}
          <small>em relação a {ano}</small>
        </div>
      )}
    </div>
  );
}

function ResumoCard({ icone, titulo, children }: { icone: string; titulo: string; children: ReactNode }) {
  return (
    <div className="col-md-6 col-xl-3">
      <div className="rsv-resumo-card">
        <i className={`bi ${icone}`} />
        <h5>{titulo}</h5>
        {children}
      </div>
    </div>
  );
}

/** Seção do filtro de data; no loading.tsx, só com o status de consulta. */
export function Periodo({ children }: { children: ReactNode }) {
  return (
    <Secao titulo="Período de análise" subtitulo="Altere a data para atualizar os dados, gráfico e a tabela." icone="bi-calendar3">
      {children}
    </Secao>
  );
}

/** Seções com os dados do painel; com `d` nulo, a mesma estrutura em esqueleto (também usada no loading.tsx). */
export function Secoes({ d, ano }: { d: PainelReservatorios | null; ano: number }) {
  const sim = d?.sim;
  const cantareira = d?.cantareira;
  const altoTiete = d?.altoTiete;
  return (
    <>
      <Secao titulo="Resumo operacional" subtitulo="Visão geral dos sistemas produtores da Região Metropolitana de São Paulo." icone="bi-speedometer2">
        <div className="row g-3">
          <ResumoCard icone="bi-database" titulo="SIM">
            {ou(d, () => <div className="rsv-valor">{num(sim?.volume ?? null)}</div>)}
            <small>Sistema Integrado Metropolitano</small>
          </ResumoCard>
          <ResumoCard icone="bi-water" titulo="Cantareira">
            {ou(d, () => <div className="rsv-valor">{num(cantareira?.volume ?? null)}</div>)}
            {ou(d, () => <small className="rsv-fonte">Dado: {cantareira?.fonte === 'ana' ? 'ANA' : 'SABESP'}</small>, 'esq-linha esq-centro')}
          </ResumoCard>
          <ResumoCard icone="bi-water" titulo="Alto Tietê">
            {ou(d, () => <div className="rsv-valor">{num(altoTiete?.volume ?? null)}</div>)}
            {ou(d, () => <small>{altoTiete?.estagio.nome ?? '--'}</small>, 'esq-linha esq-centro')}
          </ResumoCard>
          <ResumoCard icone="bi-arrow-left-right" titulo="Transposição">
            {ou(d, () => <div className="rsv-valor">{num(d!.transposicaoM3s, 2, ' m³/s')}</div>)}
            <small>Paraíba do Sul</small>
          </ResumoCard>
        </div>
      </Secao>

      <Secao titulo="Volume dos sistemas produtores" icone="bi-bar-chart-steps">
        <p className="sssp-status mb-3">
          {d ? (
            d.dataComparacao ? (
              `Comparativo entre ${dataBr(d.dataUsada)} e ${dataBr(d.dataComparacao)}.`
            ) : (
              `Sem dados de ${ano} para comparar.`
            )
          ) : (
            <Esqueleto largura="40%" />
          )}
        </p>
        <div className="rsv-cards">
          {d
            ? d.sistemas.map((s) => <CardSistema key={s.id} s={s} ano={ano} />)
            : Object.entries(SISTEMAS).map(([id, nome]) => (
                <div className="rsv-card" key={id}>
                  <h5>{nome}</h5>
                  <Esqueleto className="esq-valor esq-centro" />
                  <Esqueleto className="esq-linha esq-centro" largura="60%" />
                </div>
              ))}
        </div>
      </Secao>

      <div className="row g-3">
        <div className="col-lg-8">
          <Secao titulo="Comparativo de volumes" subtitulo="Volume útil por sistema, comparado ao mesmo período do ano anterior." icone="bi-graph-up">
            {d ? (
              <div className="rsv-grafico-wrap">
                <GraficoVolumeSistemas
                  labels={d.sistemas.map((s) => s.nome)}
                  volAtual={d.sistemas.map((s) => s.volume)}
                  volAnterior={d.sistemas.map((s) => s.volumeAnoAnterior)}
                  rotuloAtual={dataBr(d.dataUsada)}
                  rotuloAnterior={d.dataComparacao ? dataBr(d.dataComparacao) : String(ano)}
                />
              </div>
            ) : (
              <EsqueletoGrafico className="rsv-grafico-wrap" altura="auto" rotulo="Carregando o comparativo de volumes…" />
            )}
            <ul className="legenda-protocolo mt-3 d-flex flex-wrap justify-content-center gap-3 list-unstyled small text-secondary">
              {ESTAGIOS.map((e) => (
                <li key={e.codigo}>
                  <span className="cor" style={{ background: `var(--est-${e.classe})` }} /> {e.codigo} - {e.nome}
                </li>
              ))}
            </ul>
          </Secao>
        </div>
        <div className="col-lg-4">
          <Secao titulo="Integração Paraíba do Sul" icone="bi-arrow-left-right">
            <div className="rsv-paraiba text-center">
              <div className="row g-2">
                <div className="col-6">
                  <div className="rsv-resumo-card rsv-paraiba-card">
                    <i className="bi bi-water" />
                    <h5>Volume UHE Jaguari</h5>
                    {ou(d, () => <div className="rsv-valor">{d!.jaguari.ok ? num(d!.jaguari.dados.volumePct) : '--'}</div>)}
                  </div>
                </div>
                <div className="col-6">
                  <div className="rsv-resumo-card rsv-paraiba-card">
                    <i className="bi bi-arrow-left-right" />
                    <h5>Transposição Jaguari → Atibainha</h5>
                    {ou(d, () => <div className="rsv-valor">{num(d!.transposicaoM3s, 2, ' m³/s')}</div>)}
                  </div>
                </div>
              </div>
              <GraficoPesosSim />
            </div>
          </Secao>
        </div>
      </div>

      <Secao
        titulo="Transposição da Bacia do rio Paraíba do Sul"
        subtitulo="Operação da interligação Jaguari (PS) → Atibainha (SC) no ano e enquadramento no limite anual vigente."
        icone="bi-arrow-left-right"
      >
        {d ? (
          <Suspense fallback={<EsqueletoTransposicao />}>
            <TransposicaoNoAno ate={d.dataUsada} />
          </Suspense>
        ) : (
          <EsqueletoTransposicao />
        )}
      </Secao>

      <Secao titulo="Acompanhamento por sistema" icone="bi-table">
        {d ? (
          <div className="table-responsive">
            <table className="table table-striped rsv-tabela">
              <thead>
                <tr>
                  {COLUNAS(ano).map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.sistemas.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.nome}
                      {s.fonte === 'ana' && <small className="d-block text-secondary">Dado: ANA</small>}
                    </td>
                    <td>{num(s.volume)}</td>
                    <td>{num(s.volumeAnoAnterior)}</td>
                    <td className={s.difAno === null ? '' : s.difAno >= 0 ? 'rsv-pos' : 'rsv-neg'}>{num(s.difAno)}</td>
                    <td className={s.difDia === null ? '' : s.difDia >= 0 ? 'rsv-pos' : 'rsv-neg'}>{num(s.difDia)}</td>
                    <td>{num(s.chuvaDia, 1, ' mm')}</td>
                    <td>{num(s.chuvaMes, 1, ' mm')}</td>
                    <td>{num(s.chuvaMediaHistorica, 1, ' mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EsqueletoTabela colunas={COLUNAS(ano)} linhas={Object.keys(SISTEMAS).length} className="table table-striped rsv-tabela" />
        )}
      </Secao>

      <SeriesAnuais dataBase={d?.dataUsada ?? null} />
    </>
  );
}

const COLUNAS = (ano: number) => ['Sistema', 'Volume atual', `Volume ${ano}`, 'Dif. ano', 'Dif. dia', 'Chuva dia', 'Chuva mês', 'Média histórica'];
