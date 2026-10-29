import type { Metadata } from 'next';
import Form from 'next/form';
import Image from 'next/image';
import Link from 'next/link';
import { connection } from 'next/server';
import { cache, Suspense } from 'react';
import '@/styles/legado/pagina-sumario-automatico.css';
import '@/styles/legado/pagina-boletim-ribeira.css';
import { Hero } from '@/components/site/layout';
import { CAPIVARI, COPEL_PAGINA, DIAGRAMA_SIBH_RIBEIRA, PROPAGACAO_RIBEIRA } from '@/conteudo/boletim-ribeira';
import { chuva, escolherPeriodo, estruturas, MAX_PERIODO_DIAS, niveis, paraCampo, volumeCopel, type Periodo } from '@/lib/boletins-sala/boletim-ribeira';
import {
  dataHoraCab,
  diagnostico,
  diaMes,
  fmt,
  fmtSinal,
  hora,
  periodo,
  rotuloSituacao,
  sintese,
  sinteseResumo,
  SITUACOES,
  TEXTO_TENDENCIA,
  textoVolumeCopel,
  type PontoRibeira,
  type Trecho,
} from '@/lib/boletins-sala/boletim-ribeira-regras';
import { AtualizacaoAutomatica, DiagramaUnifilar } from '../tiete-pinheiros/ao-vivo';

export const metadata: Metadata = {
  title: 'Sumário Executivo — Vale do Ribeira',
  description:
    'Sumário Executivo de controle de cheias do Vale do Ribeira de Iguape, fechado das 07h às 07h e gerado automaticamente com os dados do SIBH, da Open-Meteo e da Copel, sem edição manual.',
};

const PDF = '/boletins/automatico/vale-do-ribeira/pdf';
/** A página acompanha o fechamento das 07h e as leituras que chegarem atrasadas. */
const ATUALIZAR_MS = 10 * 60_000;

// Uma consulta por fonte em cada requisição, dividida entre os blocos da página
// (o mesmo objeto de período passa por todos os blocos).
const dadosNiveis = cache((r: Periodo) => niveis(r));
const dadosEstruturas = cache((r: Periodo) => estruturas(r));
const dadosChuva = cache((r: Periodo) => chuva(r));
const dadosCopel = cache((r: Periodo) => volumeCopel(r));

// ---------------------------------------------------------------- formatação

const CLASSE: Record<string, string> = {
  NORMAL: 'normal',
  ATENÇÃO: 'atencao',
  ALERTA: 'alerta',
  EMERGÊNCIA: 'emergencia',
  EXTRAVASAMENTO: 'extravasamento',
  'SEM DADO': 'semdado',
  'SEM COTAS': 'semdado',
};
const classeVar = (n: number | null) => (n === null ? undefined : n > 0 ? 'sat-sobe' : n < 0 ? 'sat-desce' : 'sat-estavel');
const comSeta = (n: number | null) => (n === null ? '—' : `${fmtSinal(n)} ${n > 0 ? '↑' : n < 0 ? '↓' : '→'}`);
const metros = (n: number | null) => (n === null ? '—' : `${fmt(n)} m`);
const tendenciaTexto = (n: number | null, t: keyof typeof TEXTO_TENDENCIA | null) => (t ? `${n! > 0 ? '↑' : n! < 0 ? '↓' : '→'} ${TEXTO_TENDENCIA[t]}` : '—');
const nomeSintese = (nome: string) => nome.replace(/\s*\(([^)]+)\)\s*$/, ', $1');
const Trechos = ({ trechos }: { trechos: Trecho[] }) => trechos.map((x, i) => (x.b ? <strong key={i}>{x.t}</strong> : <span key={i}>{x.t}</span>));

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

// ---------------------------------------------------------------- página 1: chuva

