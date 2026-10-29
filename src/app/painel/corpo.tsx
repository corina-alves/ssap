import Link from 'next/link';
import { cache, Suspense, type CSSProperties, type ReactNode } from 'react';
import { Esqueleto } from '@/components/carregamento';
import areas from '@/conteudo/sistemas-produtores-areas.json';
import { dataBr, dataHora } from '@/lib/formato';
import { captacaoMensal } from '@/lib/hidrologia/painel';
import { ESTAGIOS, painelReservatorios, type LinhaSistema } from '@/lib/hidrologia/reservatorios';
import { chuvasSistemas, vazoesSistemas, type Resumo } from '@/lib/hidrologia/sistemas';
import type { Contorno } from '@/lib/integracoes/ibge';
import { ID_SIM, SISTEMAS } from '@/lib/integracoes/sabesp';
import { transposicaoAno } from '@/lib/integracoes/ssd';
import { GraficoComparativo, GraficoParticipacao, GraficoTransposicao, GraficoVolume, MedidorTransposicao, type LinhaComparativo } from './graficos';
import { MapaPainel } from './mapa';

/**
 * Corpo do Painel de Situação Hídrica (tudo abaixo do topo). O /painel público
 * mostra tudo numa tela (CorpoPainel); o painel interativo da área restrita
 * reparte as mesmas seções em páginas.
 */

// cores das faixas do Protocolo de Escassez (as mesmas do painel PHP)
const CORES_ESTAGIO: Record<string, string> = { normal: '#198754', atencao: '#f4b400', alerta: '#e08600', critico: '#dc3545', emergencia: '#800080' };
const corEstagio = (classe: string | undefined) => (classe && CORES_ESTAGIO[classe]) || '#6c7f91';

// produtores na ordem do painel, SIM por último
const ORDEM = Object.keys(SISTEMAS).map(Number);
const posicao = (id: number) => (id === ID_SIM ? 99 : ORDEM.indexOf(id));

const fmt = (v: number | null | undefined, casas = 1, suf = '') =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + suf;

/**
 * As cinco fontes do painel (porte de painel/index.php?ajax=dados), disparadas
 * juntas uma vez por requisição. Cada cartão espera só a(s) que usa: uma fonte
 * lenta atrasa os seus cartões, não o painel inteiro.
 */
export const fontes = cache((data: string) => ({
  volume: painelReservatorios(data),
  chuva: chuvasSistemas(data),
  vazao: vazoesSistemas(data),
  transposicao: transposicaoAno(data),
  captacao: captacaoMensal(data),
}));

async function volumeDe(data: string) {
  const r = await fontes(data).volume;
  return r.ok ? r.dados : null;
}
async function chuvaDe(data: string) {
  const r = await fontes(data).chuva;
  return r.ok ? r.dados : null;
}
async function vazaoDe(data: string) {
  const r = await fontes(data).vazao;
  return r.ok ? r.dados : null;
}
async function transposicaoDe(data: string) {
  const r = await fontes(data).transposicao;
  return r.ok ? r.dados : null;
}

const ordenar = (sistemas: LinhaSistema[]) => [...sistemas].sort((a, b) => posicao(a.id) - posicao(b.id));
const linhaDe = (d: Resumo | null, id: number) => (id === ID_SIM ? d?.sim : d?.produtores.find((l) => l.id === id)) ?? null;

function Kpi({ rotulo, valor, sub, cor }: { rotulo: string; valor?: string; sub?: string; cor: string }) {
  return (
    <div className="pnl-kpi" style={{ '--kpi': cor } as CSSProperties}>
      <small>{rotulo}</small>
      <div className="v">{valor ?? <Esqueleto className="esq-valor" largura="60%" />}</div>
      <div className="sub">{sub ?? <Esqueleto largura="80%" />}</div>
    </div>
  );
}

function Estagio({ s }: { s: LinhaSistema }) {
  return <span className={`pnl-estagio is-${s.estagio.classe}`}>{s.estagio.nome}</span>;
}

function Dif({ v }: { v: number | null }) {
  if (v === null) return <td>—</td>;
  return (
    <td className={v >= 0 ? 'pnl-pos' : 'pnl-neg'}>
      {v >= 0 ? '+' : '−'}
      {fmt(Math.abs(v), 1)} p.p.
    </td>
  );
}

