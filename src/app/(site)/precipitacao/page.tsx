import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import { Consultando } from '@/components/carregamento';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { FiltroData } from '@/components/site/filtro-data';
import { Principal, Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { chuvasSistemas } from '@/lib/hidrologia/sistemas';
import { hojeSp, textoReserva } from '@/lib/integracoes/comum';
import { Periodo, Secoes } from './secoes';

export const metadata: Metadata = {
  title: 'Precipitação',
  description: 'Chuva observada nos sistemas produtores da RMSP: dia, 7 dias, mês, anos de referência e média histórica.',
};

// Uma consulta por requisição, dividida entre o status e o conteúdo.
const dados = cache(chuvasSistemas);

async function Status({ data }: { data: string }) {
  const r = await dados(data);
  if (!r.ok) return <div className="sssp-status is-error">{r.mensagem}</div>;
  return (
    <div className="sssp-status is-ok">
      Dados de {dataBr(r.dados.dataUsada)}.{r.desatualizado ? ` ${textoReserva(r.fonte, r.obtidoEm)}` : ''}
    </div>
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
    <Principal>
      <Periodo>
        <FiltroData data={data} max={hojeSp()}>
          <Suspense key={data} fallback={<Consultando>Consultando a SABESP…</Consultando>}>
            <Status data={data} />
          </Suspense>
        </FiltroData>
      </Periodo>

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
  );
}