async function Chuva({ r }: { r: Periodo }) {
  const c = await dadosChuva(r);
  if (!c.ok) return <Aviso texto={c.mensagem} />;
  const d = c.dados;
  return (
    <>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-chuva">
          <thead>
            <tr>
              <th>Últimas 3hrs (mm)</th>
              <th>Últimas 24hrs (mm)</th>
              <th>Previsão 24hrs (mm)</th>
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
        Fontes: Previsão - Open-Meteo (média na área da UGRHI 11, {d.pontosPrevisao} pontos de grade, 24 h seguintes às {hora(r.t07)}) | Chuva observada - rede telemétrica SP-ÁGUAS ({d.postos} postos,
        acumulado até as {hora(r.t07)}) | Atualizado em {dataHoraCab(r.t07)}
      </p>
    </>
  );
}

// ---------------------------------------------------------------- página 1: estruturas de interesse (Capivari)

async function Estruturas({ r }: { r: Periodo }) {
  const [e, copel] = await Promise.all([dadosEstruturas(r), dadosCopel(r)]);
  const c = e.ok ? e.dados.capivari : null;
  const vol = textoVolumeCopel(copel);
  const per = periodo(r.t07Ontem, r.t07);
  return (
    <>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-eixos">
          <thead>
            <tr>
              <th style={{ width: '12%' }}>Eixo</th>
              <th style={{ width: '22%' }}>Estrutura</th>
              <th style={{ width: '12%' }}>Volume útil (%)</th>
              <th style={{ width: '14%' }}>
                Cota atual <sup className="sat-fonte">(1)</sup> (m)
              </th>
              <th style={{ width: '14%' }}>Vazão defluente (m³/s)</th>
              <th style={{ width: '13%' }}>Variação (m) ({per})</th>
              <th style={{ width: '13%' }}>Variação (m³/s) ({per})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ whiteSpace: 'nowrap' }}>Rio Capivari</td>
              <td>
                Barragem Capivari — UHE Gov. Parigot de Souza ({CAPIVARI.prefix})
              </td>
              <td className="bri-copel">{vol.valor}</td>
              <td>{fmt(c?.cota)}</td>
              <td>{fmt(c?.vazao)}</td>
              <td className={classeVar(c?.variacaoCota ?? null)}>{comSeta(c?.variacaoCota ?? null)}</td>
              <td className={classeVar(c?.variacaoVazao ?? null)}>{comSeta(c?.variacaoVazao ?? null)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sat-nota">
        <sup className="sat-fonte">(1)</sup> Nível máximo de operação (m): {fmt(CAPIVARI.nivelMaximoOperacao)}; Nível máximo maximorum (m): {fmt(CAPIVARI.nivelMaximoMaximorum)}. Fonte dos dados:
        SIBH-SPÁGUAS / ANA (posto {CAPIVARI.prefix}). Volume útil: {vol.detalhe} Fonte:{' '}
        <a href={COPEL_PAGINA} target="_blank" rel="noopener noreferrer">
          Copel — Monitoramento Hidrológico de Bacias
        </a>
        .
      </p>
      {!e.ok && <Aviso texto={`Cota e vazão do Capivari: ${e.mensagem}`} />}
    </>
  );
}

// ---------------------------------------------------------------- página 1: barramentos

