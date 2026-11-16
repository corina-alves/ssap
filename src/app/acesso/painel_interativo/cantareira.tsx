'use client';

import { useMemo } from 'react';
import type { ChuvaCantareira, OperacaoCantareira, PostosControle } from '@/lib/hidrologia/cantareira-operacao';
import { EChart } from './echart';
import { COR_RESERVATORIO, dataBr, fmt, opcaoChuvaRadarMes, opcaoControle15, opcaoControle7, opcaoDespachada } from './graficos';
import { Estado, useJson } from './usar-json';
import { COR_FAIXA } from './valores-ssd';

/**
 * Operação do Sistema Cantareira e vazões para as Bacias PCJ, abaixo do diagrama
 * unifilar (dados: src/lib/hidrologia/cantareira-operacao.ts). Três consultas à
 * parte, cada uma com a sua fonte: operação (SSD), chuva por radar (SIBH, com a
 * média climatológica do SSD) e postos de controle (SIBH).
 */

const API = '/api/acesso/painel_interativo/cantareira';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const hora = (h: string | null | undefined) => (h ? h.replace(':', 'h') : '');

function Cartao({ titulo, valor, cor, classe, children }: { titulo: string; valor: React.ReactNode; cor?: string; classe?: string; children?: React.ReactNode }) {
  return (
    <div className={`pc-cartao${classe ? ` ${classe}` : ''}`} style={cor ? ({ '--pc-cor': cor } as React.CSSProperties) : undefined}>
      <small>{titulo}</small>
      <b>{valor}</b>
      {children}
    </div>
  );
}

