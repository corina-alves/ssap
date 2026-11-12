import Image from 'next/image';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Cabecalho } from '@/components/acesso/pecas';
import {
  CLASSE_SITUACAO,
  piorSituacao,
  SITUACOES,
  TEXTO_SITUACAO,
  type Classe,
  type EstruturaPainel,
  type PainelMonitoramento,
  type PontoPainel,
  type SistemaPainel,
  type Situacao,
} from '@/lib/acesso/painel-monitoramento-regras';
import { dataHora, hora } from '@/lib/formato';

/**
 * Desenho do Painel de Monitoramento (page.tsx busca os dados e confere o acesso).
 * Sem estado nem dados próprios: recebe o resumo dos dois sistemas e a vista.
 */

export const VISTAS = [
  ['geral', 'Visão geral', 'bi-grid-1x2'],
  ['tiete-pinheiros', 'Tietê–Pinheiros', 'bi-water'],
  ['ribeira', 'Ribeira de Iguape', 'bi-tsunami'],
] as const;
export type Vista = (typeof VISTAS)[number][0];

const ICONE: Record<Classe, string> = {
  normal: 'bi-check-circle-fill',
  atencao: 'bi-eye-fill',
  alerta: 'bi-exclamation-circle-fill',
  emergencia: 'bi-exclamation-triangle-fill',
  extravasamento: 'bi-exclamation-octagon-fill',
  semdado: 'bi-dash-circle',
  info: 'bi-gear-fill',
};

/** Tamanho das imagens dos esquemas (as mesmas dos sumários), para a proporção. */
const TAMANHO_ESQUEMA: Record<SistemaPainel['chave'], { width: number; height: number }> = {
  'tiete-pinheiros': { width: 2172, height: 569 },
  ribeira: { width: 921, height: 410 },
};

// ---------------------------------------------------------------- formatação

