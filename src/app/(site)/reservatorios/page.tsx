import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import { Consultando } from '@/components/carregamento';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { FiltroData } from '@/components/site/filtro-data';
import { Principal, Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { ESTAGIOS, painelReservatorios } from '@/lib/hidrologia/reservatorios';
import { hojeSp, textoReserva } from '@/lib/integracoes/comum';
import { Periodo, Secoes } from './painel';

export const metadata: Metadata = {
  title: 'Reservatórios RMSP',
  description:
    'Volume útil, precipitação, variação diária, comparação histórica e estágio do Protocolo de Escassez dos sistemas produtores da RMSP.',
};

// Uma consulta por requisição, dividida entre o status e o conteúdo.
const dados = cache(painelReservatorios);

async function Status({ data }: { data: string }) {
  const r = await dados(data);
  if (!r.ok) return <div className="sssp-status is-error">{r.mensagem}</div>;
  return (
    <div className="sssp-status is-ok">
      Dados de {dataBr(r.dados.dataUsada)}.{r.desatualizado ? ` ${textoReserva(r.fonte, r.obtidoEm)}` : ''}
    </div>
  );
}

/** Painel da data; se a SABESP falhar, o status já mostra a mensagem. */
async function Conteudo({ data }: { data: string }) {
  const r = await dados(data);
  return r.ok ? <Secoes d={r.dados} ano={r.dados.anoComparacao} /> : null;
}

export default async function Reservatorios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
      <Suspense key={data} fallback={<Secoes d={null} ano={Number(data.slice(0, 4)) - 1} />}>
        <Conteudo data={data} />
      </Suspense>
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
  );
}