/** Área de gráfico em esqueleto, ocupando o lugar do .pnl-chart. */
const GraficoEsqueleto = ({ className = 'pnl-chart' }: { className?: string }) => <div className={`${className} esq`} role="status" aria-label="Carregando…" />;

function Cartao({ classe, icone, titulo, children }: { classe: string; icone: string; titulo: ReactNode; children: ReactNode }) {
  return (
    <div className={`pnl-card ${classe}`}>
      <h2>
        <i className={`bi ${icone}`} /> {titulo}
      </h2>
      {children}
    </div>
  );
}

// --- topo e avisos ---------------------------------------------------------

export async function DataReferencia({ data }: { data: string }) {
  const v = await volumeDe(data);
  return <strong>{dataBr(v?.dataUsada ?? data)}</strong>;
}

/** Fontes com erro e fontes servidas da reserva (com a data e hora da cópia). */
async function Avisos({ data }: { data: string }) {
  const f = fontes(data);
  const todas = await Promise.all([f.volume, f.chuva, f.vazao, f.transposicao]);
  const falhas = todas.flatMap((d) => (d.ok ? [] : [d.mensagem]));
  const reserva = new Map(todas.flatMap((d) => (d.ok && d.desatualizado ? [[d.fonte, d.obtidoEm] as const] : [])));
  return (
    <>
      {falhas.length > 0 && (
        <div className="pnl-status is-erro" role="status">
          {falhas.join(' ')}
        </div>
      )}
      {reserva.size > 0 && (
        <div className="pnl-status" role="status">
          Fonte sem resposta agora ({[...reserva].map(([fonte, em]) => `${fonte}, cópia de ${dataHora(em)}`).join('; ')}): o painel mostra a última cópia obtida.
        </div>
      )}
    </>
  );
}

// --- indicadores -----------------------------------------------------------

async function KpiJaguari({ data }: { data: string }) {
  const v = await volumeDe(data);
  return <Kpi rotulo="Volume UHE Jaguari (PS)" valor={v?.jaguari.ok ? fmt(v.jaguari.dados.volumePct, 2, '%') : '—'} sub="reservatório do Paraíba do Sul · Dado: ANA" cor="#12a8d2" />;
}

async function KpiTransferencia({ data }: { data: string }) {
  const v = await volumeDe(data);
  return <Kpi rotulo="Transferência — Paraíba do Sul" valor={fmt(v?.transposicaoM3s, 2, ' m³/s')} sub="transposição atual" cor="#12a8d2" />;
}

async function KpiTransposicao({ data }: { data: string }) {
  const t = await transposicaoDe(data);
  return (
    <Kpi
      rotulo="Transposição Paraíba do Sul"
      valor={fmt(t?.acumuladoHm3, 2, ' hm³')}
      sub={t?.limite ? `restam ${fmt(t.limite.restanteHm3, 0)} hm³ de ${fmt(t.limite.vigente, 0)}` : `ano ${t?.ano ?? data.slice(0, 4)}`}
      cor="#7c5cff"
    />
  );
}

async function KpiChuva({ data }: { data: string }) {
  const p = await chuvaDe(data);
  return <Kpi rotulo="Chuva do dia — SIM" valor={fmt(p?.sim?.dia, 1, ' mm')} sub="média dos sistemas produtores" cor={COR_CHUVA_DIA} />;
}

async function KpiChuvaMes({ data }: { data: string }) {
  const p = await chuvaDe(data);
  return <Kpi rotulo="Chuva do mês — SIM" valor={fmt(p?.sim?.mes, 1, ' mm')} sub={`acumulado de ${dataBr(p?.dataUsada ?? data).slice(3)}`} cor={COR_CHUVA_MES} />;
}

async function KpiVazao({ data }: { data: string }) {
  const q = await vazaoDe(data);
  return <Kpi rotulo="Vazão natural do dia — SIM" valor={fmt(q?.sim?.dia, 1, ' m³/s')} sub={`em ${dataBr(q?.dataUsada ?? data)}`} cor={COR_VAZAO} />;
}

const COR_CHUVA_DIA = '#e08600';
const COR_CHUVA_MES = '#f0a94e';
const COR_VAZAO = '#1aa564';

