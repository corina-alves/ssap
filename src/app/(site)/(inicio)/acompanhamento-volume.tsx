import Link from 'next/link';
import { cache, Suspense } from 'react';
import { Esqueleto, EsqueletoGrafico } from '@/components/carregamento';
import { GraficoCantareiraHome, GraficoResumoSistemas } from '@/components/graficos-php';
import { dataBr } from '@/lib/formato';
import { serieAnual } from '@/lib/hidrologia/reservatorios';
import { ID_CANTAREIRA } from '@/lib/integracoes/sabesp';
import { painelHoje } from './dados-inicio';

const fmt = (v: number | null | undefined, suf = '') =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suf}`;

/** Faixa de volume de cada estágio, para o cartão "Situação atual". */
const FAIXA_ESTAGIO: Record<string, string> = { E0: '≥ 60%', E1: '40% – 60%', E2: '30% – 40%', E3: '20% – 30%', E4: '< 20%' };
const FONTE = 'SSD SP-Águas/Sabesp';

/** Série do Cantareira (mesmo dia e mês desde 2010) na data do painel; null se o painel falhou. */
const serieCantareira = cache(async () => {
  const r = await painelHoje();
  if (!r.ok) return null;
  const serie = await serieAnual(r.dados.dataUsada, ID_CANTAREIRA);
  const validos = serie.flatMap((p) => (p.volume === null ? [] : [{ ano: p.ano, volume: p.volume }]));
  const maior = validos.reduce<(typeof validos)[number] | null>((m, p) => (!m || p.volume > m.volume ? p : m), null);
  const menor = validos.reduce<(typeof validos)[number] | null>((m, p) => (!m || p.volume < m.volume ? p : m), null);
  return { serie, maior, menor };
});

function Indisponivel({ mensagem }: { mensagem: string }) {
  return (
    <p className="text-secondary small my-3">
      <i className="bi bi-cloud-slash me-1" />
      {mensagem}
    </p>
  );
}

/** Rodapé do gráfico do Cantareira; sem `periodo`, o período em esqueleto. */
function Rodape({ periodo }: { periodo?: string }) {
  return (
    <ul className="vol-rodape">
      <li>
        <i className="bi bi-calendar3" />
        <div>
          <small>Período</small>
          <strong>{periodo ?? <Esqueleto largura="5rem" />}</strong>
        </div>
      </li>
      <li>
        <i className="bi bi-graph-up" />
        <div>
          <small>Fonte</small>
          <strong>{FONTE}</strong>
        </div>
      </li>
      <li>
        <i className="bi bi-info-circle" />
        <small>Valores referentes ao mesmo dia e mês de cada ano.</small>
      </li>
    </ul>
  );
}

async function ResumoSistemas() {
  const r = await painelHoje();
  if (!r.ok) return <Indisponivel mensagem={r.mensagem} />;
  const d = r.dados;
  return (
    <>
      <div className="grafico-resumo-wrapper">
        <GraficoResumoSistemas
          cantareira={d.cantareira?.volume ?? null}
          cantareiraAna={d.cantareira?.fonte === 'ana'}
          altoTiete={d.altoTiete?.volume ?? null}
          sim={d.sim?.volume ?? null}
        />
      </div>
      <div className="resumo-atualizacao">Dados de {dataBr(d.dataUsada)}</div>
    </>
  );
}

async function GraficoCantareira() {
  const s = await serieCantareira();
  if (!s) {
    const r = await painelHoje();
    return <Indisponivel mensagem={r.ok ? 'Série histórica indisponível no momento.' : r.mensagem} />;
  }
  return (
    <>
      <div className="vol-grafico">
        <GraficoCantareiraHome pontos={s.serie.map((p) => ({ ano: p.ano, volume: p.volume }))} />
      </div>
      <Rodape periodo={`${s.serie[0]?.ano} – ${s.serie.at(-1)?.ano}`} />
    </>
  );
}

async function IndicadoresCantareira() {
  const r = await painelHoje();
  if (!r.ok) return <Indisponivel mensagem={r.mensagem} />;
  const d = r.dados;
  const c = d.cantareira;
  return (
    <>
      <p>
        Dados de {dataBr(d.dataUsada)} • Fonte: {FONTE}
      </p>
      {c ? (
        <>
          <div className={`vol-ind vol-ind--situacao vol-ind--${c.estagio.classe}`}>
            <i className={`bi ${c.estagio.codigo === 'E0' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} />
            <div>
              <small>
                Situação atual · {fmt(c.volume, '%')}
                {c.fonte === 'ana' && ' · Dado: ANA'}
              </small>
              <strong>{c.estagio.nome}</strong>
              <span>Faixa: {FAIXA_ESTAGIO[c.estagio.codigo]}</span>
            </div>
          </div>
          {c.difAno !== null && (
            <div className={`vol-ind vol-ind--variacao ${c.difAno >= 0 ? 'vol-ind--sobe' : 'vol-ind--desce'}`}>
              <i className={`bi ${c.difAno >= 0 ? 'bi-arrow-up' : 'bi-arrow-down'}`} />
              <div>
                <small>Variação em relação a {d.anoComparacao}</small>
                <strong>
                  {c.difAno > 0 ? '+' : ''}
                  {fmt(c.difAno)} p.p.
                </strong>
              </div>
            </div>
          )}
          <div className="vol-ind">
            <i className="bi bi-calendar3" />
            <div>
              <small>Mesmo período de {d.anoComparacao}</small>
              <strong>{fmt(c.volumeAnoAnterior, '%')}</strong>
            </div>
          </div>
        </>
      ) : (
        <div className="vol-ind">
          <i className="bi bi-cloud-slash" />
          <div>
            <small>Sem dado do Cantareira para esta data.</small>
          </div>
        </div>
      )}
    </>
  );
}

