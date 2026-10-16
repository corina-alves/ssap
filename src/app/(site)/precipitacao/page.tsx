import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import '@/styles/legado/pagina-precipitacao.css';
import { Consultando, Esqueleto } from '@/components/carregamento';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { FiltroData } from '@/components/site/filtro-data';
import { EsqueletoGraficosSistemas, EsqueletoTabelaSistemas, GraficosSistemas, TabelaSistemas } from '@/components/site/graficos-sistemas';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { chuvasSistemas, type Resumo } from '@/lib/hidrologia/sistemas';
import { hojeSp, textoReserva } from '@/lib/integracoes/comum';

export const metadata: Metadata = {
  title: 'Precipitação',
  description: 'Chuva observada nos sistemas produtores da RMSP: dia, 7 dias, mês, anos de referência e média histórica.',
};

const mm = (v: number | null | undefined) =>
  v === null || v === undefined ? '--' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;

// Uma consulta por requisição, dividida entre o status e o conteúdo.
const dados = cache(chuvasSistemas);

const CARTOES: { icone: string; titulo: string; valor: (d: Resumo) => string; legenda: (d: Resumo | null) => string }[] = [
  { icone: 'bi-cloud-rain', titulo: 'Acumulado do Dia', valor: (d) => mm(d.sim?.dia), legenda: () => 'Chuva registrada no dia — SIM' },
  { icone: 'bi-calendar-week', titulo: 'Média 7 Dias', valor: (d) => mm(d.sim?.seteDias), legenda: () => 'Acumulado dos últimos 7 dias — SIM' },
  { icone: 'bi-calendar3', titulo: 'Média Mensal', valor: (d) => mm(d.sim?.mes), legenda: () => 'Acumulado do mês — SIM' },
  { icone: 'bi-arrow-up-circle', titulo: 'Maior Chuva', valor: (d) => mm(d.maior?.dia), legenda: (d) => (d ? (d.maior?.nome ?? '--') : '') },
];

/** Cartões do resumo; sem `d`, os mesmos cartões com os valores em esqueleto. */
function Cartoes({ d }: { d: Resumo | null }) {
  return (
    <div className="pcp-cards">
      {CARTOES.map((c) => (
        <div className="pcp-card" key={c.titulo}>
          <i className={`bi ${c.icone}`} />
          <h5>{c.titulo}</h5>
          {d ? <div className="pcp-valor">{c.valor(d)}</div> : <Esqueleto className="esq-valor esq-centro" />}
          <small>{c.legenda(d) || <Esqueleto className="esq-linha esq-centro" largura="50%" />}</small>
        </div>
      ))}
    </div>
  );
}

async function Status({ data }: { data: string }) {
  const r = await dados(data);
  if (!r.ok) return <div className="sssp-status is-error">{r.mensagem}</div>;
  return (
    <div className="sssp-status is-ok">
      Dados de {dataBr(r.dados.dataUsada)}.{r.desatualizado ? ` ${textoReserva(r.fonte, r.obtidoEm)}` : ''}
    </div>
  );
}

function Secoes({ d, ano }: { d: Resumo | null; ano: number }) {
  return (
    <>
      <Secao titulo="Resumo da precipitação" subtitulo="Indicadores principais de chuva para os sistemas produtores." icone="bi-cloud-rain-heavy">
        <Cartoes d={d} />
      </Secao>

      <Secao titulo="Precipitação por sistema" subtitulo="Chuva do dia, acumulado em 7 dias, mês atual, anos de referência, média histórica e MLT." icone="bi-bar-chart">
        {d ? <GraficosSistemas d={d} tipo="chuva" /> : <EsqueletoGraficosSistemas tipo="chuva" />}
        <p className="small text-secondary mt-3 mb-0">
          MLT: chuva acumulada no mês até a data em relação à média histórica do mês inteiro — no início do mês o percentual é
          naturalmente baixo. SIM: média dos sete sistemas produtores.
        </p>
      </Secao>

      <Secao titulo="Acompanhamento das precipitações nos sistemas produtores (mm)" icone="bi-table">
        {d ? (
          <TabelaSistemas d={d} classe="pcp-tabela" rotuloDia="Chuva do dia" />
        ) : (
          <EsqueletoTabelaSistemas ano={ano} classe="pcp-tabela" rotuloDia="Chuva do dia" />
        )}
      </Secao>
    </>
  );
}

/** Indicadores, gráfico e tabela; se a SABESP falhar, o status já mostra a mensagem. */
async function Conteudo({ data }: { data: string }) {
  const r = await dados(data);
  return r.ok ? <Secoes d={r.dados} ano={Number(r.dados.dataUsada.slice(0, 4))} /> : null;
}

export default async function Precipitacao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = dataDaUrl((await searchParams).data);

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
          <FiltroData data={data} max={hojeSp()}>
            <Suspense fallback={<Consultando>Consultando a SABESP…</Consultando>}>
              <Status data={data} />
            </Suspense>
          </FiltroData>
        </Secao>

        <Suspense key={data} fallback={<Secoes d={null} ano={Number(data.slice(0, 4))} />}>
          <Conteudo data={data} />
        </Suspense>

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