/** Cards de volume: o SIM primeiro, depois os produtores na ordem do painel. */
const simPrimeiro = (sistemas: LinhaSistema[]) => [...sistemas.filter((s) => s.id === ID_SIM), ...ordenar(sistemas).filter((s) => s.id !== ID_SIM)];

async function CartoesSistemas({ data, links }: { data: string; links?: Record<number, string> }) {
  const v = await volumeDe(data);
  const ano = v?.anoComparacao ?? Number(data.slice(0, 4)) - 1;
  return (
    <>
      {simPrimeiro(v?.sistemas ?? []).map((s) => {
        const estilo = { '--e': corEstagio(s.estagio.classe) } as CSSProperties;
        const conteudo = (
          <>
            <small>{s.nome}</small>
            <div className="v">{fmt(s.volume, 2, '%')}</div>
            {s.fonte === 'ana' && <small className="pnl-fonte">Dado: ANA</small>}
            <Estagio s={s} />
            {s.difAno !== null && (
              <div className={`dif ${s.difAno >= 0 ? 'up' : 'down'}`}>
                {s.difAno >= 0 ? '▲' : '▼'} {fmt(Math.abs(s.difAno), 1)} p.p. vs {ano}
              </div>
            )}
          </>
        );
        const href = links?.[s.id];
        return href ? (
          <Link className="pnl-sist-card is-link" key={s.id} href={href} style={estilo} title={`Análise do sistema ${s.nome}`}>
            {conteudo}
          </Link>
        ) : (
          <div className="pnl-sist-card" key={s.id} style={estilo}>
            {conteudo}
          </div>
        );
      })}
    </>
  );
}

// --- cartões da grade ------------------------------------------------------

/** Mapa: estágio (volume), chuva, vazão e captação × outorga de cada sistema. */
async function Mapa({ data }: { data: string }) {
  const f = fontes(data);
  const [v, p, q, captacao] = await Promise.all([volumeDe(data), chuvaDe(data), vazaoDe(data), f.captacao]);
  const produtores = ordenar(v?.sistemas ?? []).filter((s) => s.id !== ID_SIM);
  const mapa = produtores.flatMap((s) => {
    const area = areas.features.find((f) => f.properties.sistema === s.nome)?.geometry.coordinates as Contorno | undefined;
    if (!area) return [];
    const o = captacao.find((c) => c.id === s.id);
    const captado = o?.captadoMes == null ? '—' : `${fmt(o.captadoMes, 1, ' m³/s')}${o.pctOutorga !== null ? ` · ${fmt(o.pctOutorga, 0)}% da outorga` : ''}`;
    return [
      {
        nome: s.nome,
        area,
        cor: corEstagio(s.estagio.classe),
        linhas: [
          ['Volume do sistema', `${fmt(s.volume, 1, '%')}${s.fonte === 'ana' ? ' (Dado: ANA)' : ''}`],
          ['Estágio', s.estagio.nome],
          ['Chuva do dia', fmt(linhaDe(p, s.id)?.dia ?? s.chuvaDia, 1, ' mm')],
          ['Vazão do dia', fmt(linhaDe(q, s.id)?.dia, 1, ' m³/s')],
          ['Outorga', o ? fmt(o.outorga, 1, ' m³/s') : '—'],
          ['Captado no mês', captado],
        ] as [string, string][],
      },
    ];
  });
  return <MapaPainel sistemas={mapa} chave={JSON.stringify(mapa.map((s) => [s.cor, s.linhas]))} />;
}

const LegendaFaixas = ({ comCodigo = false }: { comCodigo?: boolean }) => (
  <div className={`pnl-legenda${comCodigo ? ' pnl-legenda--faixas' : ''}`}>
    {ESTAGIOS.map((e) => (
      <span key={e.codigo}>
        <i className={`is-${e.classe}`} />
        {comCodigo ? `${e.codigo} · ${e.nome}` : e.nome}
      </span>
    ))}
  </div>
);

