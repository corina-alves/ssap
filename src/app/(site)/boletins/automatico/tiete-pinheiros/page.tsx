import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { connection } from 'next/server';
import { cache, Suspense } from 'react';
import '@/styles/legado/pagina-sumario-automatico.css';
import { Hero } from '@/components/site/layout';
import { EIXOS, OPERACIONAL, PENHA_JUSANTE, PENHA_MONTANTE, PROPAGACAO } from '@/conteudo/sumario-automatico-tp';
import {
  chuva,
  comportas,
  emae,
  niveis,
  referencias,
  SITUACOES,
  vazaoBarragemPenha,
  type Comportas,
  type Estrutura,
  type Ponto,
  type Situacao,
} from '@/lib/boletins-sala/sumario-automatico-tp';
import { dataBr, dataHora, hora } from '@/lib/formato';
import { AtualizacaoAutomatica, DiagramaUnifilar } from './ao-vivo';

export const metadata: Metadata = {
  title: 'Sumário Executivo Automático — Alto Tietê/Pinheiros',
  description: 'Situação das estruturas e dos pontos de monitoramento do sistema Tietê-Pinheiros, atualizada automaticamente com dados do SIBH e da EMAE.',
};

const DIAGRAMA_SIBH = 'https://apps.spaguas.sp.gov.br/sibh/diagramas/tiete_pinheiros/?vw=flow&dg=tiete-pinheiros&bf=completo&bs=medio';

// Uma consulta por fonte em cada requisição, dividida entre os blocos da página.
const ref = cache(() => referencias());
const dadosNiveis = cache(() => niveis(ref()));
const dadosComportas = cache(() => comportas());
const dadosEmae = cache(() => emae(ref()));
const dadosChuva = cache(() => chuva());

// ---------------------------------------------------------------- formatação

