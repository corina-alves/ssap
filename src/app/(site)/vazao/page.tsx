import type { Metadata } from 'next';
import '@/styles/legado/pagina-vazao.css';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { FiltroData } from '@/components/site/filtro-data';
import { GraficosSistemas, TabelaSistemas } from '@/components/site/graficos-sistemas';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { vazoesSistemas } from '@/lib/hidrologia/sistemas';
import { hojeSp } from '@/lib/integracoes/comum';

export const metadata: Metadata = {
  title: 'Vazões',
  description: 'Vazão natural dos sistemas produtores da RMSP, comparada à média de longo termo.',
};

const fmt = (v: number | null | undefined, suf: string, casas = 1) =>
  v === null || v === undefined ? '--' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}${suf}`;

export default async function Vazao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = dataDaUrl((await searchParams).data);
  const r = await vazoesSistemas(data);
  const d = r.ok ? r.dados : null;

  return (
    <>
      <Hero
        kicker="Monitoramento Fluviométrico"
        titulo="Vazão Natural dos Sistemas Produtores"
        texto="Acompanhamento da vazão natural dos sistemas produtores da Região Metropolitana de São Paulo: vazão do dia, média dos últimos 7 dias, vazão média mensal, anos de referência, média histórica e percentual da MLT."
        icone="bi-activity"
      />
      <Principal>
        <Secao titulo="Período de análise" subtitulo="Altere a data para atualizar os indicadores, o gráfico e a tabela." icone="bi-calendar3">
          <FiltroData data={data} max={hojeSp()} status={d ? `Dados de ${dataBr(d.dataUsada)}.${r.ok && r.desatualizado ? ' (SABESP indisponível: últimos dados obtidos.)' : ''}` : undefined} />
          {!r.ok && <div className="sssp-status is-error">{r.mensagem}</div>}
        </Secao>

        {d && (
          <>
            <Secao titulo="Resumo da vazão natural" subtitulo="Cada indicador abaixo corresponde a um valor apresentado no gráfico." icone="bi-water">
              <div className="vzo-cards">
                <div className="vzo-card">
                  <i className="bi bi-water" />
                  <h5>Vazão do dia</h5>
                  <div className="vzo-valor">{fmt(d.sim?.dia, ' m³/s')}</div>
                  <small>SIM · {dataBr(d.dataUsada)}</small>
                </div>
                <div className="vzo-card">
                  <i className="bi bi-calendar3" />
                  <h5>Vazão média</h5>
                  <div className="vzo-valor">{fmt(d.sim?.mes, ' m³/s')}</div>
                  <small>SIM — média mensal</small>
                </div>
                <div className="vzo-card is-maior">
                  <i className="bi bi-arrow-up-circle" />
                  <h5>Maior vazão</h5>
                  <div className="vzo-valor">{fmt(d.maior?.dia, ' m³/s')}</div>
                  <small>{d.maior?.nome ?? '--'}</small>
                </div>
                <div className="vzo-card is-menor">
                  <i className="bi bi-arrow-down-circle" />
                  <h5>Menor vazão</h5>
                  <div className="vzo-valor">{fmt(d.menor?.dia, ' m³/s')}</div>
                  <small>{d.menor?.nome ?? '--'}</small>
                </div>
                <div className="vzo-card">
                  <i className="bi bi-bar-chart-line" />
                  <h5>MLT</h5>
                  <div className="vzo-valor">{fmt(d.sim?.mlt, '%')}</div>
                  <small>SIM — % da Média de Longo Termo</small>
                </div>
              </div>
            </Secao>

            <Secao
              titulo="Vazão natural por sistema"
              subtitulo="Vazão do dia, últimos 7 dias, média do mês, anos de referência, média histórica e MLT. O SIM é o agregado metropolitano."
              icone="bi-bar-chart"
            >
              <GraficosSistemas d={d} tipo="vazao" />
            </Secao>

            <Secao titulo="Acompanhamento da vazão natural dos sistemas produtores (m³/s)" icone="bi-table">
              <TabelaSistemas d={d} classe="vzo-tabela" rotuloDia="Vazão do dia" />
            </Secao>
          </>
        )}

        <Secao titulo="Informações adicionais" icone="bi-info-circle">
          <div className="row g-3">
            <div className="col-md-4">
              <h3 className="h6">
                <i className="bi bi-water text-primary" /> Vazão natural
              </h3>
              <p className="text-secondary mb-0">
                Representa a disponibilidade hídrica natural estimada nos sistemas produtores, auxiliando na avaliação da condição
                hidrológica.
              </p>
            </div>
            <div className="col-md-4">
              <h3 className="h6">
                <i className="bi bi-calendar-week text-primary" /> Últimos 7 dias
              </h3>
              <p className="text-secondary mb-0">
                A média semanal ajuda a identificar tendências recentes de recuperação ou redução das vazões nos mananciais.
              </p>
            </div>
            <div className="col-md-4">
              <h3 className="h6">
                <i className="bi bi-bar-chart-line text-primary" /> MLT
              </h3>
              <p className="text-secondary mb-0">
                A relação com a Média de Longo Termo permite comparar a condição atual com o comportamento histórico esperado.
              </p>
            </div>
          </div>
        </Secao>
      </Principal>
    </>
  );
}