async function CartaoVolume({ data }: { data: string }) {
  const v = await volumeDe(data);
  const ano = v?.anoComparacao ?? Number(data.slice(0, 4)) - 1;
  const produtores = ordenar(v?.sistemas ?? []).filter((s) => s.id !== ID_SIM);
  const dataRef = dataBr(v?.dataUsada ?? data);
  return (
    <Cartao classe="pnl-card--vol" icone="bi-bar-chart-fill" titulo={`Volume útil por sistema — atual × ${ano} (%)`}>
      <div className="pnl-chart">
        <GraficoVolume
          labels={produtores.map((s) => (s.fonte === 'ana' ? [s.nome, 'Dado: ANA'] : s.nome))}
          atual={produtores.map((s) => s.volume)}
          anterior={produtores.map((s) => s.volumeAnoAnterior)}
          cores={produtores.map((s) => corEstagio(s.estagio.classe))}
          rotuloAtual={dataRef}
          rotuloAnterior={v?.dataComparacao ? dataBr(v.dataComparacao) : String(ano)}
        />
      </div>
      <LegendaFaixas comCodigo />
    </Cartao>
  );
}

const comparativo = (d: Resumo | null): LinhaComparativo[] =>
  (d?.produtores ?? []).map((l) => ({
    sistema: l.nome,
    dia: l.dia,
    seteDias: l.seteDias,
    mes: l.mes,
    refs: d!.anosReferencia.map((a) => l.refs[a] ?? null),
    mediaHistorica: l.mediaHistorica,
    mlt: l.mlt,
  }));

async function GraficoChuvaVazao({ data, tipo }: { data: string; tipo: 'chuva' | 'vazao' }) {
  const d = tipo === 'chuva' ? await chuvaDe(data) : await vazaoDe(data);
  return (
    <div className="pnl-chart">
      <GraficoComparativo tipo={tipo} linhas={comparativo(d)} anosReferencia={d?.anosReferencia ?? []} dataBr={dataBr(d?.dataUsada ?? data)} />
    </div>
  );
}

