import type { ReactNode } from 'react';
import { Esqueleto } from '@/components/carregamento';
import { EsqueletoGraficosSistemas, EsqueletoTabelaSistemas, GraficosSistemas, TabelaSistemas } from '@/components/site/graficos-sistemas';
import { Secao } from '@/components/site/layout';
import type { Resumo } from '@/lib/hidrologia/sistemas';

const mm = (v: number | null | undefined) =>
  v === null || v === undefined ? '--' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;

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

/** Seção do filtro de data; no loading.tsx, só com o status de consulta. */
export function Periodo({ children }: { children: ReactNode }) {
  return (
    <Secao titulo="Período de análise" subtitulo="Altere a data para atualizar os indicadores, o gráfico e a tabela." icone="bi-calendar3">
      {children}
    </Secao>
  );
}

/** Resumo, gráfico e tabela; sem `d`, a mesma estrutura em esqueleto (também usada no loading.tsx). */
export function Secoes({ d, ano }: { d: Resumo | null; ano: number }) {
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