/** Vazão (m³/s): sem casas quando inteira (EMAE), uma casa quando não. */
const vazao = (n: number | null) => fmt(n, n !== null && !Number.isInteger(n) ? 1 : 0);
const fmt = (n: number | null | undefined, casas = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

function Variacao({ v, unidade = 'm' }: { v: number | null; unidade?: string }) {
  if (v === null) return <span className="pm-mudo">—</span>;
  const classe = v > 0 ? 'pm-sobe' : v < 0 ? 'pm-desce' : 'pm-estavel';
  return (
    <span className={classe}>
      {v > 0 ? '+' : ''}
      {fmt(v)} {unidade} {v > 0 ? '↑' : v < 0 ? '↓' : '→'}
    </span>
  );
}

const Selo = ({ classe, texto }: { classe: Classe; texto: string }) => (
  <span className={`pm-selo pm-selo--${classe}`}>
    <i className={`bi ${ICONE[classe]}`} aria-hidden /> {texto}
  </span>
);

/** Selo do sistema: a pior situação entre os pontos e quantos estão nela. */
function seloSistema(s: SistemaPainel): { classe: Classe; texto: string } {
  if (!s.situacao) return { classe: 'semdado', texto: 'Sem dados de nível' };
  if (s.situacao === 'NORMAL') return { classe: 'normal', texto: 'Situação normal' };
  const n = s.contagem[s.situacao];
  return { classe: CLASSE_SITUACAO[s.situacao], texto: `${TEXTO_SITUACAO[s.situacao]} em ${n} ${n === 1 ? 'ponto' : 'pontos'}` };
}

// ---------------------------------------------------------------- peças

function Kpi({ icone, titulo, valor, detalhe, selo, cor }: { icone: string; titulo: string; valor: ReactNode; detalhe: string; selo?: { classe: Classe; texto: string }; cor: string }) {
  return (
    <div className="pm-kpi">
      <div className={`pm-kpi__icone pm-kpi__icone--${cor}`}>
        <i className={`bi ${icone}`} aria-hidden />
      </div>
      <div className="pm-kpi__corpo">
        <div className="pm-kpi__titulo">{titulo}</div>
        <div className="pm-kpi__valor">{valor}</div>
        <div className="pm-kpi__detalhe">{detalhe}</div>
        {selo && <Selo {...selo} />}
      </div>
    </div>
  );
}

function BarraSituacoes({ s }: { s: SistemaPainel }) {
  const total = s.pontos.length || 1;
  return (
    <div className="pm-barra" aria-label="Pontos por situação">
      <div className="pm-barra__faixa">
        {SITUACOES.map((x) =>
          s.contagem[x] ? <span key={x} className={`pm-barra__parte pm-fundo--${CLASSE_SITUACAO[x]}`} style={{ width: `${(100 * s.contagem[x]) / total}%` }} title={`${TEXTO_SITUACAO[x]}: ${s.contagem[x]}`} /> : null,
        )}
        {s.semSituacao > 0 && <span className="pm-barra__parte pm-fundo--semdado" style={{ width: `${(100 * s.semSituacao) / total}%` }} title={`Sem dado ou sem cotas: ${s.semSituacao}`} />}
      </div>
      <div className="pm-barra__legenda">
        {SITUACOES.map((x) => (
          <span key={x} className={s.contagem[x] ? undefined : 'pm-mudo'}>
            <i className={`pm-ponto pm-fundo--${CLASSE_SITUACAO[x]}`} /> {TEXTO_SITUACAO[x]} <strong>{s.contagem[x]}</strong>
          </span>
        ))}
        {s.semSituacao > 0 && (
          <span>
            <i className="pm-ponto pm-fundo--semdado" /> Sem dado / cotas <strong>{s.semSituacao}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

function CartaoSistema({ s, largo }: { s: SistemaPainel; largo: boolean }) {
  const selo = seloSistema(s);
  return (
    <section className={`pm-sistema pm-sistema--${s.chave}${largo ? ' pm-sistema--largo' : ''}`}>
      <header className="pm-sistema__cab">
        <div>
          <h2>{s.nome}</h2>
          <p>{s.descricao}</p>
        </div>
        <Selo {...selo} />
      </header>
      <div className="pm-sistema__corpo">
        <figure className="pm-esquema">
          <Image src={s.imagem} alt={`Esquema do ${s.nome}`} {...TAMANHO_ESQUEMA[s.chave]} sizes="(max-width: 992px) 100vw, 45vw" />
          <figcaption>
            {s.pontos.length} pontos de nível · {s.estruturas.length} estruturas
            {s.atualizadoEm && <> · leitura mais recente {dataHora(new Date(s.atualizadoEm))}</>}
          </figcaption>
        </figure>
        <div className="pm-sistema__colunas">
          <div>
            <h3>Principais indicadores</h3>
            <ul className="pm-indicadores">
              {s.indicadores.map((i) => (
                <li key={i.rotulo}>
                  <div className="pm-indicador__texto">
                    <span className="pm-indicador__rotulo">{i.rotulo}</span>
                    <span className="pm-indicador__local">{i.local}</span>
                    {i.detalhe && <span className="pm-indicador__detalhe">{i.detalhe}</span>}
                  </div>
                  <div className="pm-indicador__valor">
                    <strong>
                      {i.valor}
                      {i.unidade && <small> {i.unidade}</small>}
                    </strong>
                    {i.variacao !== null && (
                      <span className="pm-indicador__var">
                        24 h: <Variacao v={i.variacao} />
                      </span>
                    )}
                  </div>
                  <Selo classe={i.classe} texto={i.selo} />
                </li>
              ))}
              {s.chuva && (
                <li>
                  <div className="pm-indicador__texto">
                    <span className="pm-indicador__rotulo">Chuva média — {s.chuva.regiao}</span>
                    <span className="pm-indicador__local">
                      {s.chuva.postos} postos · 3 h: {fmt(s.chuva.ultimas3h, 1)} mm
                    </span>
                    <span className="pm-indicador__detalhe">Previsão 24 h (Open-Meteo): {fmt(s.chuva.previsao24h, 1)} mm</span>
                  </div>
                  <div className="pm-indicador__valor">
                    <strong>
                      {fmt(s.chuva.ultimas24h, 1)}
                      <small> mm/24 h</small>
                    </strong>
                  </div>
                  <Selo classe="info" texto="Observada" />
                </li>
              )}
            </ul>
          </div>
          <div>
            <h3>Estruturas operacionais</h3>
            <ul className="pm-operacao">
              {s.operacao.map((o) => (
                <li key={o.nome}>
                  <i className={`bi ${o.classe === 'semdado' ? 'bi-dash-circle' : 'bi-gear-wide-connected'}`} aria-hidden />
                  <div>
                    <span className="pm-operacao__nome">{o.nome}</span>
                    <span className={`pm-operacao__estado${o.classe === 'semdado' ? ' pm-mudo' : ''}`}>{o.estado}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <BarraSituacoes s={s} />
      {s.avisos.length > 0 && (
        <div className="pm-avisos">
          {s.avisos.map((a) => (
            <div key={a}>
              <i className="bi bi-exclamation-circle" aria-hidden /> {a}
            </div>
          ))}
        </div>
      )}
      <footer className="pm-sistema__rodape">
        <a href={s.publico} target="_blank" rel="noopener">
          <i className="bi bi-broadcast" aria-hidden /> Sumário público
        </a>
        <Link href={s.sumario}>
          <i className="bi bi-pencil-square" aria-hidden /> Sumário para o boletim
        </Link>
        <Link href={`?v=${s.chave}#detalhe`}>
          <i className="bi bi-table" aria-hidden /> Todos os pontos e estruturas
        </Link>
      </footer>
    </section>
  );
}

function TabelaEstruturas({ s, compacta }: { s: SistemaPainel; compacta: boolean }) {
  const linhas: EstruturaPainel[] = compacta ? s.estruturas.slice(0, 7) : s.estruturas;
  return (
    <div className="pm-tabela-caixa">
      <h3>
        Estruturas monitoradas — {s.nome.replace('Sistema ', '')}
        {compacta && s.estruturas.length > linhas.length && (
          <Link href={`?v=${s.chave}#detalhe`} className="pm-ver-mais">
            ver as {s.estruturas.length}
          </Link>
        )}
      </h3>
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0 pm-tabela">
          <thead>
            <tr>
              <th>Estrutura</th>
              {!compacta && <th>Tipo</th>}
              {!compacta && <th>Local</th>}
              <th className="text-end">Nível (m)</th>
              <th className="text-end">Vazão (m³/s)</th>
              <th>Variação 24 h</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((e) => (
              <tr key={e.nome}>
                <td className="fw-semibold">
                  {e.nome} <span className="pm-fonte">{e.fonte}</span>
                </td>
                {!compacta && <td>{e.tipo}</td>}
                {!compacta && <td>{e.local}</td>}
                <td className="text-end">{fmt(e.nivel)}</td>
                <td className="text-end">{vazao(e.vazao)}</td>
                <td>
                  <Variacao v={e.variacao24h} />
                </td>
                <td className={`pm-estado${e.classe === 'semdado' ? ' pm-mudo' : ''}`}>{e.classe === 'semdado' ? 'Sem leitura' : e.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabelaPontos({ s, pontos }: { s: SistemaPainel; pontos: PontoPainel[] }) {
  return (
    <div className="pm-tabela-caixa">
      <h3>Pontos de monitoramento de nível — {s.nome.replace('Sistema ', '')}</h3>
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0 pm-tabela">
          <thead>
            <tr>
              <th>Situação</th>
              <th>Ponto</th>
              <th>Rio / trecho</th>
              <th className="text-end">Nível (m)</th>
              <th>Leitura</th>
              <th>Variação 24 h</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.id}>
                <td>
                  <Selo classe={p.classe} texto={p.rotulo} />
                </td>
                <td className="fw-semibold">{p.nome}</td>
                <td>{p.rio}</td>
                <td className="text-end">{fmt(p.nivel)}</td>
                <td>{p.em ? `${dataHora(new Date(p.em)).slice(0, 5)} ${hora(new Date(p.em))}` : '—'}</td>
                <td>
                  <Variacao v={p.variacao24h} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Vista escolhida (?v=): visão geral ou um sistema. */
export const vistaDe = (v: string): Vista => (VISTAS.some(([k]) => k === v) ? (v as Vista) : 'geral');

export function ConteudoPainel({ p, vista }: { p: PainelMonitoramento; vista: Vista }) {
  const todos = p.sistemas.flatMap((s) => s.pontos);
  const pior = piorSituacao(todos.map((x) => x.situacao));
  const fora = todos.filter((x) => x.situacao !== null && x.situacao !== 'NORMAL');
  const contagemFora = SITUACOES.filter((x) => x !== 'NORMAL')
    .map((x): [Situacao, number] => [x, fora.filter((y) => y.situacao === x).length])
    .filter(([, n]) => n > 0);
  const estruturas = p.sistemas.flatMap((s) => s.estruturas);
  const comLeitura = estruturas.filter((e) => e.classe !== 'semdado').length;
  const chuva = p.sistemas.flatMap((s) => (s.chuva ? [s.chuva] : []));
  const mostrar = vista === 'geral' ? p.sistemas : p.sistemas.filter((s) => s.chave === vista);

  return (
    <div className="pm-painel">
      <Cabecalho
        titulo="Painel de Monitoramento Hidrológico e Operacional"
        subtitulo="Integração das informações hidrológicas e operacionais dos sistemas Tietê–Pinheiros e Ribeira de Iguape"
        trilha={[
          ['Painel', '/acesso'],
          ['Monitoramento', null],
        ]}
        acoes={
          <div className="pm-atualizacao">
            <i className="bi bi-clock-history" aria-hidden />
            <div>
              <span>Última leitura</span>
              <strong>{p.atualizadoEm ? dataHora(new Date(p.atualizadoEm)) : '—'}</strong>
              <small>
                <i className="pm-ao-vivo" /> página atualizada às {hora(new Date(p.geradoEm))}
              </small>
            </div>
          </div>
        }
      />

      <nav className="pm-abas" aria-label="Sistemas">
        {VISTAS.map(([k, rotulo, icone]) => (
          <Link key={k} href={k === 'geral' ? '?' : `?v=${k}`} className={k === vista ? 'is-ativa' : undefined} aria-current={k === vista ? 'page' : undefined}>
            <i className={`bi ${icone}`} aria-hidden /> {rotulo}
          </Link>
        ))}
      </nav>

      <div className="pm-kpis">
        <Kpi
          icone="bi-rulers"
          cor="azul"
          titulo="Níveis dos rios"
          valor={String(todos.filter((x) => x.nivel !== null).length)}
          detalhe={`de ${todos.length} pontos com leitura (SIBH)`}
          selo={pior ? { classe: CLASSE_SITUACAO[pior], texto: TEXTO_SITUACAO[pior] } : { classe: 'semdado', texto: 'Sem dado' }}
        />
        <Kpi
          icone="bi-exclamation-triangle"
          cor={fora.length ? 'laranja' : 'verde'}
          titulo="Pontos fora da normalidade"
          valor={String(fora.length)}
          detalhe={contagemFora.length ? contagemFora.map(([x, n]) => `${n} ${TEXTO_SITUACAO[x].toLowerCase()}`).join(' · ') : 'todos os pontos com cotas em situação normal'}
        />
        <Kpi
          icone="bi-building-gear"
          cor="roxo"
          titulo="Estruturas operacionais"
          valor={String(estruturas.length)}
          detalhe={`barragens, usinas e reservatórios · ${comLeitura} com leitura`}
          selo={{ classe: comLeitura === estruturas.length ? 'normal' : 'atencao', texto: comLeitura === estruturas.length ? 'Todas com dado' : `${estruturas.length - comLeitura} sem leitura` }}
        />
        <Kpi
          icone="bi-cloud-rain"
          cor="ciano"
          titulo="Chuva nas últimas 24 h"
          valor={
            chuva.length ? (
              <span className="pm-kpi__regioes">
                {chuva.map((c) => (
                  <span key={c.regiao}>
                    {fmt(c.ultimas24h, 1)}
                    <small> mm {c.regiao}</small>
                  </span>
                ))}
              </span>
            ) : (
              '—'
            )
          }
          detalhe={chuva.length ? `previsão 24 h: ${chuva.map((c) => `${fmt(c.previsao24h, 1)} mm (${c.regiao})`).join(' · ')}` : 'sem dados de chuva'}
        />
        <Kpi
          icone="bi-arrow-repeat"
          cor="cinza"
          titulo="Rotina de atualização"
          valor="5 min"
          detalhe="coleta das fontes a cada 10 min; níveis do Ribeira fechados às 07h"
        />
      </div>

      <div className={`pm-sistemas${vista === 'geral' ? '' : ' pm-sistemas--um'}`}>
        {mostrar.map((s) => (
          <CartaoSistema key={s.chave} s={s} largo={vista !== 'geral'} />
        ))}
      </div>

      <div id="detalhe" className={`pm-tabelas${vista === 'geral' ? '' : ' pm-tabelas--um'}`}>
        {mostrar.map((s) =>
          vista === 'geral' ? (
            <TabelaEstruturas key={s.chave} s={s} compacta />
          ) : (
            <div key={s.chave} className="pm-detalhe">
              <TabelaPontos s={s} pontos={s.pontos} />
              <TabelaEstruturas s={s} compacta={false} />
            </div>
          ),
        )}
      </div>

      <footer className="pm-fontes">
        <div className="pm-fontes__titulo">
          <i className="bi bi-database" aria-hidden /> Fontes de dados
        </div>
        <div>
          <strong>SIBH — SP Águas</strong>
          <span>níveis, cotas de referência, comportas e chuva</span>
        </div>
        <div>
          <strong>EMAE (via SAISP)</strong>
          <span>estruturas do Tietê-Pinheiros, cotas convertidas para o IGG</span>
        </div>
        <div>
          <strong>Copel</strong>
          <span>volume útil do Reservatório Capivari</span>
        </div>
        <div>
          <strong>Open-Meteo</strong>
          <span>previsão de chuva nas próximas 24 h</span>
        </div>
        <div className="pm-fontes__nota">
          Os mesmos dados e regras dos Sumários Executivos automáticos. Situação pelos níveis de referência do SIBH (atenção, alerta, emergência e extravasamento);
          as estruturas não têm classificação de cheia e mostram o estado operacional.
        </div>
      </footer>
    </div>
  );
}