async function CartaoTransposicao({ data }: { data: string }) {
  const t = await transposicaoDe(data);
  return (
    <>
      <div className="pnl-transp-row">
        <div className="pnl-transp-tabela">
          <h3>Operação no ano atual — {t?.ano ?? '--'}</h3>
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Vazão média bombeada (m³/s)</th>
              </tr>
            </thead>
            <tbody>
              {t?.meses.length ? (
                <>
                  {t.meses.map((m) => (
                    <tr key={m.mes}>
                      <td>{m.nome}</td>
                      <td>{fmt(m.mediaM3s, 1)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total / média</td>
                    <td>{fmt(t.mediaAnoM3s, 1)}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={2}>Sem operação registrada no ano.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pnl-chart pnl-transp-linha">
          <GraficoTransposicao meses={t?.meses ?? []} />
        </div>
        <div className="pnl-transp-gauge">
          <MedidorTransposicao acumulado={t?.acumuladoHm3 ?? 0} vigente={t?.limite?.vigente ?? null} anterior={t?.limite?.anterior ?? null} />
          <div className="pnl-gauge-num">
            <strong>{fmt(t?.acumuladoHm3, 1)}</strong>
            <span>hm³ no ano</span>
          </div>
        </div>
      </div>
      {t && (
        <div className="pnl-transp-info">
          {t.limite && (
            <>
              Acumulado no ano: <strong>{fmt(t.acumuladoHm3, 1)} hm³</strong> · Limite {t.ano}: <strong>{fmt(t.limite.vigente, 2)} hm³</strong> · restam{' '}
              <strong>{fmt(t.limite.restanteHm3, 1)} hm³</strong> ({t.limite.doc})
            </>
          )}
          {t.atualizadoEm && `${t.limite ? ' · atualizado' : 'Atualizado'} em ${dataBr(t.atualizadoEm)}`}
        </div>
      )}
    </>
  );
}

const colunasTabela = (ano: number) => ['Sistema', 'Volume útil', `Dif. ${ano}`, 'Dif. dia', 'Estágio', 'Chuva do dia', 'Chuva do mês', 'Média hist. chuva', 'MLT chuva', 'Vazão do dia', 'MLT vazão'];

function Tabela({ ano, children }: { ano: number; children: ReactNode }) {
  return (
    <div className="pnl-tabela-wrap">
      <table id="pnlTabela">
        <thead>
          <tr>
            {colunasTabela(ano).map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

async function TabelaSistemas({ data }: { data: string }) {
  const [v, p, q] = await Promise.all([volumeDe(data), chuvaDe(data), vazaoDe(data)]);
  const sistemas = ordenar(v?.sistemas ?? []);
  return (
    <Tabela ano={v?.anoComparacao ?? Number(data.slice(0, 4)) - 1}>
      {sistemas.length === 0 && (
        <tr>
          <td colSpan={11}>Sem dados.</td>
        </tr>
      )}
      {sistemas.map((s) => {
        const ehSim = s.id === ID_SIM;
        const c = linhaDe(p, s.id);
        const z = linhaDe(q, s.id);
        // Chuva do SIM: média dos produtores; nos demais, o valor do próprio sistema.
        return (
          <tr key={s.id} className={ehSim ? 'pnl-sim' : undefined}>
            <td>{s.nome}</td>
            <td>
              {fmt(s.volume, 1, '%')}
              {s.fonte === 'ana' && <small className="pnl-fonte"> Dado: ANA</small>}
            </td>
            <Dif v={s.difAno} />
            <Dif v={s.difDia} />
            <td>
              <Estagio s={s} />
            </td>
            <td>{fmt(ehSim ? c?.dia : (s.chuvaDia ?? c?.dia), 1, ' mm')}</td>
            <td>{fmt(ehSim ? c?.mes : (s.chuvaMes ?? c?.mes), 1, ' mm')}</td>
            <td>{fmt(ehSim ? c?.mediaHistorica : (s.chuvaMediaHistorica ?? c?.mediaHistorica), 1, ' mm')}</td>
            <td>{fmt(c?.mlt, 0, '%')}</td>
            <td>{fmt(z?.dia, 1, ' m³/s')}</td>
            <td>{fmt(z?.mlt, 0, '%')}</td>
          </tr>
        );
      })}
    </Tabela>
  );
}

// --- seções (o /painel monta todas; o painel interativo, uma página para cada grupo)

/** Avisos de fonte com erro ou servida da reserva. */
export const AvisosPainel = ({ data }: { data: string }) => (
  <Suspense fallback={null}>
    <Avisos data={data} />
  </Suspense>
);

/** Cards de volume (SIM primeiro); com `links` (id do sistema → endereço), cada card vira um link. */
export function SistemasPainel({ data, links }: { data: string; links?: Record<number, string> }) {
  return (
    <section className="pnl-sistemas">
      <Suspense
        fallback={Object.entries(SISTEMAS)
          .sort(([a], [b]) => Number(Number(b) === ID_SIM) - Number(Number(a) === ID_SIM))
          .map(([id, nome]) => (
            <div className="pnl-sist-card" key={id}>
              <small>{nome}</small>
              <Esqueleto className="esq-valor" largura="70%" />
              <Esqueleto largura="50%" />
            </div>
          ))}
      >
        <CartoesSistemas data={data} links={links} />
      </Suspense>
    </section>
  );
}

export const KpisChuvaVazao = ({ data }: { data: string }) => (
  <Cartao classe="pnl-grupo" icone="bi-cloud-rain-heavy-fill" titulo="Chuva e vazão natural — SIM">
    <div className="pnl-grupo-itens">
      <Suspense fallback={<Kpi rotulo="Chuva do dia — SIM" cor={COR_CHUVA_DIA} />}>
        <KpiChuva data={data} />
      </Suspense>
      <Suspense fallback={<Kpi rotulo="Chuva do mês — SIM" cor={COR_CHUVA_MES} />}>
        <KpiChuvaMes data={data} />
      </Suspense>
      <Suspense fallback={<Kpi rotulo="Vazão natural do dia — SIM" cor={COR_VAZAO} />}>
        <KpiVazao data={data} />
      </Suspense>
    </div>
  </Cartao>
);

export const KpisParaiba = ({ data }: { data: string }) => (
  <Cartao classe="pnl-grupo" icone="bi-arrow-left-right" titulo="Paraíba do Sul">
    <div className="pnl-grupo-itens">
      <Suspense fallback={<Kpi rotulo="Volume UHE Jaguari (PS)" cor="#12a8d2" />}>
        <KpiJaguari data={data} />
      </Suspense>
      <Suspense fallback={<Kpi rotulo="Transferência — Paraíba do Sul" cor="#12a8d2" />}>
        <KpiTransferencia data={data} />
      </Suspense>
      <Suspense fallback={<Kpi rotulo="Transposição Paraíba do Sul" cor="#7c5cff" />}>
        <KpiTransposicao data={data} />
      </Suspense>
    </div>
  </Cartao>
);

// cartões da grade (.pnl-grid)

export const SecaoMapa = ({ data }: { data: string }) => (
  <Cartao classe="pnl-card--mapa" icone="bi-geo-alt-fill" titulo="Sistemas produtores">
    <Suspense fallback={<div className="esq" style={{ flex: 1, minHeight: 'clamp(180px, 22vh, 340px)', borderRadius: 12 }} role="status" aria-label="Carregando o mapa…" />}>
      <Mapa data={data} />
    </Suspense>
    <LegendaFaixas />
  </Cartao>
);

export const SecaoVolume = ({ data }: { data: string }) => (
  <Suspense
    fallback={
      <Cartao classe="pnl-card--vol" icone="bi-bar-chart-fill" titulo={`Volume útil por sistema — atual × ${Number(data.slice(0, 4)) - 1} (%)`}>
        <GraficoEsqueleto />
        <LegendaFaixas comCodigo />
      </Cartao>
    }
  >
    <CartaoVolume data={data} />
  </Suspense>
);

export const SecaoParticipacao = () => (
  <Cartao classe="pnl-card--pizza" icone="bi-pie-chart-fill" titulo="Participação no SIM">
    <div className="pnl-chart">
      <GraficoParticipacao />
    </div>
  </Cartao>
);

export const SecaoChuva = ({ data }: { data: string }) => (
  <Cartao classe="pnl-card--wide" icone="bi-cloud-rain-heavy-fill" titulo="Precipitação do dia (mm)">
    <Suspense fallback={<GraficoEsqueleto />}>
      <GraficoChuvaVazao data={data} tipo="chuva" />
    </Suspense>
  </Cartao>
);

export const SecaoVazao = ({ data }: { data: string }) => (
  <Cartao classe="pnl-card--wide" icone="bi-water" titulo="Vazão natural por sistema (m³/s)">
    <Suspense fallback={<GraficoEsqueleto />}>
      <GraficoChuvaVazao data={data} tipo="vazao" />
    </Suspense>
  </Cartao>
);

export const SecaoTransposicao = ({ data }: { data: string }) => (
  <Cartao classe="pnl-card--transp" icone="bi-arrow-left-right" titulo="Transposição da Bacia do rio Paraíba do Sul">
    <Suspense
      fallback={
        <div className="pnl-transp-row">
          <div className="pnl-transp-tabela">
            <h3>Operação no ano atual</h3>
            <Esqueleto />
            <Esqueleto />
            <Esqueleto />
            <Esqueleto largura="70%" />
          </div>
          <GraficoEsqueleto className="pnl-chart pnl-transp-linha" />
          <GraficoEsqueleto className="pnl-transp-gauge" />
        </div>
      }
    >
      <CartaoTransposicao data={data} />
    </Suspense>
  </Cartao>
);

export const SecaoTabela = ({ data }: { data: string }) => (
  <Cartao classe="pnl-card--tabela" icone="bi-table" titulo="Acompanhamento por sistema">
    <Suspense
      fallback={
        <Tabela ano={Number(data.slice(0, 4)) - 1}>
          {Object.entries(SISTEMAS).map(([id, nome]) => (
            <tr key={id} className={Number(id) === ID_SIM ? 'pnl-sim' : undefined}>
              <td>{nome}</td>
              {Array.from({ length: 10 }, (_, i) => (
                <td key={i}>
                  <Esqueleto />
                </td>
              ))}
            </tr>
          ))}
        </Tabela>
      }
    >
      <TabelaSistemas data={data} />
    </Suspense>
  </Cartao>
);

// --- corpo -----------------------------------------------------------------

/** Corpo inteiro do /painel: avisos, cartões dos sistemas, indicadores e a grade de cartões, na data. */
export function CorpoPainel({ data }: { data: string }) {
  fontes(data); // dispara as cinco consultas já, em paralelo
  return (
    <>
      <AvisosPainel data={data} />
      <SistemasPainel data={data} />
      <section className="pnl-kpis">
        <KpisChuvaVazao data={data} />
        <KpisParaiba data={data} />
      </section>
      <section className="pnl-grid">
        <SecaoMapa data={data} />
        <SecaoVolume data={data} />
        <SecaoParticipacao />
        <SecaoChuva data={data} />
        <SecaoVazao data={data} />
        <SecaoTransposicao data={data} />
        <SecaoTabela data={data} />
      </section>
    </>
  );
}
