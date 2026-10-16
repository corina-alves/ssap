import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import '@/styles/legado/pagina-vazao.css';
import { Consultando, Esqueleto } from '@/components/carregamento';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { FiltroData } from '@/components/site/filtro-data';
import { EsqueletoGraficosSistemas, EsqueletoTabelaSistemas, GraficosSistemas, TabelaSistemas } from '@/components/site/graficos-sistemas';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { vazoesSistemas, type Resumo } from '@/lib/hidrologia/sistemas';
import { hojeSp, textoReserva } from '@/lib/integracoes/comum';

export const metadata: Metadata = {
  title: 'Vazões',
  description: 'Vazão natural dos sistemas produtores da RMSP, comparada à média de longo termo.',
};

const fmt = (v: number | null | undefined, suf: string, casas = 1) =>
  v === null || v === undefined ? '--' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}${suf}`;

// Uma consulta por requisição, dividida entre o status e o conteúdo.
const dados = cache(vazoesSistemas);

const CARTOES: { classe?: string; icone: string; titulo: string; valor: (d: Resumo) => string; legenda: (d: Resumo | null) => string }[] = [
  { icone: 'bi-water', titulo: 'Vazão do dia', valor: (d) => fmt(d.sim?.dia, ' m³/s'), legenda: (d) => (d ? `SIM · ${dataBr(d.dataUsada)}` : '') },
  { icone: 'bi-calendar3', titulo: 'Vazão média', valor: (d) => fmt(d.sim?.mes, ' m³/s'), legenda: () => 'SIM — média mensal' },
  { classe: 'is-maior', icone: 'bi-arrow-up-circle', titulo: 'Maior vazão', valor: (d) => fmt(d.maior?.dia, ' m³/s'), legenda: (d) => (d ? (d.maior?.nome ?? '--') : '') },
  { classe: 'is-menor', icone: 'bi-arrow-down-circle', titulo: 'Menor vazão', valor: (d) => fmt(d.menor?.dia, ' m³/s'), legenda: (d) => (d ? (d.menor?.nome ?? '--') : '') },
  { icone: 'bi-bar-chart-line', titulo: 'MLT', valor: (d) => fmt(d.sim?.mlt, '%'), legenda: () => 'SIM — % da Média de Longo Termo' },
];

/** Cartões do resumo; sem `d`, os mesmos cartões com os valores em esqueleto. */
function Cartoes({ d }: { d: Resumo | null }) {
  return (
    <div className="vzo-cards">
      {CARTOES.map((c) => (
        <div className={`vzo-card${c.classe ? ` ${c.classe}` : ''}`} key={c.titulo}>
          <i className={`bi ${c.icone}`} />
          <h5>{c.titulo}</h5>
          {d ? <div className="vzo-valor">{c.valor(d)}</div> : <Esqueleto className="esq-valor esq-centro" />}
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
      <Secao titulo="Resumo da vazão natural" subtitulo="Cada indicador abaixo corresponde a um valor apresentado no gráfico." icone="bi-water">
        <Cartoes d={d} />
      </Secao>

      <Secao
        titulo="Vazão natural por sistema"
        subtitulo="Vazão do dia, últimos 7 dias, média do mês, anos de referência, média histórica e MLT. O SIM é o agregado metropolitano."
        icone="bi-bar-chart"
      >
        {d ? <GraficosSistemas d={d} tipo="vazao" /> : <EsqueletoGraficosSistemas tipo="vazao" />}
      </Secao>

      <Secao titulo="Acompanhamento da vazão natural dos sistemas produtores (m³/s)" icone="bi-table">
        {d ? (
          <TabelaSistemas d={d} classe="vzo-tabela" rotuloDia="Vazão do dia" />
        ) : (
          <EsqueletoTabelaSistemas ano={ano} classe="vzo-tabela" rotuloDia="Vazão do dia" />
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

export default async function Vazao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = dataDaUrl((await searchParams).data);

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
