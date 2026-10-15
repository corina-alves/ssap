import type { Metadata } from 'next';
import '@/styles/legado/pagina-precipitacao.css';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { FiltroData } from '@/components/site/filtro-data';
import { GraficosSistemas, TabelaSistemas } from '@/components/site/graficos-sistemas';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { chuvasSistemas } from '@/lib/hidrologia/sistemas';
import { hojeSp } from '@/lib/integracoes/comum';

export const metadata: Metadata = {
  title: 'Precipitação',
  description: 'Chuva observada nos sistemas produtores da RMSP: dia, 7 dias, mês, anos de referência e média histórica.',
};

const mm = (v: number | null | undefined) =>
  v === null || v === undefined ? '--' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;

export default async function Precipitacao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = dataDaUrl((await searchParams).data);
  const r = await chuvasSistemas(data);
  const d = r.ok ? r.dados : null;

  return (
    <>
      <Hero
        kicker="Monitoramento Pluviométrico"
        titulo="Precipitação dos Sistemas Produtores"
        texto="Acompanhamento da chuva observada nos sistemas produtores da Região Metropolitana de São Paulo: chuva do dia, acumulado em 7 dias, acumulado mensal, comparação com anos de referência e média histórica."
        icone="bi-cloud-rain"
      />
      <Principal>
        <Secao titulo="Período de análise" subtitulo="Altere a data para atualizar os indicadores, o gráfico e a tabela." icone="bi-calendar3">
          <FiltroData data={data} max={hojeSp()} status={d ? `Dados de ${dataBr(d.dataUsada)}.${r.ok && r.desatualizado ? ' (SABESP indisponível: últimos dados obtidos.)' : ''}` : undefined} />
          {!r.ok && <div className="sssp-status is-error">{r.mensagem}</div>}
        </Secao>

        {d && (
          <>
            <Secao titulo="Resumo da precipitação" subtitulo="Indicadores principais de chuva para os sistemas produtores." icone="bi-cloud-rain-heavy">
              <div className="pcp-cards">
                <div className="pcp-card">
                  <i className="bi bi-cloud-rain" />
                  <h5>Acumulado do Dia</h5>
                  <div className="pcp-valor">{mm(d.sim?.dia)}</div>
                  <small>Chuva registrada no dia — SIM</small>
                </div>
                <div className="pcp-card">
                  <i className="bi bi-calendar-week" />
                  <h5>Média 7 Dias</h5>
                  <div className="pcp-valor">{mm(d.sim?.seteDias)}</div>
                  <small>Acumulado dos últimos 7 dias — SIM</small>
                </div>
                <div className="pcp-card">
                  <i className="bi bi-calendar3" />
                  <h5>Média Mensal</h5>
                  <div className="pcp-valor">{mm(d.sim?.mes)}</div>
                  <small>Acumulado do mês — SIM</small>
                </div>
                <div className="pcp-card">
                  <i className="bi bi-arrow-up-circle" />
                  <h5>Maior Chuva</h5>
                  <div className="pcp-valor">{mm(d.maior?.dia)}</div>
                  <small>{d.maior?.nome ?? '--'}</small>
                </div>
              </div>
            </Secao>

            <Secao titulo="Precipitação por sistema" subtitulo="Chuva do dia, acumulado em 7 dias, mês atual, anos de referência, média histórica e MLT." icone="bi-bar-chart">
              <GraficosSistemas d={d} tipo="chuva" />
              <p className="small text-secondary mt-3 mb-0">
                MLT: chuva acumulada no mês até a data em relação à média histórica do mês inteiro — no início do mês o percentual é
                naturalmente baixo. SIM: média dos sete sistemas produtores.
              </p>
            </Secao>

            <Secao titulo="Acompanhamento das precipitações nos sistemas produtores (mm)" icone="bi-table">
              <TabelaSistemas d={d} classe="pcp-tabela" rotuloDia="Chuva do dia" />
            </Secao>
          </>
        )}

        <Secao titulo="Informações adicionais" icone="bi-info-circle">
          <div className="row g-3">
            <div className="col-md-4">
              <h3 className="h6">
                <i className="bi bi-cloud-rain-heavy text-primary" /> Chuva observada
              </h3>
              <p className="text-secondary mb-0">
                A chuva diária auxilia na avaliação da resposta hidrológica imediata dos reservatórios e das bacias de contribuição.
              </p>
            </div>
            <div className="col-md-4">
              <h3 className="h6">
                <i className="bi bi-calendar-week text-primary" /> Acumulado em 7 dias
              </h3>
              <p className="text-secondary mb-0">
                O acumulado semanal permite identificar eventos recentes de chuva e períodos de estiagem nos sistemas produtores.
              </p>
            </div>
            <div className="col-md-4">
              <h3 className="h6">
                <i className="bi bi-bar-chart-line text-primary" /> Média histórica e MLT
              </h3>
              <p className="text-secondary mb-0">
                A comparação com a média histórica (MLT) contribui para a análise da condição climatológica do mês em acompanhamento.
              </p>
            </div>
          </div>
        </Secao>
      </Principal>
    </>
  );
}