async function ExtremosSerie() {
  const s = await serieCantareira();
  if (!s) return null;
  const { maior, menor } = s;
  return (
    <>
      {maior && (
        <div className="vol-ind vol-ind--sobe">
          <i className="bi bi-arrow-up" />
          <div>
            <small>Maior valor da série</small>
            <strong>{fmt(maior.volume, '%')}</strong>
            <span>em {maior.ano}</span>
          </div>
        </div>
      )}
      {menor && (
        <div className="vol-ind vol-ind--desce">
          <i className="bi bi-arrow-down" />
          <div>
            <small>Menor valor da série</small>
            <strong>{fmt(menor.volume, '%')}</strong>
            <span>em {menor.ano}</span>
          </div>
        </div>
      )}
    </>
  );
}

/** Indicador em esqueleto, com o tamanho de um .vol-ind. */
const IndicadorEsqueleto = () => (
  <div className="vol-ind">
    <i className="bi bi-hourglass-split" />
    <div className="flex-grow-1">
      <Esqueleto largura="70%" />
      <Esqueleto className="esq-valor" largura="45%" />
    </div>
  </div>
);

/**
 * Página inicial — "Acompanhamento de Volume": principais sistemas e evolução do
 * Cantareira. Os cartões aparecem na hora; gráficos e indicadores chegam cada um
 * quando a sua consulta termina (painel do dia e, depois, a série histórica).
 */
export function AcompanhamentoVolume() {
  return (
    <div className="row g-3 align-items-stretch">
      <div className="col-xl-3 col-lg-4">
        <div className="dashboard-card vol-sistemas">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title">
              <i className="bi bi-bar-chart-fill" />
              <h3>Principais Sistemas</h3>
            </div>
          </div>
          <div className="dashboard-card-body">
            <div className="resumo-chart-intro">
              <strong>Volume útil atual</strong>
              <small>Comparativo dos volumes úteis atuais dos principais sistemas metropolitanos.</small>
            </div>
            <Suspense
              fallback={
                <>
                  <EsqueletoGrafico className="grafico-resumo-wrapper" altura="auto" rotulo="Carregando o volume dos sistemas…" />
                  <div className="resumo-atualizacao">
                    <Esqueleto largura="40%" />
                  </div>
                </>
              }
            >
              <ResumoSistemas />
            </Suspense>
          </div>
        </div>
      </div>
      <div className="col-xl-9 col-lg-8">
        <div className="vol-cantareira">
          <div className="vol-cantareira__cabeca">
            <i className="bi bi-graph-up" />
            <div>
              <h3>Evolução do Volume – Cantareira</h3>
              <p>Série histórica do volume útil (mesmo dia e mês de cada ano).</p>
            </div>
            <span>Histórico comparativo</span>
          </div>
          <div className="vol-cantareira__corpo">
            <div className="vol-cantareira__grafico">
              <Suspense
                fallback={
                  <>
                    <div className="vol-grafico">
                      <div className="esq esq-grafico" style={{ position: 'absolute', inset: 14 }} role="status" aria-label="Carregando a série histórica do Cantareira…" />
                    </div>
                    <Rodape />
                  </>
                }
              >
                <GraficoCantareira />
              </Suspense>
            </div>
            <aside className="vol-indicadores">
              <h4>Sistema Cantareira</h4>
              <Suspense
                fallback={
                  <>
                    <p>
                      <Esqueleto largura="80%" />
                    </p>
                    <IndicadorEsqueleto />
                    <IndicadorEsqueleto />
                  </>
                }
              >
                <IndicadoresCantareira />
              </Suspense>
              <div className="vol-ind-par">
                <Suspense
                  fallback={
                    <>
                      <IndicadorEsqueleto />
                      <IndicadorEsqueleto />
                    </>
                  }
                >
                  <ExtremosSerie />
                </Suspense>
              </div>
              <Link href="/reservatorios" className="vol-botao">
                Ver reservatórios <i className="bi bi-chevron-right" />
              </Link>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
