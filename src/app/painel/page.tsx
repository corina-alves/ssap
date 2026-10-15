import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import areas from '@/conteudo/sistemas-produtores-areas.json';
import { dataBr, dataHora } from '@/lib/formato';
import { painelSituacao } from '@/lib/hidrologia/painel';
import { ESTAGIOS, type LinhaSistema } from '@/lib/hidrologia/reservatorios';
import { hojeSp } from '@/lib/integracoes/comum';
import type { Contorno } from '@/lib/integracoes/ibge';
import { ID_SIM, SISTEMAS } from '@/lib/integracoes/sabesp';
import { Relogio } from './ao-vivo';
import { GraficoComparativo, GraficoParticipacao, GraficoTransposicao, GraficoVolume, MedidorTransposicao, type LinhaComparativo } from './graficos';
import { MapaPainel } from './mapa';

export const metadata: Metadata = {
  title: 'Painel de Situação Hídrica — RMSP',
  description: 'Painel de parede com volume, precipitação, vazão natural e transposição do Paraíba do Sul dos sistemas produtores da RMSP.',
};

// cores das faixas do Protocolo de Escassez (as mesmas do painel PHP)
const CORES_ESTAGIO: Record<string, string> = { normal: '#198754', atencao: '#f4b400', alerta: '#e08600', critico: '#dc3545', emergencia: '#800080' };
const corEstagio = (classe: string | undefined) => (classe && CORES_ESTAGIO[classe]) || '#6c7f91';

// produtores na ordem do painel, SIM por último
const ORDEM = Object.keys(SISTEMAS).map(Number);
const posicao = (id: number) => (id === ID_SIM ? 99 : ORDEM.indexOf(id));

const fmt = (v: number | null | undefined, casas = 1, suf = '') =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + suf;

