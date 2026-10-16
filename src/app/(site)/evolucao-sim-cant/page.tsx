import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import { Consultando, EsqueletoGrafico } from '@/components/carregamento';
import { GraficoSerieAnual } from '@/components/graficos-php';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { serieAnual } from '@/lib/hidrologia/reservatorios';
import { hojeSp } from '@/lib/integracoes/comum';
import { ID_CANTAREIRA, ID_SIM } from '@/lib/integracoes/sabesp';

export const metadata: Metadata = {
  title: 'Evolução Histórica do Volume',
  description: 'Volume do Sistema Cantareira e do SIM na mesma data de referência de cada ano, desde 2010.',
};

const PRIMEIRO_ANO = 2010;

function ano(v: string | string[] | undefined, padrao: number, min: number, max: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : padrao;
}

// Uma consulta por série e requisição, dividida entre o gráfico e o status.
const serie = cache(serieAnual);

const SERIES = [
  { id: 'graficoCantareira', titulo: 'Sistema Cantareira', label: 'Cantareira', icone: 'bi-droplet-half', sistema: ID_CANTAREIRA, cor: '#0a4677' },
  { id: 'graficoSIM', titulo: 'Sistema Integrado Metropolitano — SIM', label: 'SIM', icone: 'bi-water', sistema: ID_SIM, cor: '#087ca4' },
];

type Consulta = { base: string; anoInicial: number };

async function Grafico({ s, base, anoInicial }: Consulta & { s: (typeof SERIES)[number] }) {
  const pontos = await serie(base, s.sistema, anoInicial);
  return (
    <div style={{ height: 430, position: 'relative' }}>
      <GraficoSerieAnual id={s.id} label={s.label} anos={pontos.map((p) => p.ano)} valores={pontos.map((p) => p.volume)} cor={s.cor} />
    </div>
  );
}

async function Status({ base, anoInicial, referencia }: Consulta & { referencia: string }) {
  const [cantareira, sim] = await Promise.all([serie(base, ID_CANTAREIRA, anoInicial), serie(base, ID_SIM, anoInicial)]);
  const semDado = cantareira.filter((p, i) => p.volume === null && sim[i]?.volume == null).map((p) => p.ano);
  const falhou = semDado.length === cantareira.length;
  return (
    <div className={`sssp-status ${falhou ? 'is-error' : 'is-ok'}`}>
      {falhou
        ? 'Não foi possível consultar a série histórica (SABESP indisponível).'
        : `Atualizado para ${referencia}. ${semDado.length ? `${semDado.length} ano(s) sem dado: ${semDado.join(', ')}.` : 'Série disponível.'}`}
    </div>
  );
}

/** Mesma consulta de api/evolucao_historica.php: o dia/mês escolhido em cada ano do intervalo. */
export default async function EvolucaoHistorica({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const hoje = hojeSp();
  const anoAtual = Number(hoje.slice(0, 4));
  const data = dataDaUrl(sp.data);
  const anoInicial = ano(sp.ano_inicial, PRIMEIRO_ANO, PRIMEIRO_ANO, anoAtual);
  const anoFinal = ano(sp.ano_final, anoAtual, anoInicial, anoAtual);

  const base = `${anoFinal}${data.slice(4)}`;
  const referencia = `${data.slice(8)}/${data.slice(5, 7)}`;

  return (
    <>
      <Hero
        kicker="Série histórica"
        titulo="Evolução Histórica do Volume Armazenado"
        texto="Compare, na mesma data de referência de cada ano, os volumes do Sistema Cantareira e do Sistema Integrado Metropolitano (SIM)."
        icone="bi-clock-history"
      />
      <Principal>
        <Secao titulo="Data de referência" subtitulo="Escolha o dia e o mês usados na comparação entre os anos." icone="bi-calendar3">
          <form className="sssp-filter-grid" method="get">
            <div className="sssp-field">
              <label htmlFor="refData">Dia e mês</label>
              <input id="refData" name="data" type="date" defaultValue={data} min={`${PRIMEIRO_ANO}-01-01`} max={hoje} />
            </div>
            <div className="sssp-field">
              <label htmlFor="anoInicial">Ano inicial</label>
              <input id="anoInicial" name="ano_inicial" type="number" min={PRIMEIRO_ANO} max={anoAtual} defaultValue={anoInicial} />
            </div>
            <div className="sssp-field">
              <label htmlFor="anoFinal">Ano final</label>
              <input id="anoFinal" name="ano_final" type="number" min={PRIMEIRO_ANO} max={anoAtual} defaultValue={anoFinal} />
            </div>
            <div className="sssp-field">
              <button type="submit" className="btn btn-primary">
                <i className="bi bi-arrow-repeat me-1" /> Atualizar
              </button>
            </div>
            <Suspense fallback={<Consultando>Consultando a série histórica…</Consultando>}>
              <Status base={base} anoInicial={anoInicial} referencia={referencia} />
            </Suspense>
          </form>
        </Secao>

        <div className="row g-4">
          {SERIES.map((s) => (
            <div key={s.id} className="col-xl-6">
              <Secao titulo={s.titulo} subtitulo="Volume útil na data de referência de cada ano." icone={s.icone}>
                <Suspense fallback={<EsqueletoGrafico altura={430} rotulo={`Carregando a série do ${s.label}…`} />}>
                  <Grafico s={s} base={base} anoInicial={anoInicial} />
                </Suspense>
              </Secao>
            </div>
          ))}
        </div>
      </Principal>
    </>
  );
}