async function Barramentos({ r }: { r: Periodo }) {
  const e = await dadosEstruturas(r);
  if (!e.ok) return <Aviso texto={e.mensagem} />;
  return (
    <>
      <div className="sat-rolagem">
        <table className="sat-tabela bri-barramentos">
          <thead>
            <tr>
              <th style={{ width: '28%' }}>PONTO</th>
              <th style={{ width: '15%' }}>NÍVEL ANTERIOR</th>
              <th style={{ width: '15%' }}>NÍVEL ATUAL</th>
              <th style={{ width: '13%' }}>JUSANTE</th>
              <th style={{ width: '15%' }}>VARIAÇÃO</th>
              <th style={{ width: '14%' }}>TENDÊNCIA</th>
            </tr>
          </thead>
          <tbody>
            {e.dados.barramentos.map((b) => (
              <tr key={b.id}>
                <td>{b.nome}</td>
                <td>{metros(b.anterior)}</td>
                <td>{metros(b.atual)}</td>
                <td>{b.jusante === null ? '—' : `${fmt(b.jusante)} m³/s`}</td>
                <td className={classeVar(b.variacao)}>{b.variacao === null ? '—' : `${fmtSinal(b.variacao)} m`}</td>
                <td className={`sat-tendencia ${classeVar(b.variacao) ?? ''}`}>{tendenciaTexto(b.variacao, b.tendencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sat-nota">Fonte: SIBH-SPÁGUAS / ANA. Nível anterior: {hora(r.t07Ontem)} de {diaMes(r.t07Ontem)}; nível atual: {hora(r.t07)} de {diaMes(r.t07)}.</p>
    </>
  );
}

// ---------------------------------------------------------------- página 2: pontos de monitoramento

async function Pontos({ r }: { r: Periodo }) {
  const n = await dadosNiveis(r);
  if (!n.ok) return <Aviso texto={`Níveis dos pontos de monitoramento: ${n.mensagem}`} />;
  const pontos = [...n.dados.pontos].sort((a, b) => a.ordemRio - b.ordemRio);
  const comLeitura = pontos.filter((p) => !p.semDado);
  const conta = (s: string) => comLeitura.filter((p) => (p.semCotas ? 'NORMAL' : p.situacao) === s).length;
  // Propagação: só os pontos do eixo principal em extravasamento, de montante para jusante.
  const extravasando = PROPAGACAO_RIBEIRA.flatMap((x) => {
    const p = pontos.find((q) => q.id === x.id);
    return p && !p.semDado && !p.semCotas && p.situacao === 'EXTRAVASAMENTO' ? [{ ...x, p }] : [];
  });
  const emExtravasamento = (p: PontoRibeira) => !p.semDado && !p.semCotas && p.situacao === 'EXTRAVASAMENTO' && p.acima !== null;

  return (
    <>
      {n.desatualizado && n.dados.atualizadoEm && (
        <Aviso texto={`Atenção: a leitura mais recente recebida do SIBH até as ${hora(r.t07)} de ${diaMes(r.t07)} é de ${dataHoraCab(n.dados.atualizadoEm)}.`} />
      )}
      <section className="sat-cards" aria-label="Resumo da situação dos pontos">
        <div className="sat-card sat-card--total">
          <div className="sat-card__num">{comLeitura.length}</div>
          <div className="sat-card__rotulo">PONTOS MONITORADOS</div>
        </div>
        {SITUACOES.map((s) => (
          <div key={s} className={`sat-card sat-card--${CLASSE[s]}`}>
            <div className="sat-card__num">{conta(s)}</div>
            <div className="sat-card__rotulo">{s}</div>
          </div>
        ))}
      </section>

      <h3 className="sat-secao">LEITURA DO SISTEMA — PROPAGAÇÃO DA CHEIA NO VALE DO RIBEIRA</h3>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-propagacao">
          <thead>
            <tr>{extravasando.length ? extravasando.map((x) => <th key={x.id}>{x.rotulo}</th>) : <th>Nenhum ponto do eixo principal em extravasamento</th>}</tr>
          </thead>
          <tbody>
            <tr>
              {extravasando.length ? (
                extravasando.map((x) => (
                  <td key={x.id} className="sat-sit sat-sit--extravasamento">
                    EXTRAVASAMENTO
                  </td>
                ))
              ) : (
                <td className="sat-sit sat-sit--normal">NORMAL</td>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="sat-rolagem">
        <table className="sat-tabela bri-pontos">
          <thead>
            <tr>
              <th style={{ width: '32%' }}>PONTOS CRÍTICOS</th>
              <th style={{ width: '14%' }}>
                NÍVEL {hora(r.t07Ontem).toUpperCase()}/{diaMes(r.t07Ontem)}
              </th>
              <th style={{ width: '14%' }}>
                NÍVEL {hora(r.t07).toUpperCase()}/{diaMes(r.t07)}
              </th>
              <th style={{ width: '13%' }}>VARIAÇÃO</th>
              <th style={{ width: '13%' }}>ACIMA DA COTA</th>
              <th style={{ width: '14%' }}>TENDÊNCIA</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}</td>
                <td>{metros(p.nivel07)}</td>
                <td>{metros(p.atual)}</td>
                <td className={classeVar(p.variacao)}>{p.variacao === null ? '—' : `${fmtSinal(p.variacao)} m`}</td>
                <td className={emExtravasamento(p) ? 'sat-acima' : undefined}>{emExtravasamento(p) ? `${fmtSinal(p.acima)} m` : '—'}</td>
                <td className={`sat-tendencia ${classeVar(p.variacao) ?? ''}`}>{tendenciaTexto(p.variacao, p.tendencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sat-diagnostico">
        <strong>DIAGNÓSTICO EXECUTIVO</strong> {diagnostico(pontos, r.t07)}
      </div>

      <h3 className="sat-secao">SÍNTESE DA SITUAÇÃO NOS PONTOS COM EXTRAVASAMENTO</h3>
      <div className="sat-sintese">
        <p>{sinteseResumo(pontos)}</p>
        {pontos.map((p) => (
          <p key={p.id}>
            <strong className={`sat-nome sat-nome--${CLASSE[rotuloSituacao(p)]}`}>{nomeSintese(p.nome)}:</strong> <Trechos trechos={sintese(p, r.t07)} />
          </p>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- página

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SumarioRibeira({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection(); // o dia operacional depende da hora da consulta: nunca pré-renderizar
  const sp = await searchParams;
  const { ref: r, erro } = escolherPeriodo(um(sp.inicio), um(sp.fim));
  const fechamento = dataHoraCab(r.t07);
  const consulta = r.personalizado ? `?${new URLSearchParams({ inicio: paraCampo(r.t07Ontem), fim: paraCampo(r.t07) })}` : '';

  return (
    <>
      <Hero
        kicker="Atualização automática"
        titulo="Sumário Executivo — Vale do Ribeira"
        texto="Operação de controle de cheias no Vale do Ribeira de Iguape: o mesmo sumário que a Sala emite, gerado automaticamente com os dados oficiais. Por padrão, o período é fechado das 07h às 07h; escolha outro início e fim se precisar."
        icone="bi-broadcast"
      />
      <main className="sssp-main sat">
        <div className="container">
          <div className="sat-barra">
            <span>
              <i className="bi bi-clock-history" />{' '}
              {r.personalizado
                ? `Período escolhido: ${periodo(r.t07Ontem, r.t07)}.`
                : `Período padrão: ${periodo(r.t07Ontem, r.t07)} (24 h). O próximo fechamento é às 07h de amanhã; até lá, os dados deste sumário não mudam.`}
            </span>
            <span className="bri-botoes">
              <a href={`${PDF}${consulta}`} target="_blank" rel="noopener" className="sat-barra__link">
                <i className="bi bi-file-earmark-pdf" /> Visualizar PDF
              </a>
              <a href={`${PDF}${consulta ? `${consulta}&` : '?'}baixar=1`} className="sat-barra__link">
                <i className="bi bi-download" /> Baixar PDF
              </a>
              <Link href="/boletins/ribeira" className="sat-barra__link">
                <i className="bi bi-journal-text" /> Sumários publicados
              </Link>
            </span>
            <AtualizacaoAutomatica intervaloMs={ATUALIZAR_MS} />
          </div>

          {/* Período: Referência 1 (início) e Referência 2 (fim); sem escolha, 07h do dia anterior às 07h do dia. */}
          <Form action="" scroll={false} className="bri-periodo" key={`${r.t07Ontem}-${r.t07}`}>
            <label>
              Início (Referência 1)
              <input type="datetime-local" name="inicio" defaultValue={paraCampo(r.t07Ontem)} max={paraCampo(r.agora)} required />
            </label>
            <label>
              Fim (Referência 2)
              <input type="datetime-local" name="fim" defaultValue={paraCampo(r.t07)} max={paraCampo(r.agora)} required />
            </label>
            <button type="submit" className="sat-barra__link">
              <i className="bi bi-arrow-repeat" /> Aplicar período
            </button>
            {r.personalizado && (
              <Link href="/boletins/automatico/vale-do-ribeira" className="sat-barra__link" scroll={false}>
                <i className="bi bi-arrow-counterclockwise" /> Voltar ao padrão (07h às 07h)
              </Link>
            )}
            <small>Até {MAX_PERIODO_DIAS} dias, horário de Brasília. Chuva observada: 3 h e 24 h até o fim; previsão: 24 h depois do fim.</small>
          </Form>
          {erro && <Aviso texto={erro} />}

          <section className="sat-pagina">
            <Cabecalho titulo="SUMÁRIO EXECUTIVO" subtitulo="OPERAÇÃO DE CONTROLE DE CHEIAS" rotulo="SITUAÇÃO GERAL" valor={fechamento} />
            <h3 className="sat-secao">BACIA DO RIO RIBEIRA DO IGUAPE: PRINCIPAIS CURSOS D&apos;ÁGUA E ESTRUTURAS</h3>
            <Image
              src="/boletins/automatico/diagrama-ribeira.png"
              alt="Esquema do sistema — Rio Ribeira de Iguape e afluentes"
              width={921}
              height={410}
              sizes="(max-width: 860px) 100vw, 760px"
              className="sat-esquema"
            />
            <h3 className="sat-secao">CHUVA NA BACIA DO RIO RIBEIRA DO IGUAPE (UGRHI 11)</h3>
            <Suspense fallback={<Carregando />}>
              <Chuva r={r} />
            </Suspense>
            <h3 className="sat-secao">SITUAÇÃO ATUAL DE ESTRUTURAS DE INTERESSE</h3>
            <Suspense fallback={<Carregando />}>
              <Estruturas r={r} />
            </Suspense>
            <h3 className="sat-secao">SITUAÇÃO DOS BARRAMENTOS DE INTERESSE — UHEs/PCHs NAS CABECEIRAS DO RIO JUQUIÁ</h3>
            <Suspense fallback={<Carregando />}>
              <Barramentos r={r} />
            </Suspense>
          </section>

          <section className="sat-pagina">
            <Cabecalho
              titulo="SITUAÇÃO DOS PONTOS DE MONITORAMENTO (NÍVEL)"
              subtitulo="VALE DO RIBEIRA DE IGUAPE — DADOS AUTOMÁTICOS VIA API SIBH-SPÁGUAS"
              rotulo="ATUALIZADO EM"
              valor={fechamento}
            />
            <Suspense fallback={<Carregando />}>
              <Pontos r={r} />
            </Suspense>
          </section>

          <section className="sat-pagina sat-pagina--larga">
            <Cabecalho
              titulo="DIAGRAMA UNIFILAR — RIO RIBEIRA DO IGUAPE E LITORAL SUL"
              subtitulo="DIAGRAMA EM TEMPO REAL — PLATAFORMA SIBH-SPÁGUAS"
              rotulo="FONTE"
              valor="apps.spaguas.sp.gov.br/sibh/diagramas — Diagrama Ribeira de Iguape"
            />
            <DiagramaUnifilar src={DIAGRAMA_SIBH_RIBEIRA} titulo="Diagrama unifilar Rio Ribeira do Iguape e Litoral Sul" />
          </section>
        </div>
      </main>
    </>
  );
}
