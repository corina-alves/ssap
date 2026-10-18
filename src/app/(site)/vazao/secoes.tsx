import type { ReactNode } from 'react';
import { Esqueleto } from '@/components/carregamento';
import { EsqueletoGraficosSistemas, EsqueletoTabelaSistemas, GraficosSistemas, TabelaSistemas } from '@/components/site/graficos-sistemas';
import { Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import type { Resumo } from '@/lib/hidrologia/sistemas';

const fmt = (v: number | null | undefined, suf: string, casas = 1) =>
  v === null || v === undefined ? '--' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}${suf}`;

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
