'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CartaoSistema, Indicadores, ValorTransferencia } from '@/lib/hidrologia/painel-interativo';
import { DiagramaSsd } from './diagrama';
import { EChart } from './echart';
import {
  anoAnterior,
  CORES_VAZAO,
  dataBr,
  dias,
  fmt,
  opcaoBalanco,
  opcaoChuva,
  opcaoDistribuicao,
  opcaoEvolucao,
  opcaoVariacao,
  opcaoVazoes,
  type Ponto,
} from './graficos';

const API = '/api/acesso/painel_interativo';
const ATUALIZAR_MS = 10 * 60 * 1000;
const PERIODOS = [7, 15, 30, 90, 365] as const;
// variáveis do SSD (as mesmas de VAR em src/lib/hidrologia/painel-interativo.ts)
const V = { chuva: 1, vazao: 3, afluente: 4, natural: 6, captada: 8, volumePct: 10, volumeHm3: 11, defluente: 13 };
// sistemas no mapa do SSD (data-water-system) → chave do painel
const SISTEMA_DO_MAPA: Record<string, string> = {
  cantareira: 'cantareira',
  altotiete: 'alto-tiete',
  guarapiranga: 'guarapiranga',
  cotia: 'cotia',
  riogrande: 'rio-grande',
  rioclaro: 'rio-claro',
  saolourenco: 'sao-lourenco',
};
const TRANSF_ENTRADA = 44; // UHE Jaguari → Atibainha

type LocalDetalhe = { chave: string; nome: string; space: number; ind: Indicadores | null; erro?: string };
type Detalhe = { data: string; chave: string; diagrama: string; reservatorios: LocalDetalhe[]; aParte: LocalDetalhe[]; transferencias: ValorTransferencia[] };

/** fetch JSON com estado de carregamento e erro, refeito quando a URL muda. */
function useJson<T>(url: string | null) {
  const [st, setSt] = useState<{ dados?: T; erro?: string; carregando: boolean }>({ carregando: !!url });
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    setSt((s) => ({ dados: s.dados, carregando: true }));
    fetch(url)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro ?? `HTTP ${r.status}`);
        return j as T;
      })
      .then(
        (dados) => vivo && setSt({ dados, carregando: false }),
        (e: Error) => vivo && setSt({ erro: e.message, carregando: false }),
      );
    return () => {
      vivo = false;
    };
  }, [url]);
  return st;
}

