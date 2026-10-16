import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import '@/styles/legado/pagina-curva-contingencia.css';
import { Consultando, Esqueleto, EsqueletoGrafico } from '@/components/carregamento';
import { GraficoCurvaContingencia } from '@/components/graficos-php';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { dadosCurva, PERIODO_CURVA } from '@/lib/hidrologia/curva';
import { RE_DATA } from '@/lib/integracoes/comum';

export const metadata: Metadata = {
  title: 'Curva de Contingência',
  description: 'Projeção de volume útil do SIM e do Sistema Cantareira, comparando o observado com as curvas de referência.',
};

const data = (v: string | string[] | undefined, padrao: string) => {
  const t = (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
  return RE_DATA.test(t) && t >= '2010-01-01' && t <= '2100-12-31' ? t : padrao;
};

const pct = (v: number | null | undefined) =>
  v == null ? '--' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Uma consulta por requisição, dividida entre o status, os cartões e o gráfico.
const dados = cache(dadosCurva);

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
function Cartoes({ d }: { d: Awaited<ReturnType<typeof dadosCurva>> | null }) {
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

async function CartoesCurva({ inicio, fim }: { inicio: string; fim: string }) {
  return <Cartoes d={await dados(inicio, fim)} />;
}

async function Status({ inicio, fim }: { inicio: string; fim: string }) {
  const d = await dados(inicio, fim);
  return d.observado.length === 0 ? (
    <div className="sssp-status is-error">Sem volume observado no período (fora do intervalo ou SABESP indisponível).</div>
  ) : (
    <div className="sssp-status is-ok">Curva completa — meta e observado do mesmo dia estão destacados.</div>
  );
}

async function Grafico({ inicio, fim }: { inicio: string; fim: string }) {
  const d = await dados(inicio, fim);
  return (
    <>
      <div style={{ position: 'relative', height: 470 }}>
        <GraficoCurvaContingencia inicio={d.inicio} fim={d.fim} curvaSim={d.curvaSim} curvaCantareira={d.curvaCantareira} observado={d.observado} fonteCantareira={d.fonteCantareira} />
      </div>
      <div className="credito-grafico mt-3 text-end">
        Volume observado — SIM: Sabesp · Cantareira: {d.fonteCantareira}. Elaborado pela Sala de Situação Alfredo Pisani
      </div>
    </>
  );
}

export default async function CurvaContingencia({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  let inicio = data(sp.inicio, PERIODO_CURVA.inicio);
  let fim = data(sp.fim, PERIODO_CURVA.fim);
  // Mesma regra de dadosCurva: datas invertidas são trocadas.
  if (inicio > fim) [inicio, fim] = [fim, inicio];

  return (
    <>
      <Hero
        kicker="Planejamento e contingência"
        titulo="Curva de Contingência"
        texto="Acompanhamento da projeção de volume útil do Sistema Integrado Metropolitano (SIM) e do Sistema Cantareira, comparando os valores observados com as curvas de referência."
        icone="bi-graph-up-arrow"
      />
      <Principal>
        <Secao titulo="Período de análise" subtitulo="Altere as datas para atualizar os cards e o gráfico." icone="bi-calendar3">
          <form className="sssp-filter-grid" method="get">
            <div className="sssp-field">
              <label htmlFor="inicio">Data inicial</label>
              <input type="date" id="inicio" name="inicio" defaultValue={inicio} />
            </div>
            <div className="sssp-field">
              <label htmlFor="fim">Data final</label>
              <input type="date" id="fim" name="fim" defaultValue={fim} />
            </div>
            <div className="sssp-field">
              <button type="submit" className="btn btn-primary">
                <i className="bi bi-arrow-repeat me-1" /> Atualizar
              </button>
            </div>
            <Suspense fallback={<Consultando>Consultando os volumes observados…</Consultando>}>
              <Status inicio={inicio} fim={fim} />
            </Suspense>
          </form>
        </Secao>

        <Suspense fallback={<Cartoes d={null} />}>
          <CartoesCurva inicio={inicio} fim={fim} />
        </Suspense>

        <Secao
          id="projecao-volume"
          titulo="Projeção de Volume — SIM e Cantareira"
          subtitulo="Curvas de contingência e volumes observados no período selecionado."
          icone="bi-graph-up"
        >
          <Suspense fallback={<EsqueletoGrafico altura={470} rotulo="Carregando a projeção de volume…" />}>
            <Grafico inicio={inicio} fim={fim} />
          </Suspense>
        </Secao>
      </Principal>
    </>
  );
}