function Kpi({ rotulo, valor, sub, cor }: { rotulo: string; valor: string; sub: string; cor: string }) {
  return (
    <div className="pnl-kpi" style={{ '--kpi': cor } as CSSProperties}>
      <small>{rotulo}</small>
      <div className="v">{valor}</div>
      <div className="sub">{sub}</div>
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

export default async function Painel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = dataDaUrl((await searchParams).data);
  const { volume, chuva, vazao, transposicao, captacao } = await painelSituacao(data);

  const v = volume.ok ? volume.dados : null;
  const p = chuva.ok ? chuva.dados : null;
  const q = vazao.ok ? vazao.dados : null;
  const t = transposicao.ok ? transposicao.dados : null;

  const sistemas = [...(v?.sistemas ?? [])].sort((a, b) => posicao(a.id) - posicao(b.id));
  const produtores = sistemas.filter((s) => s.id !== ID_SIM);
  const chuvaDe = (id: number) => (id === ID_SIM ? p?.sim : p?.produtores.find((l) => l.id === id)) ?? null;
  const vazaoDe = (id: number) => (id === ID_SIM ? q?.sim : q?.produtores.find((l) => l.id === id)) ?? null;
  const dataRef = v ? dataBr(v.dataUsada) : dataBr(data);
  const ano = v?.anoComparacao ?? Number(data.slice(0, 4)) - 1;

  const falhas = [volume, chuva, vazao, transposicao].flatMap((d) => (d.ok ? [] : [d.mensagem]));
  const reserva = [volume, chuva, vazao, transposicao].flatMap((d) => (d.ok && d.desatualizado ? [d.fonte] : []));

  const comparativo = (d: typeof p): LinhaComparativo[] =>
    (d?.produtores ?? []).map((l) => ({
      sistema: l.nome,
      dia: l.dia,
      seteDias: l.seteDias,
      mes: l.mes,
      refs: d!.anosReferencia.map((a) => l.refs[a] ?? null),
      mediaHistorica: l.mediaHistorica,
      mlt: l.mlt,
    }));

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
          ['Volume do sistema', fmt(s.volume, 1, '%')],
          ['Estágio', s.estagio.nome],
          ['Chuva do dia', fmt(chuvaDe(s.id)?.dia ?? s.chuvaDia, 1, ' mm')],
          ['Vazão do dia', fmt(vazaoDe(s.id)?.dia, 1, ' m³/s')],
          ['Outorga', o ? fmt(o.outorga, 1, ' m³/s') : '—'],
          ['Captado no mês', captado],
        ] as [string, string][],
      },
    ];
  });

  return (
    <div className="pnl" id="pnl">
      <link rel="stylesheet" href="/acesso/vendor/leaflet/leaflet.css" precedence="default" />

      <header className="pnl-top">
        <div className="pnl-brand">
          <Link href="/" title="Voltar ao site da Sala de Situação">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/legado/logo/spaguas_white.png" alt="SP Águas" />
          </Link>
          <div>
            <h1>Painel de Situação Hídrica</h1>
            <span>Região Metropolitana de São Paulo · Sala de Situação Alfredo Pisani</span>
          </div>
        </div>
        <form className="pnl-busca" method="get" key={data}>
          <label htmlFor="pnlDataInput">
            <i className="bi bi-calendar3" /> Data de referência
          </label>
          <div className="pnl-busca-campo">
            <input type="date" id="pnlDataInput" name="data" defaultValue={data} min="2010-01-01" max={hojeSp()} />
            <button type="submit" title="Buscar" aria-label="Buscar">
              <i className="bi bi-search" />
            </button>
          </div>
        </form>

        <div className="pnl-top-meta">
          <Relogio />
          <div className="pnl-data">
            Referência: <strong>{dataRef}</strong>
          </div>
          <div className="pnl-atualiza">
            <i className="bi bi-arrow-repeat" /> atualiza a cada 10 min · {dataHora(new Date())}
          </div>
        </div>
      </header>

      {falhas.length > 0 && (
        <div className="pnl-status is-erro" role="status">
          {falhas.join(' ')}
        </div>
      )}
      {reserva.length > 0 && (
        <div className="pnl-status" role="status">
          Fonte sem resposta agora ({[...new Set(reserva)].join(', ')}): o painel mostra a última cópia obtida.
        </div>
      )}

      <section className="pnl-kpis">
        <Kpi rotulo="Volume UHE Jaguari (PS)" valor={v?.jaguari.ok ? fmt(v.jaguari.dados.volumePct, 2, '%') : '—'} sub="reservatório do Paraíba do Sul · ANA" cor="#12a8d2" />
        <Kpi rotulo="Transferência — Paraíba do Sul" valor={fmt(v?.transposicaoM3s, 2, ' m³/s')} sub="transposição atual" cor="#12a8d2" />
        <Kpi
          rotulo="Transposição Paraíba do Sul"
          valor={fmt(t?.acumuladoHm3, 2, ' hm³')}
          sub={t?.limite ? `restam ${fmt(t.limite.restanteHm3, 0)} hm³ de ${fmt(t.limite.vigente, 0)}` : `ano ${t?.ano ?? data.slice(0, 4)}`}
          cor="#7c5cff"
        />
        <Kpi rotulo="Chuva do dia — RMSP" valor={fmt(p?.sim?.dia, 1, ' mm')} sub="média dos sistemas produtores" cor="#e08600" />
      </section>

      <section className="pnl-sistemas">
        {sistemas.map((s) => (
          <div className="pnl-sist-card" key={s.id} style={{ '--e': corEstagio(s.estagio.classe) } as CSSProperties}>
            <small>{s.nome}</small>
            <div className="v">{fmt(s.volume, 2, '%')}</div>
            <Estagio s={s} />
            {s.difAno !== null && (
              <div className={`dif ${s.difAno >= 0 ? 'up' : 'down'}`}>
                {s.difAno >= 0 ? '▲' : '▼'} {fmt(Math.abs(s.difAno), 1)} p.p. vs {ano}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="pnl-grid">
        <div className="pnl-card pnl-card--mapa">
          <h2>
            <i className="bi bi-geo-alt-fill" /> Sistemas produtores
          </h2>
          <MapaPainel sistemas={mapa} chave={JSON.stringify(mapa.map((s) => [s.cor, s.linhas]))} />
          <div className="pnl-legenda">
            {ESTAGIOS.map((e) => (
              <span key={e.codigo}>
                <i className={`is-${e.classe}`} />
                {e.nome}
              </span>
            ))}
          </div>
        </div>

        <div className="pnl-card pnl-card--vol">
          <h2>
            <i className="bi bi-bar-chart-fill" /> Volume útil por sistema — atual × {ano} (%)
          </h2>
          <div className="pnl-chart">
            <GraficoVolume
              labels={produtores.map((s) => s.nome)}
              atual={produtores.map((s) => s.volume)}
              anterior={produtores.map((s) => s.volumeAnoAnterior)}
              cores={produtores.map((s) => corEstagio(s.estagio.classe))}
              rotuloAtual={dataRef}
              rotuloAnterior={v?.dataComparacao ? dataBr(v.dataComparacao) : String(ano)}
            />
          </div>
          <div className="pnl-legenda pnl-legenda--faixas">
            {ESTAGIOS.map((e) => (
              <span key={e.codigo}>
                <i className={`is-${e.classe}`} />
                {e.codigo} · {e.nome}
              </span>
            ))}
          </div>
        </div>

        <div className="pnl-card pnl-card--pizza">
          <h2>
            <i className="bi bi-pie-chart-fill" /> Participação no SIM
          </h2>
          <div className="pnl-chart">
            <GraficoParticipacao />
          </div>
        </div>

        <div className="pnl-card pnl-card--wide">
          <h2>
            <i className="bi bi-cloud-rain-heavy-fill" /> Precipitação do dia (mm)
          </h2>
          <div className="pnl-chart">
            <GraficoComparativo tipo="chuva" linhas={comparativo(p)} anosReferencia={p?.anosReferencia ?? []} dataBr={dataRef} />
          </div>
        </div>

        <div className="pnl-card pnl-card--wide">
          <h2>
            <i className="bi bi-water" /> Vazão natural por sistema (m³/s)
          </h2>
          <div className="pnl-chart">
            <GraficoComparativo tipo="vazao" linhas={comparativo(q)} anosReferencia={q?.anosReferencia ?? []} dataBr={dataRef} />
          </div>
        </div>

        <div className="pnl-card pnl-card--transp">
          <h2>
            <i className="bi bi-arrow-left-right" /> Transposição da Bacia do rio Paraíba do Sul
          </h2>
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
        </div>

        <div className="pnl-card pnl-card--tabela">
          <h2>
            <i className="bi bi-table" /> Acompanhamento por sistema
          </h2>
          <div className="pnl-tabela-wrap">
            <table id="pnlTabela">
              <thead>
                <tr>
                  <th>Sistema</th>
                  <th>Volume útil</th>
                  <th>Dif. {ano}</th>
                  <th>Dif. dia</th>
                  <th>Estágio</th>
                  <th>Chuva do dia</th>
                  <th>Chuva do mês</th>
                  <th>Média hist. chuva</th>
                  <th>MLT chuva</th>
                  <th>Vazão do dia</th>
                  <th>MLT vazão</th>
                </tr>
              </thead>
              <tbody>
                {sistemas.length === 0 && (
                  <tr>
                    <td colSpan={11}>Sem dados.</td>
                  </tr>
                )}
                {sistemas.map((s) => {
                  const ehSim = s.id === ID_SIM;
                  const c = chuvaDe(s.id);
                  const z = vazaoDe(s.id);
                  // Chuva do SIM: média dos produtores; nos demais, o valor do próprio sistema.
                  return (
                    <tr key={s.id} className={ehSim ? 'pnl-sim' : undefined}>
                      <td>{s.nome}</td>
                      <td>{fmt(s.volume, 1, '%')}</td>
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
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