const sinal = (v: number | null | undefined, casas = 2, suf = ' p.p.') => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), casas, suf)}`);
const classeVar = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? '' : v > 0 ? 'sobe' : 'desce');

function Estado({ carregando, erro, children }: { carregando: boolean; erro?: string; children: React.ReactNode }) {
  if (erro) return <div className="pi-erro">Dado indisponível ({erro}).</div>;
  return (
    <div className={`pi-estado${carregando ? ' is-carregando' : ''}`} aria-busy={carregando}>
      {children}
    </div>
  );
}

function Minigrafico({ pontos }: { pontos: Ponto[] }) {
  if (pontos.length < 2) return null;
  const vs = pontos.map((p) => p.valor);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const d = pontos.map((p, i) => `${(i / (pontos.length - 1)) * 100},${max === min ? 15 : 28 - ((p.valor - min) / (max - min)) * 26}`).join(' ');
  return (
    <svg className="pi-mini" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <polyline points={d} />
    </svg>
  );
}

function CartaoReservatorio({ l, ativo, aoEscolher, nota }: { l: LocalDetalhe; ativo: boolean; aoEscolher: () => void; nota?: string }) {
  const i = l.ind;
  return (
    <button type="button" className={`pi-res${ativo ? ' is-ativo' : ''}`} onClick={aoEscolher} aria-pressed={ativo}>
      <span className="pi-res-nome">{l.nome}</span>
      {nota && <span className="pi-res-nota">{nota}</span>}
      {!i ? (
        <span className="pi-erro">Dado indisponível</span>
      ) : (
        <>
          <span className="pi-res-v">{fmt(i.volumePct, 2, '%')}</span>
          <span className="pi-res-hm3">{fmt(i.volumeHm3, 2, ' hm³')}</span>
          <Minigrafico pontos={i.historico} />
          <span className="pi-res-linhas">
            <span>
              24 h <b className={classeVar(i.var1d)}>{sinal(i.var1d)}</b>
            </span>
            <span>
              7 dias <b className={classeVar(i.var7d)}>{sinal(i.var7d)}</b>
            </span>
            <span>
              30 dias <b className={classeVar(i.var30d)}>{sinal(i.var30d)}</b>
            </span>
            <span>
              Chuva no mês <b>{fmt(i.chuvaMes, 1, ' mm')}</b>
            </span>
            <span>
              Afluente <b>{fmt(i.afluente, 2, ' m³/s')}</b>
            </span>
            <span>
              Defluente <b>{fmt(i.defluente, 2, ' m³/s')}</b>
            </span>
          </span>
        </>
      )}
    </button>
  );
}

export function TelaPainel({ hoje }: { hoje: string }) {
  const [data, setData] = useState(hoje);
  const [sistema, setSistema] = useState('sim');
  const [local, setLocal] = useState<number | null>(null); // reservatório escolhido no detalhamento
  const [periodo, setPeriodo] = useState<number | 'livre'>(30);
  const [livre, setLivre] = useState({ de: '', ate: '' });
  const [tick, setTick] = useState(0);

  // atualização automática (só olhando o dia de hoje)
  useEffect(() => {
    if (data !== hoje) return;
    const t = setInterval(() => setTick((x) => x + 1), ATUALIZAR_MS);
    return () => clearInterval(t);
  }, [data, hoje]);

  const resumo = useJson<{ data: string; sistemas: CartaoSistema[] }>(`${API}/resumo?data=${data}&t=${tick}`);
  const sistemas = resumo.dados?.sistemas ?? [];
  const atual = sistemas.find((s) => s.chave === sistema);
  const temDetalhe = sistema === 'cantareira';
  const detalhe = useJson<Detalhe>(temDetalhe ? `${API}/detalhe/${sistema}?data=${data}&t=${tick}` : null);
  const det = temDetalhe ? detalhe.dados : undefined;

  const locaisDetalhe = det ? [...det.reservatorios, ...det.aParte] : [];
  const escolhido = locaisDetalhe.find((l) => l.space === local) ?? null;
  const space = escolhido?.space ?? atual?.space ?? 10;
  const nomeLocal = escolhido ? escolhido.nome : (atual?.nome ?? 'SIM');

  // período dos gráficos
  const [de, ate] = useMemo(() => {
    if (periodo === 'livre' && livre.de && livre.ate && livre.de <= livre.ate) return [livre.de, livre.ate];
    const n = periodo === 'livre' ? 30 : periodo;
    const fim = new Date(`${data}T12:00:00Z`);
    fim.setUTCDate(fim.getUTCDate() - (n - 1));
    return [fim.toISOString().slice(0, 10), data];
  }, [periodo, livre, data]);
  const diasPeriodo = useMemo(() => dias(de, ate), [de, ate]);
  const anoAtual = Number(ate.slice(0, 4));

  const pares = [V.volumePct, V.volumeHm3, V.chuva, V.natural, V.afluente, V.defluente, V.captada].map((v) => `s=${space}:${v}`);
  if (sistema === 'cantareira' && !escolhido) pares.push(`s=${TRANSF_ENTRADA}:${V.vazao}`);
  const series = useJson<{ series: Record<string, Ponto[]> }>(`${API}/series?de=${anoAnterior(de) ?? de}&ate=${ate}&${pares.join('&')}&t=${tick}`);
  const s = (v: number, sp = space) => series.dados?.series[`${sp}:${v}`];

  const comFaixas = !escolhido; // faixas do Protocolo valem para o sistema, não por reservatório
  const opEvolucao = useMemo(() => opcaoEvolucao(s(V.volumePct), diasPeriodo, comFaixas, anoAtual), [series.dados, diasPeriodo, comFaixas, anoAtual]); // eslint-disable-line react-hooks/exhaustive-deps
  const opChuva = useMemo(() => opcaoChuva(s(V.chuva), diasPeriodo, anoAtual), [series.dados, diasPeriodo, anoAtual]); // eslint-disable-line react-hooks/exhaustive-deps
  const opVazoes = useMemo(
    () =>
      opcaoVazoes(
        [
          { nome: 'Natural', pontos: s(V.natural), cor: CORES_VAZAO.natural },
          { nome: 'Afluente', pontos: s(V.afluente), cor: CORES_VAZAO.afluente },
          { nome: 'Defluente', pontos: s(V.defluente), cor: CORES_VAZAO.defluente },
          ...(s(V.captada)?.length ? [{ nome: 'Captada', pontos: s(V.captada), cor: CORES_VAZAO.captada }] : []),
          ...(sistema === 'cantareira' && !escolhido ? [{ nome: 'Transferência UHE Jaguari → Atibainha', pontos: s(V.vazao, TRANSF_ENTRADA), cor: CORES_VAZAO.transf, tracejada: true }] : []),
        ],
        diasPeriodo,
      ),
    [series.dados, diasPeriodo, sistema, escolhido], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const opBalanco = useMemo(() => opcaoBalanco(s(V.afluente), s(V.defluente), s(V.captada), s(V.volumeHm3), diasPeriodo), [series.dados, diasPeriodo]); // eslint-disable-line react-hooks/exhaustive-deps
  const opVariacao = useMemo(() => opcaoVariacao(s(V.volumePct), diasPeriodo), [series.dados, diasPeriodo]); // eslint-disable-line react-hooks/exhaustive-deps
  const opDistribuicao = useMemo(
    () => (det ? opcaoDistribuicao(det.reservatorios.map((r) => ({ nome: r.nome, hm3: r.ind?.volumeHm3 ?? null, pct: r.ind?.volumePct ?? null }))) : null),
    [det],
  );

  const escolherSistema = (chave: string) => {
    setSistema(chave);
    setLocal(null);
  };
  const sim = sistemas.find((x) => x.chave === 'sim');
  const somaReservatorios = det?.reservatorios.reduce((t, r) => t + (r.ind?.volumeHm3 ?? 0), 0) ?? null;
  const atualizado = resumo.dados ? sistemas.map((x) => x.ind?.dataUsada).filter(Boolean).sort().at(-1) : null;

  return (
    <div className="pi">
      {/* faixa superior */}
      <header className="pi-topo">
        <div>
          <h2>Sistemas produtores da RMSP</h2>
          <span className="pi-fonte">
            Fonte: SSD SP Águas · dado mais recente: <b>{atualizado ? dataBr(atualizado) : '—'}</b>
            {data === hoje && ' · atualiza a cada 10 min'}
          </span>
        </div>
        <div className="pi-filtros">
          <label>
            Data
            <input type="date" value={data} max={hoje} min="2000-01-01" onChange={(e) => e.target.value && setData(e.target.value)} />
          </label>
          <label>
            Sistema
            <select value={sistema} onChange={(e) => escolherSistema(e.target.value)}>
              {(sistemas.length ? sistemas : [{ chave: 'sim', nome: 'SIM' }]).map((x) => (
                <option key={x.chave} value={x.chave}>
                  {x.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* primeira linha: indicadores */}
      <section className="pi-cartoes" aria-label="Volume útil por sistema">
        {resumo.erro && <div className="pi-erro">Resumo indisponível ({resumo.erro}).</div>}
        {(sistemas.length ? sistemas : Array.from({ length: 8 }, (_, i) => ({ chave: `c${i}`, nome: '', ind: null, estagio: null }) as unknown as CartaoSistema)).map((x) => (
          <button
            key={x.chave}
            type="button"
            className={`pi-cartao${x.chave === sistema ? ' is-ativo' : ''}${x.chave === 'sim' ? ' is-sim' : ''}`}
            style={{ '--faixa': x.estagio ? `var(--pi-${x.estagio.classe})` : undefined } as React.CSSProperties}
            onClick={() => x.nome && escolherSistema(x.chave)}
            aria-pressed={x.chave === sistema}
            disabled={!x.nome}
          >
            <span className="pi-cartao-nome">{x.nome || ' '}</span>
            <span className="pi-cartao-v">{x.ind ? fmt(x.ind.volumePct, 2, '%') : resumo.carregando ? <i className="pi-esq" /> : '—'}</span>
            {x.estagio && <span className={`pi-faixa is-${x.estagio.classe}`}>{x.estagio.nome}</span>}
            {x.ind && (
              <span className="pi-cartao-var">
                <span className={classeVar(x.ind.var1d)}>24 h {sinal(x.ind.var1d)}</span>
                <span className={classeVar(x.ind.var7d)}>7 d {sinal(x.ind.var7d)}</span>
                <span className={classeVar(x.ind.var30d)}>30 d {sinal(x.ind.var30d)}</span>
              </span>
            )}
            {x.erro && <span className="pi-erro">Dado indisponível</span>}
            {x.ind && x.ind.volumePct === null && <span className="pi-erro">Sem dado recente no SSD</span>}
          </button>
        ))}
      </section>

      {/* indicadores do local em foco */}
      <section className="pi-foco" aria-label={`Indicadores — ${nomeLocal}`}>
        <h3>
          {nomeLocal}
          {escolhido && (
            <button type="button" className="pi-link" onClick={() => setLocal(null)}>
              voltar para o sistema
            </button>
          )}
        </h3>
        {(() => {
          const i = escolhido?.ind ?? atual?.ind ?? (sistema === 'sim' ? sim?.ind : null);
          const itens: [string, string, string?][] = [
            ['Volume útil', fmt(i?.volumePct, 2, '%')],
            ['Armazenamento', fmt(i?.volumeHm3, 2, ' hm³'), i?.capacidadeHm3 ? `capacidade útil ≈ ${fmt(i.capacidadeHm3, 1, ' hm³')} (calculada)` : undefined],
            ['Chuva do dia', fmt(i?.chuvaDia, 1, ' mm')],
            ['Chuva no mês', fmt(i?.chuvaMes, 1, ' mm')],
            ['Chuva em 30 dias', fmt(i?.chuva30d, 1, ' mm')],
            ['Vazão natural', fmt(i?.natural, 2, ' m³/s')],
            ['Vazão afluente', fmt(i?.afluente, 2, ' m³/s')],
            ['Vazão defluente', fmt(i?.defluente, 2, ' m³/s')],
          ];
          return (
            <div className="pi-foco-itens">
              {itens.map(([r, v, n]) => (
                <div key={r} className="pi-foco-item">
                  <small>{r}</small>
                  <b>{v}</b>
                  {n && <em>{n}</em>}
                </div>
              ))}
              {i?.dataUsada && i.dataUsada !== data && <div className="pi-aviso">Sem dado em {dataBr(data)}: mostrando {dataBr(i.dataUsada)}.</div>}
            </div>
          );
        })()}
      </section>

      {/* segunda linha: mapa do SSD + evolução */}
      <section className="pi-linha pi-linha--2">
        <div className="pi-card">
          <h3>
            <i className="bi bi-map" /> Sistemas produtores — mapa do SSD
          </h3>
          <DiagramaSsd nome="map-home" data={data} rotulo="Mapa dos sistemas produtores do SSD" aoEscolherSistema={(s) => SISTEMA_DO_MAPA[s] && escolherSistema(SISTEMA_DO_MAPA[s])} />
          <p className="pi-nota">Clique num sistema para ver os gráficos dele. Billings e Paraíba do Sul aparecem só no mapa.</p>
        </div>
        <div className="pi-card">
          <div className="pi-card-topo">
            <h3>
              <i className="bi bi-graph-up" /> Evolução do volume útil — {nomeLocal}
            </h3>
            <div className="pi-periodos" role="group" aria-label="Período">
              {PERIODOS.map((p) => (
                <button key={p} type="button" className={periodo === p ? 'is-ativo' : ''} onClick={() => setPeriodo(p)}>
                  {p} d
                </button>
              ))}
              <button type="button" className={periodo === 'livre' ? 'is-ativo' : ''} onClick={() => setPeriodo('livre')}>
                Período
              </button>
              {periodo === 'livre' && (
                <span className="pi-livre">
                  <input type="date" aria-label="Início" value={livre.de} max={data} onChange={(e) => setLivre((l) => ({ ...l, de: e.target.value }))} />
                  <input type="date" aria-label="Fim" value={livre.ate} max={hoje} onChange={(e) => setLivre((l) => ({ ...l, ate: e.target.value }))} />
                </span>
              )}
            </div>
          </div>
          <Estado carregando={series.carregando} erro={series.erro}>
            <EChart opcao={opEvolucao} altura={340} rotulo={`Volume útil de ${nomeLocal} em ${anoAtual} e ${anoAtual - 1}`} />
          </Estado>
          <p className="pi-nota">
            {dataBr(de)} a {dataBr(ate)} × mesmo período de {anoAtual - 1}, alinhados por dia e mês.{comFaixas && ' Tracejados: faixas do Protocolo de Escassez (60, 40, 30 e 20%).'}
          </p>
        </div>
      </section>

      {/* terceira linha: chuva, vazões e balanço */}
      <section className="pi-linha pi-linha--3">
        <div className="pi-card">
          <h3>
            <i className="bi bi-cloud-rain-heavy" /> Precipitação — {nomeLocal}
          </h3>
          <Estado carregando={series.carregando} erro={series.erro}>
            <EChart opcao={opChuva} rotulo={`Chuva diária e acumulada de ${nomeLocal}`} />
          </Estado>
        </div>
        <div className="pi-card">
          <h3>
            <i className="bi bi-water" /> Vazões — {nomeLocal}
          </h3>
          <Estado carregando={series.carregando} erro={series.erro}>
            <EChart opcao={opVazoes} rotulo={`Vazões de ${nomeLocal}`} />
          </Estado>
        </div>
        <div className="pi-card">
          <h3>
            <i className="bi bi-arrow-left-right" /> Balanço hídrico — {nomeLocal}
          </h3>
          <Estado carregando={series.carregando} erro={series.erro}>
            <EChart opcao={opBalanco} rotulo={`Entradas, saídas e variação do armazenamento de ${nomeLocal}`} />
          </Estado>
          <p className="pi-nota">Variação do armazenamento em m³/s equivalentes. Evaporação e perdas não são medidas no SSD: a conta não fecha exatamente.</p>
        </div>
      </section>

      {/* quarta linha: reservatórios do sistema */}
      <section className="pi-card pi-detalhe">
        <h3>
          <i className="bi bi-diagram-3" /> {atual && sistema !== 'sim' ? `Reservatórios — ${atual.nome}` : 'Reservatórios'}
        </h3>
        {!temDetalhe ? (
          <p className="pi-nota">
            {sistema === 'sim'
              ? 'Escolha um sistema (nos cartões, no mapa ou na lista) para ver os reservatórios. O detalhamento começa pelo Cantareira.'
              : 'Detalhamento por reservatório ainda não preparado para este sistema (começamos pelo Cantareira).'}
          </p>
        ) : (
          <Estado carregando={detalhe.carregando} erro={detalhe.erro}>
            {det && (
              <>
                <div className="pi-res-grade">
                  {det.reservatorios.map((r) => (
                    <CartaoReservatorio key={r.space} l={r} ativo={local === r.space} aoEscolher={() => setLocal(local === r.space ? null : r.space)} />
                  ))}
                </div>
                <div className="pi-linha pi-linha--det">
                  <div className="pi-card pi-card--dentro">
                    <h4>Diagrama do Sistema Cantareira (SSD)</h4>
                    <DiagramaSsd
                      nome={det.diagrama}
                      data={data}
                      destaque={local}
                      rotulo="Diagrama unifilar do Sistema Cantareira, do SSD"
                      aoEscolherLocal={(sp) => locaisDetalhe.some((l) => l.space === sp) && setLocal(local === sp ? null : sp)}
                    />
                  </div>
                  <div className="pi-coluna">
                    <div className="pi-card pi-card--dentro">
                      <h4>Distribuição do armazenamento</h4>
                      <EChart opcao={opDistribuicao} altura={230} rotulo="Armazenamento de cada reservatório do Cantareira" />
                      <p className="pi-nota">
                        Soma dos reservatórios: {fmt(somaReservatorios, 2, ' hm³')} · Sistema Equivalente (SSD): {fmt(atual?.ind?.volumeHm3, 2, ' hm³')}.
                      </p>
                    </div>
                    <div className="pi-card pi-card--dentro">
                      <h4>UHE Jaguari e transposição Paraíba do Sul</h4>
                      <div className="pi-res-grade pi-res-grade--1">
                        {det.aParte.map((r) => (
                          <CartaoReservatorio key={r.space} l={r} ativo={local === r.space} aoEscolher={() => setLocal(local === r.space ? null : r.space)} nota="Bacia do Paraíba do Sul — fora do Sistema Equivalente" />
                        ))}
                      </div>
                      <ul className="pi-transf">
                        {det.transferencias.map((t) => (
                          <li key={t.space}>
                            {t.nome}: <b>{fmt(t.vazao, 2, ' m³/s')}</b>
                            {t.dataUsada && t.dataUsada !== data && <small> (dado de {dataBr(t.dataUsada)})</small>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="pi-card pi-card--dentro">
                  <h4>Variação diária do volume útil — {nomeLocal}</h4>
                  <Estado carregando={series.carregando} erro={series.erro}>
                    <EChart opcao={opVariacao} altura={240} rotulo={`Variação diária do volume útil de ${nomeLocal}`} />
                  </Estado>
                  <p className="pi-nota">Verde: recuperação; vermelho: redução (pontos percentuais por dia).</p>
                </div>
              </>
            )}
          </Estado>
        )}
      </section>
    </div>
  );
}