const fmt = (n: number | null | undefined, casas = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtSinal = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${fmt(n)}`);
const comSeta = (n: number | null) => (n === null ? '—' : `${fmt(n)} ${n > 0 ? '↑' : n < 0 ? '↓' : '→'}`);
const classeVar = (n: number | null) => (n === null ? undefined : n > 0 ? 'sat-sobe' : n < 0 ? 'sat-desce' : 'sat-estavel');
const diaMes = (iso: string) => dataBr(iso).slice(0, 5);
const lista = (itens: string[]) => (itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);

const CLASSE: Record<Situacao, string> = {
  NORMAL: 'normal',
  ATENÇÃO: 'atencao',
  ALERTA: 'alerta',
  EMERGÊNCIA: 'emergencia',
  EXTRAVASAMENTO: 'extravasamento',
};

/** Tendência pelo movimento desde as 07h de hoje (ou, sem ele, pela variação de 24 h). */
function tendencia(p: Ponto): { texto: string; classe?: string } {
  const v = p.desde07 ?? p.variacao24h;
  if (v === null) return { texto: '—' };
  return { texto: v > 0 ? '↑ Subida' : v < 0 ? '↓ Queda' : '→ Estável', classe: classeVar(v) };
}

// ---------------------------------------------------------------- peças

function Cabecalho({ titulo, subtitulo, rotulo, valor }: { titulo: string; subtitulo: string; rotulo: string; valor: string }) {
  return (
    <header className="sat-cabecalho">
      <div>
        <h2>{titulo}</h2>
        <div className="sat-subtitulo">{subtitulo}</div>
        <div className="sat-situacao">
          {rotulo} | <span>{valor}</span>
        </div>
      </div>
      <Image src="/boletins/automatico/spaguas.png" alt="SP Águas" width={2513} height={1587} sizes="80px" className="sat-logo" />
    </header>
  );
}

const Aviso = ({ texto }: { texto: string }) => (
  <div className="sat-aviso">
    <i className="bi bi-exclamation-circle" /> {texto}
  </div>
);
const Carregando = () => (
  <div className="sat-carregando">
    <span className="spinner-border spinner-border-sm" /> Carregando dados…
  </div>
);

// ---------------------------------------------------------------- chuva

async function Chuva() {
  const c = await dadosChuva();
  if (!c.ok) return <Aviso texto={c.mensagem} />;
  const d = c.dados;
  return (
    <>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-chuva">
          <thead>
            <tr>
              <th>Últimas 3 h</th>
              <th>Últimas 24 h</th>
              <th>Previsão 24 h</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{fmt(d.ultimas3h, 1)} mm</td>
              <td>{fmt(d.ultimas24h, 1)} mm</td>
              <td>{fmt(d.previsao24h, 1)} mm</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sat-nota">
        Fontes: Previsão — Open-Meteo (média na área da RMSP) | Chuva observada — rede telemétrica SP-ÁGUAS ({d.postos} postos na RMSP) | Atualizado em{' '}
        {dataHora(c.obtidoEm)}
      </p>
    </>
  );
}

// ---------------------------------------------------------------- estruturas

function textoMovel(m: NonNullable<Comportas['movel']>): string[] {
  const { superficie: s, fundo: f } = m;
  if (f.total > 0 && f.abertas === f.total) return ['Totalmente aberta'];
  const linha1 = s.abertas === s.total ? `${s.abertas} comportas de superfície abertas operando na normalidade` : `${s.abertas} de ${s.total} comportas de superfície abertas`;
  if (!f.total) return [linha1];
  const fechadas = f.total - f.abertas;
  return [linha1, fechadas === f.total ? `${fechadas} comportas de fundo fechadas` : `${f.abertas} de ${f.total} comportas de fundo abertas`];
}

function CelulasEmae({ nome, e }: { nome: string; e: Estrutura | null }) {
  return (
    <>
      <td>
        {nome} <sup className="sat-fonte">(2)</sup>
      </td>
      <td>
        {fmt(e?.cota)}
        {e?.volumePct !== null && e?.volumePct !== undefined && (
          <>
            <br />
            {fmt(e.volumePct)}% volume útil
          </>
        )}
      </td>
      <td>{fmt(e?.vazao, 0)}</td>
      <td className={classeVar(e?.desde07 ?? null)}>{comSeta(e?.desde07 ?? null)}</td>
      <td className={classeVar(e?.variacao24h ?? null)}>{comSeta(e?.variacao24h ?? null)}</td>
    </>
  );
}

async function Estruturas() {
  const [n, c, e] = await Promise.all([dadosNiveis(), dadosComportas(), dadosEmae()]);
  const ponto = (id: number) => (n.ok ? (n.dados.pontos.find((p) => p.id === id) ?? null) : null);
  const mont = ponto(PENHA_MONTANTE);
  const jus = ponto(PENHA_JUSANTE);
  const estrutura = (nome: string) => (e.ok ? (e.dados.estruturas[nome] ?? null) : null);

  const operacao = (fonte: (typeof OPERACIONAL)[number]['fonte']): string[] | null => {
    if (fonte === 'penha') return c.ok && c.dados.penha ? [`${c.dados.penha.abertas} de ${c.dados.penha.total} comportas abertas`] : ['—'];
    if (fonte === 'movel') return c.ok && c.dados.movel ? textoMovel(c.dados.movel) : ['—'];
    if (fonte === null) return null;
    const t = e.ok ? { retiro: e.dados.operacao.retiro, 'usina-sp': e.dados.operacao.usinaSp, pedreira: e.dados.operacao.pedreira }[fonte] : null;
    return [t ?? '—'];
  };

  return (
    <>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-eixos">
          <thead>
            <tr>
              <th style={{ width: '12%' }}>Eixo</th>
              <th style={{ width: '26%' }}>Estrutura / ponto</th>
              <th style={{ width: '18%' }}>Cota atual (m)</th>
              <th style={{ width: '12%' }}>Vazão (m³/s)</th>
              <th style={{ width: '16%' }}>Variação desde 07h (m)</th>
              <th style={{ width: '16%' }}>Variação 24h, 07h–07h (m)</th>
            </tr>
          </thead>
          <tbody>
            {EIXOS.map((g) =>
              g.estruturas.map((nome, i) => (
                <tr key={nome} className={g.destaque ? 'sat-destaque' : undefined}>
                  {i === 0 && (
                    <td rowSpan={g.estruturas.length} className="sat-eixo">
                      {g.eixo}
                    </td>
                  )}
                  {nome === 'Barragem da Penha' ? (
                    <>
                      <td>
                        Barragem da Penha <sup className="sat-fonte">(1)</sup>
                      </td>
                      <td>
                        {fmt(mont?.atual)} (Montante)
                        <br />
                        {fmt(jus?.atual)} (Jusante)
                      </td>
                      <td>{fmt(vazaoBarragemPenha(mont?.atual ?? null, c.ok ? c.dados.penha : null))}</td>
                      <td>
                        <span className={classeVar(mont?.desde07 ?? null)}>{comSeta(mont?.desde07 ?? null)}</span>
                        <br />
                        <span className={classeVar(jus?.desde07 ?? null)}>{comSeta(jus?.desde07 ?? null)}</span>
                      </td>
                      <td>
                        <span className={classeVar(mont?.variacao24h ?? null)}>{comSeta(mont?.variacao24h ?? null)}</span>
                        <br />
                        <span className={classeVar(jus?.variacao24h ?? null)}>{comSeta(jus?.variacao24h ?? null)}</span>
                      </td>
                    </>
                  ) : (
                    <CelulasEmae nome={nome} e={estrutura(nome)} />
                  )}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <p className="sat-nota">
        *As cotas apresentadas possuem referenciais altimétricos distintos (dados da EMAE seguem o referencial EPUSP/POLI-LIGHT e os da SP-Águas, o IGG). Para fins de
        comparação, as cotas da EMAE já estão convertidas para o IGG (cota IGG = cota EPUSP + 1,39 m), o que não representa diferença física de nível d&apos;água.
        <br />
        Fonte dos dados: <sup className="sat-fonte">(1)</sup>SP-ÁGUAS <sup className="sat-fonte">(2)</sup>EMAE
        {e.ok && e.dados.hora !== null && ` — planilha da EMAE, leitura das ${String(e.dados.hora).padStart(2, '0')}h`}
      </p>
      {!e.ok && <Aviso texto={`${e.mensagem} As estruturas marcadas com (2) aparecem quando a planilha da EMAE estiver disponível.`} />}
      {!n.ok && <Aviso texto={`Barragem da Penha: ${n.mensagem}`} />}

      <h3 className="sat-secao">SITUAÇÃO OPERACIONAL DAS ESTRUTURAS</h3>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-op">
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Estrutura / componentes</th>
              <th style={{ width: '16%' }}>Local</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {OPERACIONAL.map((o) => {
              const linhas = operacao(o.fonte);
              return (
                <tr key={o.nome}>
                  <td>{o.nome}</td>
                  <td>{o.local}</td>
                  <td>
                    {linhas === null ? (
                      <span className="sat-mudo">Sem fonte automática</span>
                    ) : (
                      linhas.map((l, i) => (
                        <span key={l} className="sat-linha">
                          {i > 0 && <br />}
                          {l}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- pontos de monitoramento

function diagnostico(criticos: Ponto[]): string {
  if (!criticos.length) return 'Nenhum ponto monitorado está em atenção, alerta, emergência ou extravasamento neste momento.';
  const partes = [...SITUACOES].reverse().flatMap((s) => {
    const k = criticos.filter((p) => p.situacao === s).length;
    return s !== 'NORMAL' && k ? [`${k} em ${s.toLowerCase()}`] : [];
  });
  let texto = `${criticos.length} ${criticos.length === 1 ? 'ponto pede' : 'pontos pedem'} acompanhamento: ${lista(partes)}.`;
  const extrav = criticos.filter((p) => p.situacao === 'EXTRAVASAMENTO' && p.acima !== null);
  if (extrav.length) {
    const maior = extrav.reduce((a, b) => ((b.acima ?? 0) > (a.acima ?? 0) ? b : a));
    texto += ` Maior excedência da cota de extravasamento em ${maior.curto} (${fmtSinal(maior.acima)} m).`;
  }
  return texto;
}

function Sintese({ p, ontem, dia }: { p: Ponto; ontem: string; dia: string }) {
  const cota = p.cotas?.extravasamento ?? null;
  const v24 = p.variacao24h;
  const desde = p.desde07;
  return (
    <p>
      <strong className={`sat-nome sat-nome--${CLASSE[p.situacao]}`}>
        {p.nome} ({p.prefix}):
      </strong>{' '}
      em <strong>{p.situacao.toLowerCase()}</strong>, com nível de <strong>{fmt(p.atual)} m</strong> às {hora(p.atualEm ? new Date(p.atualEm) : null)}
      {p.acima !== null && cota !== null && (
        <>
          , <strong>{fmt(Math.abs(p.acima))} m {p.acima >= 0 ? 'acima' : 'abaixo'}</strong> da cota de extravasamento de {fmt(cota)} m
        </>
      )}
      .{' '}
      {v24 !== null && (
        <>
          Entre as 07h de {diaMes(ontem)} e as 07h de {diaMes(dia)}, o nível{' '}
          {v24 === 0 ? 'ficou estável' : <strong>{`${v24 > 0 ? 'subiu' : 'desceu'} ${fmt(Math.abs(v24))} m`}</strong>}.{' '}
        </>
      )}
      {desde !== null && <>Desde as 07h, o nível está em {desde > 0 ? 'subida' : desde < 0 ? 'queda' : 'estabilidade'}.</>}
    </p>
  );
}

async function Pontos() {
  const r = ref();
  const n = await dadosNiveis();
  if (!n.ok) return <Aviso texto={n.mensagem} />;
  const { pontos, atualizadoEm } = n.dados;
  const comDado = pontos.filter((p) => p.atual !== null);
  const conta = (s: Situacao) => comDado.filter((p) => p.situacao === s).length;
  const gravidade = (p: Ponto) => SITUACOES.indexOf(p.situacao);
  const criticos = comDado.filter((p) => p.situacao !== 'NORMAL').sort((a, b) => gravidade(b) - gravidade(a) || (b.acima ?? -99) - (a.acima ?? -99));
  const cabecalhoNiveis = (
    <>
      <th>07h {diaMes(r.ontem)}</th>
      <th>07h {diaMes(r.dia)}</th>
      <th>Agora</th>
      <th>Variação 24h</th>
    </>
  );

  return (
    <>
      <p className="sat-ultima">Última leitura recebida: {dataHora(atualizadoEm ? new Date(atualizadoEm) : null)}</p>
      <section className="sat-cards" aria-label="Resumo da situação dos pontos">
        <div className="sat-card sat-card--total">
          <div className="sat-card__num">{comDado.length}</div>
          <div className="sat-card__rotulo">PONTOS MONITORADOS</div>
        </div>
        {SITUACOES.map((s) => (
          <div key={s} className={`sat-card sat-card--${CLASSE[s]}`}>
            <div className="sat-card__num">{conta(s)}</div>
            <div className="sat-card__rotulo">{s}</div>
          </div>
        ))}
      </section>

      <h3 className="sat-secao">LEITURA DO SISTEMA — PROPAGAÇÃO DA CHEIA NO TIETÊ</h3>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-propagacao">
          <thead>
            <tr>
              {PROPAGACAO.map((x) => (
                <th key={x.id}>{x.rotulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {PROPAGACAO.map((x) => {
                const p = pontos.find((q) => q.id === x.id);
                const s = p && p.atual !== null ? p.situacao : null;
                return (
                  <td key={x.id} className={`sat-sit sat-sit--${s ? CLASSE[s] : 'semdado'}`}>
                    {s ?? 'SEM DADO'}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="sat-secao">PONTOS EM ATENÇÃO, ALERTA, EMERGÊNCIA OU EXTRAVASAMENTO</h3>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-criticos">
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Pontos críticos</th>
              {cabecalhoNiveis}
              <th>Acima da cota</th>
              <th>Tendência</th>
            </tr>
          </thead>
          <tbody>
            {criticos.length === 0 ? (
              <tr>
                <td colSpan={7} className="sat-vazio">
                  Nenhum ponto em atenção, alerta, emergência ou extravasamento no momento.
                </td>
              </tr>
            ) : (
              criticos.map((p) => {
                const t = tendencia(p);
                return (
                  <tr key={p.id}>
                    <td>
                      <span className={`sat-selo sat-sit--${CLASSE[p.situacao]}`}>{p.situacao}</span> {p.nome}
                    </td>
                    <td>{fmt(p.h7Ontem)} m</td>
                    <td>{fmt(p.h7Hoje)} m</td>
                    <td>{fmt(p.atual)} m</td>
                    <td className={classeVar(p.variacao24h)}>{fmtSinal(p.variacao24h)} m</td>
                    <td className="sat-acima">{fmtSinal(p.acima)} m</td>
                    <td className={`sat-tendencia ${t.classe ?? ''}`}>{t.texto}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="sat-nota">
        Variação 24h: nível às 07h de {diaMes(r.dia)} menos o das 07h de {diaMes(r.ontem)}. Acima da cota: nível agora menos a cota de extravasamento cadastrada no SIBH. Tendência:
        movimento desde as 07h.
      </p>

      <div className="sat-diagnostico">
        <strong>DIAGNÓSTICO EXECUTIVO</strong> {diagnostico(criticos)}
      </div>

      {criticos.length > 0 && (
        <>
          <h3 className="sat-secao">SÍNTESE DA SITUAÇÃO NOS PONTOS EM DESTAQUE</h3>
          <div className="sat-sintese">
            {criticos.map((p) => (
              <Sintese key={p.id} p={p} ontem={r.ontem} dia={r.dia} />
            ))}
          </div>
        </>
      )}

      <details className="sat-todos">
        <summary>Ver todos os {pontos.length} pontos monitorados</summary>
        <div className="sat-rolagem">
          <table className="sat-tabela">
            <thead>
              <tr>
                <th>Ponto</th>
                <th>Situação</th>
                {cabecalhoNiveis}
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome}</td>
                  <td>{p.atual === null ? <span className="sat-mudo">Sem dado</span> : <span className={`sat-selo sat-sit--${CLASSE[p.situacao]}`}>{p.situacao}</span>}</td>
                  <td>{fmt(p.h7Ontem)}</td>
                  <td>{fmt(p.h7Hoje)}</td>
                  <td>{fmt(p.atual)}</td>
                  <td className={classeVar(p.variacao24h)}>{fmtSinal(p.variacao24h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

// ---------------------------------------------------------------- página

export default async function SumarioAutomatico() {
  await connection(); // dados de agora: nunca pré-renderizar
  const r = ref();
  const agora = dataHora(new Date(r.agora));

  return (
    <>
      <Hero
        kicker="Atualização automática"
        titulo="Sumário Executivo Automático — Alto Tietê/Pinheiros"
        texto="Situação das estruturas e dos pontos de monitoramento do sistema Tietê-Pinheiros, com os dados do SIBH e da EMAE atualizados automaticamente."
        icone="bi-broadcast"
      />
      <main className="sssp-main sat">
        <div className="container">
          <div className="sat-barra">
            <span>
              <i className="bi bi-arrow-repeat" /> Consulta de {agora}. A página se atualiza sozinha a cada 5 minutos.
            </span>
            <Link href="/boletins/alto-tiete-pinheiros" className="sat-barra__link">
              <i className="bi bi-file-earmark-pdf" /> Sumários publicados (PDF)
            </Link>
            <AtualizacaoAutomatica />
          </div>

          <section className="sat-pagina">
            <Cabecalho titulo="SUMÁRIO EXECUTIVO" subtitulo="OPERAÇÃO DE CONTROLE DE CHEIAS — ATUALIZAÇÃO AUTOMÁTICA" rotulo="SITUAÇÃO GERAL" valor={agora} />
            <h3 className="sat-secao">SISTEMA TIETÊ-PINHEIROS: EIXOS PRINCIPAIS E ESTRUTURAS</h3>
            <Image
              src="/boletins/automatico/diagrama.png"
              alt="Esquema do sistema Tietê-Pinheiros: eixos principais e estruturas"
              width={2172}
              height={569}
              sizes="(max-width: 860px) 100vw, 760px"
              className="sat-esquema"
            />
            <h3 className="sat-secao">CHUVA NA REGIÃO METROPOLITANA DE SÃO PAULO (RMSP)</h3>
            <Suspense fallback={<Carregando />}>
              <Chuva />
            </Suspense>
            <h3 className="sat-secao">SITUAÇÃO ATUAL DAS ESTRUTURAS DO SISTEMA TIETÊ-PINHEIROS</h3>
            <Suspense fallback={<Carregando />}>
              <Estruturas />
            </Suspense>
          </section>

          <section className="sat-pagina">
            <Cabecalho
              titulo="SITUAÇÃO DOS PONTOS DE MONITORAMENTO (NÍVEL)"
              subtitulo="SISTEMA TIETÊ-PINHEIROS — DADOS AUTOMÁTICOS VIA API SIBH-SPÁGUAS"
              rotulo="CONSULTA DE"
              valor={agora}
            />
            <Suspense fallback={<Carregando />}>
              <Pontos />
            </Suspense>
          </section>

          <section className="sat-pagina sat-pagina--larga">
            <Cabecalho
              titulo="DIAGRAMA UNIFILAR SISTEMA TIETÊ-PINHEIROS"
              subtitulo="DIAGRAMA INTERATIVO EM TEMPO REAL — PLATAFORMA SIBH-SPÁGUAS"
              rotulo="FONTE"
              valor="apps.spaguas.sp.gov.br/sibh/diagramas/tiete_pinheiros"
            />
            <DiagramaUnifilar src={DIAGRAMA_SIBH} />
          </section>
        </div>
      </main>
    </>
  );
}
