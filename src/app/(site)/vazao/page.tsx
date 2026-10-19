import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import { Consultando } from '@/components/carregamento';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { FiltroData } from '@/components/site/filtro-data';
import { Principal, Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { vazoesSistemas } from '@/lib/hidrologia/sistemas';
import { hojeSp, textoReserva } from '@/lib/integracoes/comum';
import { Periodo, Secoes } from './secoes';

export const metadata: Metadata = {
  title: 'Vazões',
  description: 'Vazão natural dos sistemas produtores da RMSP, comparada à média de longo termo.',
};

// Uma consulta por requisição, dividida entre o status e o conteúdo.
const dados = cache(vazoesSistemas);

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

export default async function Vazao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  );
}
