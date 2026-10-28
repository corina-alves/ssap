import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { connection } from 'next/server';
import { cache, Suspense } from 'react';
import '@/styles/legado/pagina-sumario-automatico.css';
import '@/styles/legado/pagina-boletim-ribeira.css';
import { Hero } from '@/components/site/layout';
import { CAPIVARI, COPEL_PAGINA, DIAGRAMA_SIBH_RIBEIRA, PROPAGACAO_RIBEIRA } from '@/conteudo/boletim-ribeira';
import { chuva, estruturas, niveis, referencias, volumeCopel } from '@/lib/boletins-sala/boletim-ribeira';
import {
  classificados,
  CRITICAS,
  dataHoraH,
  diagnostico,
  diaMes,
  fmt,
  fmtSinal,
  horaH,
  lista,
  observacoes,
  rotuloSituacao,
  sintese,
  SITUACOES,
  textoVolumeCopel,
  type PontoRibeira,
  type Tendencia,
} from '@/lib/boletins-sala/boletim-ribeira-regras';
import { AtualizacaoAutomatica, DiagramaUnifilar } from '../tiete-pinheiros/ao-vivo';

export const metadata: Metadata = {
  title: 'Boletim Executivo — Vale do Ribeira',
  description: 'Situação hidrológica dos oito pontos de monitoramento do Vale do Ribeira de Iguape, atualizada automaticamente com os dados do SIBH, sem edição manual.',
};

const PDF = '/boletins/automatico/vale-do-ribeira/pdf';
/** A coleta do servidor e o cache renovam os dados a cada 10 min: a página acompanha. */
const ATUALIZAR_MS = 10 * 60_000;

// Uma consulta por fonte em cada requisição, dividida entre os blocos da página.
const ref = cache(() => referencias());
const dadosNiveis = cache(() => niveis(ref()));
const dadosEstruturas = cache(() => estruturas(ref()));
const dadosChuva = cache(() => chuva());

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
const SETA: Record<Tendencia, string> = { subida: '↑ Subida', queda: '↓ Queda', estavel: '→ Estável' };
const comSeta = (n: number | null) => (n === null ? '—' : `${fmtSinal(n)} ${n > 0 ? '↑' : n < 0 ? '↓' : '→'}`);
const critico = (p: PontoRibeira) => !p.semDado && !p.semCotas && CRITICAS.includes(p.situacao);
const nomeSintese = (nome: string) => nome.replace(/\s*\(([^)]+)\)\s*$/, ', $1');

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
const Selo = ({ p }: { p: PontoRibeira }) => {
  const r = rotuloSituacao(p);
  return <span className={`sat-selo sat-sit--${CLASSE[r]}`}>{r}</span>;
};

// ---------------------------------------------------------------- situação geral

async function Resumo() {
  const r = ref();
  const n = await dadosNiveis();
  if (!n.ok) return <Aviso texto={`Níveis dos pontos de monitoramento: ${n.mensagem}`} />;
  const { pontos, atualizadoEm } = n.dados;
  const com = classificados(pontos);
  const criticos = pontos.filter(critico).sort((a, b) => SITUACOES.indexOf(b.situacao) - SITUACOES.indexOf(a.situacao) || a.ordemRio - b.ordemRio);

  return (
    <>
      <p className="sat-ultima">
        Leitura mais recente: {atualizadoEm ? dataHoraH(atualizadoEm) : '—'} · Comparação com as 07h de {diaMes(r.t07)}
      </p>
      {n.desatualizado && atualizadoEm && <Aviso texto={`Atenção: a leitura mais recente recebida do SIBH é de ${dataHoraH(atualizadoEm)}. Os valores podem não refletir a situação atual.`} />}
      {criticos.length > 0 && (
        <div className="bri-critico" role="status">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>
            <strong>
              {criticos.length === 1 ? 'Ponto em situação crítica' : `${criticos.length} pontos em situação crítica`}:
            </strong>{' '}
            {lista(criticos.map((p) => `${p.curto} (${p.situacao.toLowerCase()})`))}.
          </span>
        </div>
      )}
      <section className="sat-cards" aria-label="Resumo da situação dos pontos">
        <div className="sat-card sat-card--total">
          <div className="sat-card__num">{pontos.filter((p) => !p.semDado).length}</div>
          <div className="sat-card__rotulo">PONTOS COM LEITURA</div>
        </div>
        {SITUACOES.map((s) => (
          <div key={s} className={`sat-card sat-card--${CLASSE[s]}`}>
            <div className="sat-card__num">{com.filter((p) => p.situacao === s).length}</div>
            <div className="sat-card__rotulo">{s}</div>
          </div>
        ))}
      </section>
      <div className="sat-diagnostico">
        <strong>DIAGNÓSTICO EXECUTIVO</strong> {diagnostico(pontos, r.t07)}
      </div>
    </>
  );
}

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
              <th>Últimas 3 h (média)</th>
              <th>Últimas 24 h (média)</th>
              <th>Previsão 24 h (média)</th>
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
        Fontes: chuva observada — rede telemétrica do SIBH ({d.postos} postos na UGRHI 11) | previsão — Open-Meteo (média de {d.pontosPrevisao} pontos de grade na UGRHI 11) | consulta de{' '}
        {dataHoraH(c.obtidoEm.getTime())}
      </p>
    </>
  );
}