/** Situação em relação a um limite, com ícone e texto (nunca só a cor). */
function Situacao({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={`pc-situacao ${ok ? 'is-ok' : 'is-abaixo'}`}>
      <i className={`bi ${ok ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} aria-hidden /> {texto}
    </span>
  );
}

const cor = (chave: string) => COR_RESERVATORIO[chave as keyof typeof COR_RESERVATORIO];

function CartoesOperacao({ op, data }: { op: OperacaoCantareira | undefined; data: string }) {
  const f = op?.faixa;
  const p = op?.periodo;
  const si = op?.santaInes;
  const de = op?.despachada;
  const mes = MESES[Number(data.slice(5, 7)) - 1];
  const comBombeamento = f && f.numero >= 2 && f.numero <= 4;
  return (
    <div className="pc-cartoes">
      <Cartao titulo="Faixa de operação" valor={f ? `Faixa ${f.numero} — ${f.nome}` : '—'} cor={f ? COR_FAIXA(f.volumePct) : undefined}>
        {f && (
          <span>
            Volume útil {fmt(f.volumePct, 2, '%')} em {dataBr(f.dataVolume)}
          </span>
        )}
        {p && (
          <span>
            Período {p.nome} ({dataBr(p.de).slice(0, 5)} a {dataBr(p.ate).slice(0, 5)})
          </span>
        )}
        {p?.nome === 'seco' ? (
          <span>PCJ: média de 10 m³/s de 1º/06 a 30/11 (158,1 hm³); mínimas diárias 10 / 2 / 2 m³/s em Valinhos, Atibaia e Buenópolis</span>
        ) : f?.metas15d ? (
          <span>
            PCJ: média móvel de 15 dias de {fmt(f.metas15d.valinhos, 1)} / {fmt(f.metas15d.atibaia, 1)} / {fmt(f.metas15d.buenopolis, 1)} m³/s em Valinhos, Atibaia e Buenópolis
          </span>
        ) : null}
        <em>Resolução ANA/DAEE 925/2017. A faixa que vale é a definida pela ANA e pela SP Águas a cada mês (art. 6º); aqui, a do volume do dia.</em>
      </Cartao>

      <Cartao titulo="Vazão para Santa Inês (RMSP)" valor={fmt(si?.ultimo?.valor, 2, ' m³/s')}>
        {si?.ultimo && <span>média de {dataBr(si.ultimo.data)}</span>}
        <span>
          Média do mês: <b>{fmt(si?.mediaMes, 2, ' m³/s')}</b> ({si?.dias ?? 0} dias)
        </span>
        {f && (
          <span>
            Limite da Faixa {f.numero}: <b>{fmt(f.santaInes, 1, ' m³/s')}</b> (média mensal)
          </span>
        )}
        {comBombeamento && <span>+ bombeamento da UHE Jaguari: {fmt(si?.transposicaoMes, 2, ' m³/s')} no mês (art. 4º, § 2º)</span>}
        <em>SSD: EEAB Santa Inês, média de cada dia.</em>
      </Cartao>

      <Cartao titulo={`Despachado para o PCJ em ${mes}`} valor={fmt(de?.mes?.hm3, 2, ' hm³')}>
        {de?.mes ? (
          <>
            <span>
              {dataBr(de.mes.de)} a {dataBr(de.mes.ate)} ({de.mes.dias} {de.mes.dias === 1 ? 'dia' : 'dias'})
            </span>
            <span>
              Média: <b>{fmt(de.mes.mediaM3s, 2, ' m³/s')}</b>
            </span>
          </>
        ) : (
          op && <span>Sem dado do SSD neste mês.</span>
        )}
        <em>Soma da vazão descarregada de cada dia × 86 400 s.</em>
      </Cartao>
    </div>
  );
}

/**
 * Vazão descarregada (despachada) para o PCJ: a de cada reservatório no último
 * dia e a média do mês, com o total. Fica na coluna da direita do diagrama,
 * abaixo de "Volumes dos reservatórios" (DiagramaUnifilar, prop `lateral`).
 */
export function CartaoDescarregada({ op, data }: { op: { dados?: OperacaoCantareira; erro?: string; carregando: boolean }; data: string }) {
  const de = op.dados?.despachada;
  const mes = MESES[Number(data.slice(5, 7)) - 1]!;
  return (
    <aside className={`un-descarregada${op.carregando ? ' is-carregando' : ''}`} aria-label="Vazão descarregada para o PCJ" aria-busy={op.carregando}>
      <h4>Vazão descarregada para o PCJ</h4>
      {op.erro ? (
        <p className="pi-erro">SSD indisponível ({op.erro}).</p>
      ) : (
        <table className="pc-tabela">
          <thead>
            <tr>
              <th scope="col">m³/s</th>
              <th scope="col">{de?.total ? dataBr(de.total.data).slice(0, 5) : 'dia'}</th>
              <th scope="col">{mes.slice(0, 3)}.</th>
            </tr>
          </thead>
          <tbody>
            {de?.reservatorios.map((r) => (
              <tr key={r.chave}>
                <td>
                  <i style={{ background: cor(r.chave) }} aria-hidden />
                  {r.nome}
                </td>
                <td>
                  {fmt(r.ultimo?.valor, 2)}
                  {r.ultimo && de.total && r.ultimo.data !== de.total.data && <small> ({dataBr(r.ultimo.data).slice(0, 5)})</small>}
                </td>
                <td>{fmt(r.mediaMes, 2)}</td>
              </tr>
            ))}
            <tr className="is-total">
              <td>Total PCJ</td>
              <td>{fmt(de?.total?.valor, 2)}</td>
              <td>{fmt(de?.mes?.mediaM3s, 2)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p>
        SSD: média do dia e média de {mes}
        {de?.mes ? ` (até ${dataBr(de.mes.ate).slice(0, 5)})` : ''}. {de?.mes ? `No mês: ${fmt(de.mes.hm3, 2, ' hm³')}.` : ''}
      </p>
    </aside>
  );
}

/** Chuva por radar nas bacias dos reservatórios, em destaque: hoje, no mês e a média do mês, ao lado do gráfico do mês. */
function ChuvaRadar({ ch, data, grafico }: { ch: { dados?: ChuvaCantareira; erro?: string; carregando: boolean }; data: string; grafico: React.ReactNode }) {
  const mes = MESES[Number(data.slice(5, 7)) - 1];
  const bacias = ch.dados?.bacias ?? [];
  const horaRadar = bacias.map((b) => b.hoje?.hora).filter(Boolean).sort().at(-1);
  const clima = bacias.map((b) => b.climatologia).find(Boolean);
  return (
    <section className={`pc-radar${ch.carregando ? ' is-carregando' : ''}`} aria-label="Chuva por radar nas bacias dos reservatórios" aria-busy={ch.carregando}>
      <h4>
        <i className="bi bi-broadcast" aria-hidden /> Chuva por radar nas bacias dos reservatórios
      </h4>
      <div className="pc-radar-bacias">
        {ch.erro && <p className="pi-erro">Chuva por radar indisponível: {ch.erro}.</p>}
        {bacias.map((b) => {
          const noMes = b.dias.reduce((soma, d) => soma + (d.mm ?? 0), 0);
          const pct = b.climatologia ? Math.round((noMes / b.climatologia.media) * 100) : null;
          return (
            <div key={b.chave} className="pc-radar-bacia" style={{ '--pc-cor': cor(b.chave) } as React.CSSProperties}>
              <span>
                {b.reservatorio} — {b.nome}
              </span>
              <strong>
                {fmt(b.hoje?.valor, 1, ' mm')}
                <small>hoje{b.hoje?.hora ? ` até ${hora(b.hoje.hora)}` : ''}</small>
              </strong>
              <em>
                Em {mes}: <b>{fmt(noMes, 1, ' mm')}</b>
                {b.climatologia && ` de ${fmt(b.climatologia.media, 0, ' mm')} na média (${pct}%)`}
              </em>
            </div>
          );
        })}
        {!bacias.length && !ch.erro && <p className="pi-nota">Buscando o radar no SIBH…</p>}
        <p className="pi-nota">
          SIBH{horaRadar ? `, de 00h às ${hora(horaRadar)}` : ''}. Média do mês: chuva mensal do SSD de cada reservatório{clima ? ` (${clima.de} a ${clima.ate})` : ''}.
          {ch.dados?.radarDesde && ` O radar só tem leituras no SIBH desde ${dataBr(ch.dados.radarDesde)}: o mês fica incompleto.`}
        </p>
      </div>
      <div className="pc-radar-grafico">{grafico}</div>
    </section>
  );
}

/** "nov/26" a partir de AAAA-MM. */
const mesCurto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]!.slice(0, 3)}/${mes.slice(2, 4)}`;

/**
 * Vazão descarregada mensal (média do mês, série mensal do SSD) dos últimos
 * meses, com o volume; no rodapé, a soma do período em hm³ e a vazão média do
 * período (ponderada pelos dias).
 */
function TabelaMensal({ op }: { op: OperacaoCantareira | undefined }) {
  const linhas = [...(op?.despachada.mensal ?? [])].reverse();
  const soma = op?.despachada.somaMensal;
  return (
    <table className="pc-tabela">
      <thead>
        <tr>
          <th scope="col">Mês</th>
          {op?.despachada.reservatorios.map((r) => (
            <th scope="col" key={r.chave}>
              {r.nome}
            </th>
          ))}
          <th scope="col">Total</th>
          <th scope="col">Volume</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.mes} className={l.parcial ? 'is-parcial' : undefined}>
            <td>
              {mesCurto(l.mes)}
              {l.parcial && <small> (até dia {l.dias})</small>}
            </td>
            {l.reservatorios.map((v, i) => (
              <td key={i}>{fmt(v, 2)}</td>
            ))}
            <td>
              <b>{fmt(l.total, 2)}</b>
            </td>
            <td>{fmt(l.hm3, 2, ' hm³')}</td>
          </tr>
        ))}
      </tbody>
      {soma && (
        <tfoot>
          <tr className="is-total">
            <td>
              Soma {mesCurto(soma.de)} a {mesCurto(soma.ate)}
              {soma.foraDaSoma > 0 && <small> (sem {soma.foraDaSoma} {soma.foraDaSoma === 1 ? 'mês incompleto' : 'meses incompletos'})</small>}
            </td>
            {soma.hm3.map((v, i) => (
              <td key={i}>{fmt(v, 2, ' hm³')}</td>
            ))}
            <td>{fmt(soma.hm3Total, 2, ' hm³')}</td>
            <td>{fmt(soma.hm3Total, 2, ' hm³')}</td>
          </tr>
          <tr className="is-media">
            <td>Média do período (m³/s)</td>
            {soma.media.map((v, i) => (
              <td key={i}>{fmt(v, 2)}</td>
            ))}
            <td>
              <b>{fmt(soma.mediaTotal, 2)}</b>
            </td>
            <td />
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function PostoControle({ p, ctrl }: { p: PostosControle['postos'][number]; ctrl: PostosControle }) {
  const op15 = useMemo(
    () => opcaoControle15(p.dias, { faixas12: ctrl.metas15d.faixas12[p.chave] ?? 0, faixas34: ctrl.metas15d.faixas34[p.chave] ?? 0 }, p.minimoDiario),
    [p, ctrl.metas15d],
  );
  const op7 = useMemo(() => opcaoControle7(p.horas, p.minimoDiario), [p]);
  const umido = ctrl.periodo.nome === 'úmido';
  const atual = p.atual;
  return (
    <div className="pc-posto">
      <div className="pc-posto-dados">
        <h4>
          {p.prefixo} · {p.nome} <small>{p.rio}</small>
        </h4>
        {p.semDados && <p className="pi-erro">O SIBH não respondeu e não há cópia guardada deste posto.</p>}
        <dl>
          <div>
            <dt>Vazão {atual?.hora ? `às ${hora(atual.hora)}` : 'do dia'}</dt>
            <dd>{fmt(atual?.vazao ?? p.diaAtual?.vazao, 2, ' m³/s')}</dd>
          </div>
          <div>
            <dt>Nível {atual?.hora ? `às ${hora(atual.hora)}` : 'do dia'}</dt>
            <dd>{fmt(atual?.nivel ?? p.diaAtual?.nivel, 2, ' m')}</dd>
          </div>
          <div>
            <dt>Média do dia anterior</dt>
            <dd>{fmt(p.diaAnterior?.vazao, 2, ' m³/s')}</dd>
          </div>
          <div>
            <dt>Média móvel de 15 dias</dt>
            <dd>{fmt(p.mm15?.valor, 2, ' m³/s')}</dd>
          </div>
        </dl>
        <div className="pc-situacoes">
          {p.minimoDiario !== null && p.diaAnterior?.vazao != null && (
            <Situacao ok={p.diaAnterior.vazao >= p.minimoDiario} texto={`ontem ${p.diaAnterior.vazao >= p.minimoDiario ? 'acima' : 'abaixo'} da mínima diária (${fmt(p.minimoDiario, 1, ' m³/s')})`} />
          )}
          {umido && p.meta15d !== null && p.mm15 && (
            <Situacao ok={p.mm15.valor >= p.meta15d} texto={`média móvel ${p.mm15.valor >= p.meta15d ? 'acima' : 'abaixo'} da meta da faixa (${fmt(p.meta15d, 1, ' m³/s')})`} />
          )}
          {!umido && <span className="pc-nota">Metas de média móvel de 15 dias: só no período úmido (dez. a mai.).</span>}
        </div>
        <div className="pc-chuva" aria-label={`Chuva por radar na ${p.radarNome}`}>
          <span>Chuva por radar — {p.radarNome}</span>
          <ul>
            {(['h1', 'h24', 'h48', 'h72'] as const).map((k) => (
              <li key={k}>
                <small>{k.slice(1)} h</small>
                <b>{fmt(p.chuva?.[k], 1, ' mm')}</b>
              </li>
            ))}
          </ul>
          {p.chuva?.ate && <em>até {hora(p.chuva.ate)}</em>}
        </div>
      </div>
      <div className="pc-posto-grafico">
        <h5>Vazão — últimos 15 dias</h5>
        <EChart opcao={op15} altura={250} rotulo={`Vazão média de cada dia e média móvel de 15 dias em ${p.nome}`} />
      </div>
      <div className="pc-posto-grafico">
        <h5>Vazão e nível — 7 dias, hora a hora</h5>
        <EChart opcao={op7} altura={250} rotulo={`Vazão e nível hora a hora nos últimos 7 dias em ${p.nome}`} />
      </div>
    </div>
  );
}

/** URL da parte de operação (SSD): a tela busca uma vez e passa ao painel e ao cartão da direita do diagrama. */
export const urlOperacao = (data: string, tick: number) => `${API}/operacao?data=${data}&t=${tick}`;

export function PainelCantareira({ data, tick, op }: { data: string; tick: number; op: { dados?: OperacaoCantareira; erro?: string; carregando: boolean } }) {
  const ch = useJson<ChuvaCantareira>(`${API}/chuva?data=${data}&t=${tick}`);
  const ct = useJson<PostosControle>(`${API}/controle?data=${data}&t=${tick}`);
  const opDespachada = useMemo(() => (op.dados ? opcaoDespachada(op.dados.despachada.serie) : null), [op.dados]);
  const diasMes = useMemo(() => ch.dados?.bacias[0]?.dias.map((d) => d.data) ?? [], [ch.dados]);
  const opChuva = useMemo(
    () => (ch.dados ? opcaoChuvaRadarMes(diasMes, ch.dados.bacias.map((b) => ({ ...b, chave: b.chave as keyof typeof COR_RESERVATORIO }))) : null),
    [ch.dados, diasMes],
  );
  const mes = MESES[Number(data.slice(5, 7)) - 1];

  return (
    <section className="pi-card pc" aria-label="Operação do Cantareira e vazões para o PCJ">
      <h3>
        <i className="bi bi-sliders2" /> Operação do Cantareira e vazões para o PCJ
      </h3>

      {op.erro && <p className="pi-erro">Operação (SSD) indisponível: {op.erro}.</p>}
      <div className={`pi-estado${op.carregando ? ' is-carregando' : ''}`} aria-busy={op.carregando}>
        <CartoesOperacao op={op.dados} data={data} />
      </div>

      <ChuvaRadar
        ch={ch}
        data={data}
        grafico={
          <>
            <h5 className="pc-radar-titulo">Acumulada dia a dia em {mes} — tracejadas: média do mês de cada reservatório</h5>
            <EChart opcao={opChuva} altura={300} rotulo={`Chuva por radar acumulada em ${mes} nas bacias dos reservatórios e a média climatológica do mês`} />
          </>
        }
      />

      <div className="pc-descarregada">
        <div className="pi-card pi-card--dentro pc-destaque-descarregada">
          <h4>Vazão descarregada para o PCJ — últimos 6 meses</h4>
          <Estado carregando={op.carregando} erro={op.erro}>
            <EChart opcao={opDespachada} altura={280} rotulo="Vazão descarregada de cada reservatório para o PCJ nos últimos 6 meses" />
          </Estado>
          <p className="pi-nota">Média de cada dia (SSD). Empilhadas: o topo é o total para o PCJ.</p>
        </div>
        <div className="pi-card pi-card--dentro pc-destaque-descarregada">
          <h4>Vazão descarregada mensal (m³/s)</h4>
          <Estado carregando={op.carregando} erro={op.erro}>
            <TabelaMensal op={op.dados} />
          </Estado>
          <p className="pi-nota">
            Média do mês na série mensal do SSD; volume = média × dias do mês. O mês corrente vai até o último dia com dado. Soma: volume despachado no período (hm³); a
            vazão do período é a média ponderada pelos dias.
          </p>
        </div>
      </div>

      <h4 className="pc-subtitulo">
        <i className="bi bi-geo-alt" /> Postos de controle — Resolução ANA/DAEE 925/2017, art. 5º
      </h4>
      <Estado carregando={ct.carregando} erro={ct.erro}>
        {ct.dados ? (
          ct.dados.postos.map((p) => <PostoControle key={p.id} p={p} ctrl={ct.dados!} />)
        ) : (
          <p className="pi-nota">Buscando os postos no SIBH…</p>
        )}
      </Estado>
      <p className="pi-nota">
        SIBH: leitura mais recente (hoje) ou média do dia; média do dia anterior e média móvel de 15 dias (até ontem) calculadas das leituras de hora em hora. Linhas tracejadas: metas de média
        móvel das Faixas 1–2 e 3–4 (período úmido, § 2º); vermelha: mínima média diária (§ 3º). Chuva: radar da bacia do posto.
      </p>
    </section>
  );
}
