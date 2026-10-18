import type { ReactNode } from 'react';
import { Esqueleto } from '@/components/carregamento';
import { Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import type { dadosCurva } from '@/lib/hidrologia/curva';

const pct = (v: number | null | undefined) =>
  v == null ? '--' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Cartao({ id, rotulo, valor, meta, icone }: { id: string; rotulo: string; valor?: number | null; meta?: string; icone: string }) {
  const carregando = meta === undefined;
  return (
    <div id={id} className="sssp-stat-card sssp-stat-card--blue">
      <div className="sssp-stat-card__icon">
        <i className={`bi ${icone}`} />
      </div>
      <div className="sssp-stat-card__content">
        <span className="sssp-stat-card__label">{rotulo}</span>
        <div className="sssp-stat-card__value">
          {carregando ? <Esqueleto className="esq-valor" largura="5rem" /> : <strong>{pct(valor)}</strong>}
          <span>%</span>
        </div>
        <small>{carregando ? <Esqueleto largura="80%" /> : meta}</small>
      </div>
    </div>
  );
}

/** Os quatro cartões; sem `d`, com os valores em esqueleto. */
export function Cartoes({ d }: { d: Awaited<ReturnType<typeof dadosCurva>> | null }) {
  const s = d?.ultimoSim;
  const c = d?.ultimoCantareira;
  const semReferencia = (u: { data: string } | null | undefined) => (u ? `Sem referência em ${dataBr(u.data)}` : 'Sem referência');
  return (
    <div className="sssp-stats-grid mb-4" aria-label="Resumo da curva de contingência">
      <Cartao id="cardObsSimWrap" rotulo="SIM" valor={s?.valor} icone="bi-water" meta={d ? (s ? `Observado em ${dataBr(s.data)}` : 'Sem dado no período') : undefined} />
      <Cartao
        id="cardObsCantWrap"
        rotulo="Cantareira"
        valor={c?.valor}
        icone="bi-droplet-half"
        meta={d ? (c ? `Observado em ${dataBr(c.data)} · Dado: ${c.fonte === 'ANA' ? 'ANA' : 'Sabesp'}` : 'Sem dado no período') : undefined}
      />
      <Cartao
        id="cardMetaSimWrap"
        rotulo="SIM"
        valor={s?.curva}
        icone="bi-bullseye"
        meta={d ? (s?.curva != null ? `Curva de contingência do mesmo dia: ${dataBr(s.data)}` : semReferencia(s)) : undefined}
      />
      <Cartao
        id="cardMetaCantWrap"
        rotulo="Cantareira"
        valor={c?.curva}
        icone="bi-bezier2"
        meta={d ? (c?.curva != null ? `Curva de contingência do mesmo dia: ${dataBr(c.data)}` : semReferencia(c)) : undefined}
      />
    </div>
  );
}

/** Seção do filtro de período; no loading.tsx, só com o status de consulta. */
export function Periodo({ children }: { children: ReactNode }) {
  return (
    <Secao titulo="Período de análise" subtitulo="Altere as datas para atualizar os cards e o gráfico." icone="bi-calendar3">
      {children}
    </Secao>
  );
}

/** Seção do gráfico de projeção de volume. */
export function SecaoProjecao({ children }: { children: ReactNode }) {
  return (
    <Secao
      id="projecao-volume"
      titulo="Projeção de Volume — SIM e Cantareira"
      subtitulo="Curvas de contingência e volumes observados no período selecionado."
      icone="bi-graph-up"
    >
      {children}
    </Secao>
  );
}
