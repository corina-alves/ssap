import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@/styles/legado/pagina-reservatorios.css';
import { GraficoPesosSim, GraficoVolumeSistemas } from '@/components/graficos-php';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { FiltroData } from '@/components/site/filtro-data';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { ESTAGIOS, painelReservatorios, type LinhaSistema, type PainelReservatorios } from '@/lib/hidrologia/reservatorios';
import { hojeSp } from '@/lib/integracoes/comum';
import { SeriesAnuais, TransposicaoNoAno } from './secoes';

export const metadata: Metadata = {
  title: 'Reservatórios RMSP',
  description:
    'Volume útil, precipitação, variação diária, comparação histórica e estágio do Protocolo de Escassez dos sistemas produtores da RMSP.',
};

const num = (v: number | null, casas = 2, suf = '%') =>
  v === null ? '--' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}${suf}`;

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

export default async function Reservatorios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = dataDaUrl((await searchParams).data);
  const r = await painelReservatorios(data);

  return (
    <>
      <Hero
        kicker="Sistemas Produtores"
        titulo="Reservatórios da RMSP"
        texto="Acompanhamento dos principais sistemas produtores da Região Metropolitana de São Paulo: volume útil, precipitação, variação diária, comparação histórica e enquadramento por estágios operacionais."
        icone="bi-water"
      />
      <Principal>
        <Secao titulo="Período de análise" subtitulo="Altere a data para atualizar os dados, gráfico e a tabela." icone="bi-calendar3">
          <FiltroData
            data={data}
            max={hojeSp()}
            status={r.ok ? `Dados de ${dataBr(r.dados.dataUsada)}.${r.desatualizado ? ' (SABESP indisponível: últimos dados obtidos.)' : ''}` : undefined}
          />
          {!r.ok && <div className="sssp-status is-error">{r.mensagem}</div>}
        </Secao>
        {r.ok && <Conteudo d={r.dados} />}
        <Secao
          titulo="Estágios do Protocolo de Escassez"
          subtitulo="Classificação operacional pelo volume útil do sistema. A situação de cada sistema é indicada pela cor da borda do respectivo card."
          icone="bi-exclamation-triangle"
        >
          <ul className="rsv-estagios">
            {ESTAGIOS.map((e) => (
              <li key={e.codigo}>
                <span className={`cor is-${e.classe}`} />
                <strong>
                  {e.codigo} - {e.nome}
                </strong>
                <span>{e.faixa}</span>
              </li>
            ))}
          </ul>
        </Secao>
        <Secao titulo="Informações adicionais" icone="bi-info-circle">
          <div className="row g-3">
            <div className="col-md-6">
              <h3 className="h6">
                <i className="bi bi-water text-primary" /> Volume útil
              </h3>
              <p className="text-secondary mb-0">
                Percentual do volume operacional disponível em cada sistema. Para o Sistema Cantareira, quando disponível,
                utiliza-se o volume útil divulgado pela ANA.
              </p>
            </div>
            <div className="col-md-6">
              <h3 className="h6">
                <i className="bi bi-arrow-left-right text-primary" /> Integração Paraíba do Sul
              </h3>
              <p className="text-secondary mb-0">
                A transposição de água do rio Paraíba do Sul (Jaguari → Atibainha) reforça a disponibilidade hídrica do Sistema
                Cantareira.
              </p>
            </div>
          </div>
        </Secao>
      </Principal>
    </>
  );
}

function Conteudo({ d }: { d: PainelReservatorios }) {
  const { sim, cantareira, altoTiete } = d;
  const ano = d.anoComparacao;
  return (
    <>
      <Secao titulo="Resumo operacional" subtitulo="Visão geral dos sistemas produtores da Região Metropolitana de São Paulo." icone="bi-speedometer2">
        <div className="row g-3">
          <div className="col-md-6 col-xl-3">
            <div className="rsv-resumo-card">
              <i className="bi bi-database" />
              <h5>SIM</h5>
              <div className="rsv-valor">{num(sim?.volume ?? null)}</div>
              <small>Sistema Integrado Metropolitano</small>
            </div>
          </div>
          <div className="col-md-6 col-xl-3">
            <div className="rsv-resumo-card">
              <i className="bi bi-water" />
              <h5>Cantareira</h5>
              <div className="rsv-valor">{num(cantareira?.volume ?? null)}</div>
              <small className="rsv-fonte">Dado: {cantareira?.fonte === 'ana' ? 'ANA' : 'SABESP'}</small>
            </div>
          </div>
          <div className="col-md-6 col-xl-3">
            <div className="rsv-resumo-card">
              <i className="bi bi-water" />
              <h5>Alto Tietê</h5>
              <div className="rsv-valor">{num(altoTiete?.volume ?? null)}</div>
              <small>{altoTiete?.estagio.nome ?? '--'}</small>
            </div>
          </div>
          <div className="col-md-6 col-xl-3">
            <div className="rsv-resumo-card">
              <i className="bi bi-arrow-left-right" />
              <h5>Transposição</h5>
              <div className="rsv-valor">{num(d.transposicaoM3s, 2, ' m³/s')}</div>
              <small>Paraíba do Sul</small>
            </div>
          </div>
        </div>
      </Secao>

      <Secao titulo="Volume dos sistemas produtores" icone="bi-bar-chart-steps">
        <p className="sssp-status mb-3">
          {d.dataComparacao ? `Comparativo entre ${dataBr(d.dataUsada)} e ${dataBr(d.dataComparacao)}.` : `Sem dados de ${ano} para comparar.`}
        </p>
        <div className="rsv-cards">
          {d.sistemas.map((s) => (
            <CardSistema key={s.id} s={s} ano={ano} />
          ))}
        </div>
      </Secao>

      <div className="row g-3">
        <div className="col-lg-8">
          <Secao titulo="Comparativo de volumes" subtitulo="Volume útil por sistema, comparado ao mesmo período do ano anterior." icone="bi-graph-up">
            <div className="rsv-grafico-wrap">
              <GraficoVolumeSistemas
                labels={d.sistemas.map((s) => s.nome)}
                volAtual={d.sistemas.map((s) => s.volume)}
                volAnterior={d.sistemas.map((s) => s.volumeAnoAnterior)}
                rotuloAtual={dataBr(d.dataUsada)}
                rotuloAnterior={d.dataComparacao ? dataBr(d.dataComparacao) : String(ano)}
              />
            </div>
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
                    <div className="rsv-valor">{d.jaguari.ok ? num(d.jaguari.dados.volumePct) : '--'}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="rsv-resumo-card rsv-paraiba-card">
                    <i className="bi bi-arrow-left-right" />
                    <h5>Transposição Jaguari → Atibainha</h5>
                    <div className="rsv-valor">{num(d.transposicaoM3s, 2, ' m³/s')}</div>
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
        <Suspense fallback={<p className="sssp-status">Carregando...</p>}>
          <TransposicaoNoAno ate={d.dataUsada} />
        </Suspense>
      </Secao>

      <Secao titulo="Acompanhamento por sistema" icone="bi-table">
        <div className="table-responsive">
          <table className="table table-striped rsv-tabela">
            <thead>
              <tr>
                <th>Sistema</th>
                <th>Volume atual</th>
                <th>Volume {ano}</th>
                <th>Dif. ano</th>
                <th>Dif. dia</th>
                <th>Chuva dia</th>
                <th>Chuva mês</th>
                <th>Média histórica</th>
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
      </Secao>

      <Suspense fallback={<p className="sssp-status">Carregando as séries anuais desde 2010...</p>}>
        <SeriesAnuais dataBase={d.dataUsada} />
      </Suspense>
    </>
  );
}
