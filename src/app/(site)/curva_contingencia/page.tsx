import type { Metadata } from 'next';
import '@/styles/legado/pagina-curva-contingencia.css';
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

function Cartao({ id, rotulo, valor, meta, icone }: { id: string; rotulo: string; valor: number | null | undefined; meta: string; icone: string }) {
  return (
    <div id={id} className="sssp-stat-card sssp-stat-card--blue">
      <div className="sssp-stat-card__icon">
        <i className={`bi ${icone}`} />
      </div>
      <div className="sssp-stat-card__content">
        <span className="sssp-stat-card__label">{rotulo}</span>
        <div className="sssp-stat-card__value">
          <strong>{pct(valor)}</strong>
          <span>%</span>
        </div>
        <small>{meta}</small>
      </div>
    </div>
  );
}

export default async function CurvaContingencia({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const d = await dadosCurva(data(sp.inicio, PERIODO_CURVA.inicio), data(sp.fim, PERIODO_CURVA.fim));
  const { ultimoSim: s, ultimoCantareira: c } = d;
  const semReferencia = (u: { data: string } | null) => (u ? `Sem referência em ${dataBr(u.data)}` : 'Sem referência');

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
              <input type="date" id="inicio" name="inicio" defaultValue={d.inicio} />
            </div>
            <div className="sssp-field">
              <label htmlFor="fim">Data final</label>
              <input type="date" id="fim" name="fim" defaultValue={d.fim} />
            </div>
            <div className="sssp-field">
              <button type="submit" className="btn btn-primary">
                <i className="bi bi-arrow-repeat me-1" /> Atualizar
              </button>
            </div>
            {d.observado.length === 0 ? (
              <div className="sssp-status is-error">Sem volume observado no período (fora do intervalo ou SABESP indisponível).</div>
            ) : (
              <div className="sssp-status is-ok">Curva completa — meta e observado do mesmo dia estão destacados.</div>
            )}
          </form>
        </Secao>

        <div className="sssp-stats-grid mb-4" aria-label="Resumo da curva de contingência">
          <Cartao id="cardObsSimWrap" rotulo="SIM" valor={s?.valor} icone="bi-water" meta={s ? `Observado em ${dataBr(s.data)}` : 'Sem dado no período'} />
          <Cartao
            id="cardObsCantWrap"
            rotulo="Cantareira"
            valor={c?.valor}
            icone="bi-droplet-half"
            meta={c ? `Observado em ${dataBr(c.data)} · Dado: ${c.fonte === 'ANA' ? 'ANA' : 'Sabesp'}` : 'Sem dado no período'}
          />
          <Cartao
            id="cardMetaSimWrap"
            rotulo="SIM"
            valor={s?.curva}
            icone="bi-bullseye"
            meta={s?.curva != null ? `Curva de contingência do mesmo dia: ${dataBr(s.data)}` : semReferencia(s)}
          />
          <Cartao
            id="cardMetaCantWrap"
            rotulo="Cantareira"
            valor={c?.curva}
            icone="bi-bezier2"
            meta={c?.curva != null ? `Curva de contingência do mesmo dia: ${dataBr(c.data)}` : semReferencia(c)}
          />
        </div>

        <Secao
          id="projecao-volume"
          titulo="Projeção de Volume — SIM e Cantareira"
          subtitulo="Curvas de contingência e volumes observados no período selecionado."
          icone="bi-graph-up"
        >
          <div style={{ position: 'relative', height: 470 }}>
            <GraficoCurvaContingencia inicio={d.inicio} fim={d.fim} curvaSim={d.curvaSim} curvaCantareira={d.curvaCantareira} observado={d.observado} fonteCantareira={d.fonteCantareira} />
          </div>
          <div className="credito-grafico mt-3 text-end">
            Volume observado — SIM: Sabesp · Cantareira: {d.fonteCantareira}. Elaborado pela Sala de Situação Alfredo Pisani
          </div>
        </Secao>
      </Principal>
    </>
  );
}