// ---------------------------------------------------------------- Capivari e barramentos

async function Capivari() {
  const e = await dadosEstruturas();
  const c = e.ok ? e.dados.capivari : null;
  const vol = textoVolumeCopel(volumeCopel());
  return (
    <>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-eixos">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Estrutura</th>
              <th style={{ width: '16%' }}>Volume útil (%) — Copel, 07h</th>
              <th style={{ width: '14%' }}>
                Cota atual <sup className="sat-fonte">(1)</sup> (m)
              </th>
              <th style={{ width: '14%' }}>Vazão defluente (m³/s)</th>
              <th style={{ width: '17%' }}>Variação da cota desde 07h (m)</th>
              <th style={{ width: '17%' }}>Variação da vazão desde 07h (m³/s)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {CAPIVARI.nome} ({CAPIVARI.prefix})
              </td>
              <td className="bri-copel">{vol.valor}</td>
              <td>
                {fmt(c?.cota)}
                {c?.cotaEm && <span className="bri-hora"> às {horaH(c.cotaEm)}</span>}
              </td>
              <td>{fmt(c?.vazao)}</td>
              <td className={classeVar(c?.variacaoCota ?? null)}>{comSeta(c?.variacaoCota ?? null)}</td>
              <td className={classeVar(c?.variacaoVazao ?? null)}>{comSeta(c?.variacaoVazao ?? null)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sat-nota">
        <strong>Volume útil:</strong> {vol.detalhe} Fonte do volume útil:{' '}
        <a href={COPEL_PAGINA} target="_blank" rel="noopener noreferrer">
          Copel — Monitoramento Hidrológico de Bacias
        </a>
        .
        <br />
        <sup className="sat-fonte">(1)</sup> Nível máximo de operação: {fmt(CAPIVARI.nivelMaximoOperacao)} m; nível máximo maximorum: {fmt(CAPIVARI.nivelMaximoMaximorum)} m. Cota e vazão:
        SIBH — SP Águas / ANA (posto {CAPIVARI.prefix}).
      </p>
      {!e.ok && <Aviso texto={`Cota e vazão do Capivari: ${e.mensagem}`} />}
    </>
  );
}

async function Barramentos() {
  const r = ref();
  const e = await dadosEstruturas();
  if (!e.ok) return <Aviso texto={e.mensagem} />;
  return (
    <>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-criticos bri-barramentos">
          <thead>
            <tr>
              <th style={{ width: '32%' }}>Barramento</th>
              <th>Nível 07h {diaMes(r.t07)}</th>
              <th>Nível atual</th>
              <th>Jusante (m³/s)</th>
              <th>Variação</th>
              <th>Tendência</th>
            </tr>
          </thead>
          <tbody>
            {e.dados.barramentos.map((b) => (
              <tr key={b.id}>
                <td>
                  {b.nome} <span className="bri-prefixo">{b.prefix}</span>
                </td>
                <td>{b.anterior === null ? '—' : `${fmt(b.anterior)} m`}</td>
                <td>
                  {b.atual === null ? '—' : `${fmt(b.atual)} m`}
                  {b.atualEm && <span className="bri-hora"> às {horaH(b.atualEm)}</span>}
                </td>
                <td>{fmt(b.jusante)}</td>
                <td className={classeVar(b.variacao)}>{b.variacao === null ? '—' : `${fmtSinal(b.variacao)} m`}</td>
                <td className={`sat-tendencia ${classeVar(b.variacao) ?? ''}`}>{b.tendencia ? SETA[b.tendencia] : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sat-nota">
        Os barramentos não têm cotas de referência publicadas no SIBH: a tabela mostra nível, vazão defluente no posto de jusante e tendência desde as 07h. Fonte: SIBH — SP Águas,
        consulta de {dataHoraH(e.obtidoEm.getTime())}.
      </p>
    </>
  );
}

// ---------------------------------------------------------------- pontos de monitoramento

async function Pontos() {
  const r = ref();
  const n = await dadosNiveis();
  if (!n.ok) return <Aviso texto={n.mensagem} />;
  const pontos = [...n.dados.pontos].sort((a, b) => a.ordemRio - b.ordemRio);

  return (
    <>
      <h3 className="sat-secao">LEITURA DO SISTEMA — PROPAGAÇÃO DA CHEIA NO RIO RIBEIRA DE IGUAPE</h3>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-propagacao">
          <thead>
            <tr>
              {PROPAGACAO_RIBEIRA.map((x) => (
                <th key={x.id}>{x.rotulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {PROPAGACAO_RIBEIRA.map((x) => {
                const p = pontos.find((q) => q.id === x.id);
                const rotulo = p ? rotuloSituacao(p) : 'SEM DADO';
                return (
                  <td key={x.id} className={`sat-sit sat-sit--${CLASSE[rotulo]}`}>
                    {rotulo}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sat-nota">Estações do eixo principal, de montante (à esquerda) para jusante.</p>

      <h3 className="sat-secao">OS OITO PONTOS DE MONITORAMENTO — DE MONTANTE PARA JUSANTE</h3>
      <div className="sat-rolagem">
        <table className="sat-tabela sat-criticos bri-pontos">
          <thead>
            <tr>
              <th style={{ width: '27%' }}>Ponto</th>
              <th>Situação</th>
              <th>Nível 07h {diaMes(r.t07)}</th>
              <th>Nível atual</th>
              <th>Variação desde 07h</th>
              <th>Acima da cota de extravasamento</th>
              <th>Tendência</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.id} className={critico(p) ? `bri-linha bri-linha--${CLASSE[p.situacao]}` : undefined}>
                <td>
                  <strong>{p.nome}</strong>
                  <span className="bri-trecho">
                    {p.trecho} · <span className="bri-prefixo">{p.prefix}</span>
                  </span>
                </td>
                <td className="text-center">
                  <Selo p={p} />
                </td>
                <td>{p.nivel07 === null ? '—' : `${fmt(p.nivel07)} m`}</td>
                <td>
                  {p.atual === null ? '—' : `${fmt(p.atual)} m`}
                  {p.atualEm && <span className={`bri-hora${p.atrasado ? ' bri-hora--atrasada' : ''}`}> às {horaH(p.atualEm)}</span>}
                </td>
                <td className={classeVar(p.variacao)}>{p.variacao === null ? '—' : `${fmtSinal(p.variacao)} m`}</td>
                <td className={p.situacao === 'EXTRAVASAMENTO' && !p.semDado ? 'sat-acima' : undefined}>
                  {p.situacao === 'EXTRAVASAMENTO' && !p.semDado && p.acima !== null ? `${fmtSinal(p.acima)} m` : '—'}
                </td>
                <td className={`sat-tendencia ${classeVar(p.variacao) ?? ''}`}>{p.tendencia ? SETA[p.tendencia] : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sat-nota">
        Situação: nível atual comparado às cotas de referência cadastradas no SIBH (atenção, alerta, emergência e extravasamento). Variação: nível atual menos o das 07h de{' '}
        {diaMes(r.t07)}; tendência pelo sinal da variação (0,00 m = estável). Acima da cota: só para os pontos em extravasamento. Fonte: SIBH — SP Águas.
      </p>

      <h3 className="sat-secao">SÍNTESE POR PONTO DE MONITORAMENTO</h3>
      <div className="sat-sintese">
        {pontos.map((p) => (
          <p key={p.id}>
            <strong className={`sat-nome sat-nome--${CLASSE[rotuloSituacao(p)]}`}>{nomeSintese(p.nome)}:</strong> {sintese(p)}
          </p>
        ))}
      </div>

      <h3 className="sat-secao">OBSERVAÇÕES AUTOMÁTICAS</h3>
      <ul className="bri-observacoes">
        {observacoes(pontos, r.t07).map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- página

export default async function BoletimRibeira() {
  await connection(); // dados de agora: nunca pré-renderizar
  const r = ref();
  const agora = dataHoraH(r.agora);

  return (
    <>
      <Hero
        kicker="Atualização automática"
        titulo="Boletim Executivo — Vale do Ribeira"
        texto="Situação hidrológica dos oito pontos de monitoramento do Vale do Ribeira de Iguape, gerada automaticamente com os dados oficiais do SIBH, sem edição manual."
        icone="bi-broadcast"
      />
      <main className="sssp-main sat">
        <div className="container">
          <div className="sat-barra">
            <span>
              <i className="bi bi-arrow-repeat" /> Consulta de {agora}. Os dados são renovados a cada 10 minutos e a página se atualiza sozinha.
            </span>
            <span className="bri-botoes">
              <a href={PDF} target="_blank" rel="noopener" className="sat-barra__link">
                <i className="bi bi-file-earmark-pdf" /> Visualizar PDF
              </a>
              <a href={`${PDF}?baixar=1`} className="sat-barra__link">
                <i className="bi bi-download" /> Baixar PDF
              </a>
              <Link href="/boletins/ribeira" className="sat-barra__link">
                <i className="bi bi-journal-text" /> Sumários publicados
              </Link>
            </span>
            <AtualizacaoAutomatica intervaloMs={ATUALIZAR_MS} />
          </div>

          <section className="sat-pagina">
            <Cabecalho titulo="BOLETIM EXECUTIVO — VALE DO RIBEIRA" subtitulo="OPERAÇÃO DE CONTROLE DE CHEIAS — ATUALIZAÇÃO AUTOMÁTICA" rotulo="CONSULTA DE" valor={agora} />
            <h3 className="sat-secao">SITUAÇÃO GERAL DOS PONTOS DE MONITORAMENTO</h3>
            <Suspense fallback={<Carregando />}>
              <Resumo />
            </Suspense>
            <h3 className="sat-secao">BACIA DO RIO RIBEIRA DE IGUAPE: PRINCIPAIS CURSOS D&apos;ÁGUA E ESTRUTURAS</h3>
            <Image
              src="/boletins/automatico/diagrama-ribeira.png"
              alt="Esquema da bacia do Rio Ribeira de Iguape: principais cursos d'água e estruturas"
              width={921}
              height={410}
              sizes="(max-width: 860px) 100vw, 760px"
              className="sat-esquema"
            />
            <h3 className="sat-secao">CHUVA NA BACIA DO RIO RIBEIRA DE IGUAPE (UGRHI 11)</h3>
            <Suspense fallback={<Carregando />}>
              <Chuva />
            </Suspense>
            <h3 className="sat-secao">RESERVATÓRIO CAPIVARI — UHE GOVERNADOR PARIGOT DE SOUZA</h3>
            <Suspense fallback={<Carregando />}>
              <Capivari />
            </Suspense>
            <h3 className="sat-secao">BARRAMENTOS DE INTERESSE — UHEs/PCHs NAS CABECEIRAS DO RIO JUQUIÁ</h3>
            <Suspense fallback={<Carregando />}>
              <Barramentos />
            </Suspense>
          </section>

          <section className="sat-pagina">
            <Cabecalho
              titulo="SITUAÇÃO DOS PONTOS DE MONITORAMENTO (NÍVEL)"
              subtitulo="VALE DO RIBEIRA DE IGUAPE — DADOS AUTOMÁTICOS VIA API SIBH-SP ÁGUAS"
              rotulo="CONSULTA DE"
              valor={agora}
            />
            <Suspense fallback={<Carregando />}>
              <Pontos />
            </Suspense>
          </section>

          <section className="sat-pagina sat-pagina--larga">
            <Cabecalho
              titulo="DIAGRAMA UNIFILAR — RIO RIBEIRA DE IGUAPE E LITORAL SUL"
              subtitulo="DIAGRAMA INTERATIVO EM TEMPO REAL — PLATAFORMA SIBH-SP ÁGUAS"
              rotulo="FONTE"
              valor="apps.spaguas.sp.gov.br/sibh/diagramas — Ribeira de Iguape"
            />
            <DiagramaUnifilar src={DIAGRAMA_SIBH_RIBEIRA} titulo="Diagrama unifilar Rio Ribeira de Iguape e Litoral Sul" />
          </section>

          <section className="bri-fontes" aria-label="Fontes dos dados">
            <h3 className="sat-secao">FONTES DOS DADOS</h3>
            <ul>
              <li>
                <strong>Níveis, cotas de referência, barramentos, Capivari (cota e vazão) e chuva observada:</strong> SIBH — SP Águas (apps.spaguas.sp.gov.br/sibh), consultado no
                servidor a cada 10 minutos.
              </li>
              <li>
                <strong>Previsão de chuva:</strong> Open-Meteo (open-meteo.com), consultado a cada hora.
              </li>
              <li>
                <strong>Volume útil do Reservatório Capivari:</strong> Copel — Monitoramento Hidrológico de Bacias (registro das 07h). Ainda sem integração automática autorizada.
              </li>
              <li>Boletim gerado automaticamente, sem edição manual: os valores são os das fontes no momento da consulta.</li>
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
