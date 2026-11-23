'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ehPluviometro, ehPostoAna, ehPostoSibh, paresDoDiagrama, VD, type Diagrama, type No } from '@/conteudo/diagramas-unifilares';
import { BASES, type NomeBase } from './bases-mapa';
import { DesenhoNoMapa } from './desenho-mapa';
import { MapaUnifilar } from './mapa-unifilar';
import { chavePosto, COR, ESTILO_LINHA, Ponto, PontoRadar, Reservatorio, Rotulo, setas, SimboloRadar, TextoValor, type NoPostoClicavel } from './simbolos-unifilar';
import { COR_FAIXA, duracaoFluxo, semVazao, texto, valorDe, type Modo, type ValoresSsd } from './valores-ssd';

/**
 * Diagrama unifilar de um sistema produtor no tema escuro do painel: rios e
 * túneis tracejados com o sentido do escoamento, reservatórios com o nível de
 * água pelo volume útil, e os valores do SSD na data escolhida. Os modos
 * mostram vazões, volume (hm³), nível (m) ou chuva sobre o mesmo desenho.
 * Com mapa de fundo (desenho-mapa.tsx), os mesmos símbolos e valores
 * (simbolos-unifilar.tsx) vão para o lugar real e os rios seguem o traçado
 * deles; "Sem mapa" mostra o esquema.
 */

export type { Modo, NoPostoClicavel, ValoresSsd };
export { chavePosto };

export const MODOS: { modo: Modo; rotulo: string; icone: string }[] = [
  { modo: 'vazao', rotulo: 'Vazão', icone: 'bi-water' },
  { modo: 'volume', rotulo: 'Volume', icone: 'bi-database' },
  { modo: 'nivel', rotulo: 'Nível', icone: 'bi-rulers' },
  { modo: 'chuva', rotulo: 'Chuva', icone: 'bi-cloud-rain' },
];

/** O desenho em si (sem busca de dados): serve também para testes e exportação. */
export function DesenhoUnifilar({
  d,
  valores,
  data,
  modo,
  destaque,
  aoEscolher,
  postoAtivo,
  aoPosto,
  classe = 'un-svg',
}: {
  d: Diagrama;
  valores: ValoresSsd;
  data: string;
  modo: Modo;
  destaque?: number | null;
  aoEscolher?: (space: number) => void;
  /** posto com os gráficos abertos (chavePosto) */
  postoAtivo?: string | null;
  aoPosto?: (n: NoPostoClicavel) => void;
  classe?: string;
}) {
  const vazoes = modo === 'vazao';
  // vazão de um ponto (EEAB, UHE): a dele ou a da ligação que começa ou termina nele
  const vazaoNo = (n: Exclude<No, { tipo: 'reservatorio' }>) =>
    n.valor
      ? valorDe(valores, n.valor)
      : valorDe(valores, d.ligacoes.find((l) => l.valor && [l.pontos[0], l.pontos.at(-1)].some((p) => p && Math.hypot(p[0] - n.x, p[1] - n.y) < 24))?.valor);
  return (
    <svg className={classe} viewBox={`0 0 ${d.largura} ${d.altura}`} role="img" aria-label={`Diagrama unifilar — ${d.titulo}`}>
      <defs>
        <linearGradient id="un-agua" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fc3f7" />
          <stop offset="1" stopColor="#0b5fbf" />
        </linearGradient>
      </defs>
      {/* água correndo no sentido do escoamento (ordem dos pontos); vazão zero: trecho parado e apagado */}
      <g className="un-linhas">
        {d.ligacoes.map((l, i) => {
          const e = ESTILO_LINHA[l.tipo];
          const q = valorDe(valores, l.valor);
          const parado = semVazao(l, q);
          const pontos = l.pontos.map((p) => p.join(',')).join(' ');
          return (
            <g key={i} className={parado ? 'un-parado' : undefined}>
              <polyline points={pontos} fill="none" stroke={e.cor} strokeWidth={e.largura + 5} strokeOpacity={0.13} strokeLinecap="round" strokeLinejoin="round" />
              <polyline
                points={pontos}
                fill="none"
                stroke={e.cor}
                strokeWidth={e.largura}
                strokeDasharray={e.traco}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={parado ? undefined : `un-fluxo un-fluxo--${l.tipo}`}
                style={parado ? undefined : { animationDuration: `${duracaoFluxo(e.passo, q).toFixed(2)}s` }}
              />
              {setas(l, e.cor)}
            </g>
          );
        })}
      </g>
      {d.ligacoes.map((l, i) => (
        <g key={i}>
          {l.rotulo && <Rotulo t={l.rotulo} />}
          {l.valor && <TextoValor v={l.valor} valores={valores} data={data} mostrar={vazoes} />}
        </g>
      ))}
      {(d.valores ?? []).map((v, i) => (
        <TextoValor key={i} v={v} valores={valores} data={data} mostrar={vazoes} />
      ))}
      {(d.textos ?? []).map((t, i) => (
        <Rotulo key={i} t={t} />
      ))}
      {(d.radares ?? []).map((r) => (
        <PontoRadar key={r.id} r={r} valores={valores} data={data} modo={modo} />
      ))}
      {d.nos.map((n, i) =>
        n.tipo === 'reservatorio' ? (
          <Reservatorio key={i} n={n} valores={valores} data={data} modo={modo} ativo={destaque === n.space} aoEscolher={aoEscolher} />
        ) : (
          <Ponto
            key={i}
            n={n}
            valores={valores}
            data={data}
            modo={modo}
            vazao={n.tipo === 'eeab' || n.tipo === 'uhe' ? vazaoNo(n) : null}
            ativo={(ehPostoSibh(n) || ehPostoAna(n)) && chavePosto(n) === postoAtivo}
            aoPosto={aoPosto}
            fonte={d.fonte}
          />
        ),
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- com dados

type EstadoValores = { valores: ValoresSsd; carregando: boolean; erro?: string };

/** Valores da API de valores do diagrama no endereço `url` (refeitos quando ele muda). */
function useValores(url: string | null): EstadoValores {
  const [st, setSt] = useState<EstadoValores>({ valores: {}, carregando: !!url });
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    setSt((s) => ({ valores: s.valores, carregando: true }));
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return ((await r.json()) as { valores: ValoresSsd }).valores;
      })
      .then(
        (valores) => vivo && setSt({ valores, carregando: false }),
        (e: Error) => vivo && setSt({ valores: {}, carregando: false, erro: e.message }),
      );
    return () => {
      vivo = false;
    };
  }, [url]);
  return st;
}

/**
 * Valores do SSD (no Paraíba do Sul, do ONS) de todos os campos do diagrama e,
 * numa consulta à parte (SIBH e ANA às vezes demoram e não podem segurar o
 * resto), a chuva por radar, o nível e a vazão dos postos, as estações da ANA e
 * os pluviômetros, na data (refeitos a cada `tick`).
 */
function useValoresSsd(d: Diagrama, data: string, tick: number) {
  const api = d.api?.valores ?? '/api/acesso/painel_interativo/valores';
  const pares = useMemo(() => paresDoDiagrama(d).join(','), [d]);
  const radares = useMemo(() => (d.radares ?? []).map((r) => r.id).join(','), [d]);
  const postos = useMemo(() => d.nos.filter(ehPostoSibh).map((n) => n.sibh.id).join(','), [d]);
  const ana = useMemo(() => d.nos.filter(ehPostoAna).map((n) => n.ana.codigo).join(','), [d]);
  const pluvio = useMemo(() => d.nos.filter(ehPluviometro).map((n) => n.pluvio).join(','), [d]);
  const ssd = useValores(`${api}?data=${data}&p=${pares}&t=${tick}`);
  // SIBH (radar, postos, pluviômetros) numa consulta; a telemetria da ANA, mais lenta, noutra
  const partes = [radares && `r=${radares}`, postos && `f=${postos}`, pluvio && `c=${pluvio}`].filter(Boolean);
  const sibh = useValores(partes.length ? `${api}?data=${data}&${partes.join('&')}&t=${tick}` : null);
  const anaQ = useValores(ana ? `${api}?data=${data}&a=${ana}&t=${tick}` : null);
  const valores = useMemo(() => ({ ...ssd.valores, ...sibh.valores, ...anaQ.valores }), [ssd.valores, sibh.valores, anaQ.valores]);
  return { valores, carregando: ssd.carregando, erro: ssd.erro, carregandoSibh: sibh.carregando || anaQ.carregando, erroSibh: sibh.erro ?? anaQ.erro };
}

function BotoesModo({ modo, aoMudar }: { modo: Modo; aoMudar: (m: Modo) => void }) {
  return (
    <div className="un-modos" role="group" aria-label="O que mostrar no diagrama">
      {MODOS.map((m) => (
        <button key={m.modo} type="button" className={modo === m.modo ? 'is-ativo' : ''} onClick={() => aoMudar(m.modo)} aria-pressed={modo === m.modo}>
          <i className={`bi ${m.icone}`} /> {m.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Faixas do volume útil (as cores de COR_FAIXA). */
const FAIXAS: [number, string][] = [
  [60, '≥ 60%'],
  [40, '40–60%'],
  [30, '30–40%'],
  [20, '20–30%'],
  [0, '< 20%'],
];

/** Que símbolos o diagrama usa (a legenda só mostra esses). */
function simbolosDe(d: Diagrama) {
  const linhas = new Set(d.ligacoes.map((l) => l.tipo));
  const nos = new Set(d.nos.map((n) => n.tipo));
  const valores = [...d.ligacoes.map((l) => l.valor), ...(d.valores ?? []), ...d.nos.map((n) => (n.tipo === 'reservatorio' ? undefined : n.valor))];
  return {
    rio: linhas.has('rio'),
    tunel: linhas.has('tunel'),
    aducao: linhas.has('aducao'),
    descarregada: valores.some((v) => v?.v === VD.descarregada),
    posto: nos.has('posto'),
    sibh: d.nos.some(ehPostoSibh),
    ana: d.nos.some(ehPostoAna),
    reservatorio: nos.has('reservatorio'),
    eeab: nos.has('eeab'),
    eta: nos.has('eta'),
    uhe: nos.has('uhe'),
    pluviometro: nos.has('pluviometro'),
    estrutura: nos.has('estrutura'),
    cidade: nos.has('cidade'),
    radar: !!d.radares?.length,
  };
}

/** Legenda com os símbolos do diagrama; com mapa, o rio é a linha cheia pelo traçado real (desenho-mapa.tsx). */
function Legenda({ nota, comMapa, tem, variacao }: { nota: string; comMapa: boolean; tem: ReturnType<typeof simbolosDe>; variacao: boolean }) {
  const textoPosto =
    tem.sibh && tem.ana
      ? 'Posto fluviométrico (SIBH em SP, telemetria da ANA no RJ e em MG: clique para ver os gráficos)'
      : tem.sibh
        ? 'Posto fluviométrico (do SIBH: clique para ver os gráficos)'
        : tem.ana
          ? 'Posto fluviométrico (telemetria da ANA: clique para ver os gráficos)'
          : 'Posto fluviométrico';
  return (
    <div className="un-legenda" aria-label="Legenda">
      {tem.rio &&
        (comMapa ? (
          <span>
            <svg width="34" height="12" aria-hidden>
              <line x1="2" y1="6" x2="32" y2="6" stroke="rgba(6,16,28,.55)" strokeWidth="7.5" strokeLinecap="round" />
              <line x1="2" y1="6" x2="32" y2="6" stroke="#1f8fff" strokeWidth="4" strokeLinecap="round" />
              <polygon points="4,0 -6,-5.5 -3,0 -6,5.5" fill="#fff" transform="translate(19 6)" />
            </svg>
            Rio (traçado real, no sentido da água)
          </span>
        ) : (
          <span>
            <svg width="34" height="10" aria-hidden>
              <line x1="1" y1="5" x2="33" y2="5" stroke={COR.rio} strokeWidth="3" strokeDasharray="9 6" className="un-fluxo un-fluxo--rio" />
            </svg>
            Rio / canal (a seta indica o sentido da água)
          </span>
        ))}
      {tem.tunel && (
        <span>
          <svg width="34" height="10" aria-hidden>
            <line x1="1" y1="5" x2="33" y2="5" stroke={COR.tunel} strokeWidth="2.2" strokeDasharray="3 5" className="un-fluxo un-fluxo--tunel" />
          </svg>
          Túnel / transferência / bombeamento
        </span>
      )}
      {tem.aducao && (
        <span>
          <svg width="34" height="10" aria-hidden>
            <line x1="1" y1="5" x2="33" y2="5" stroke={COR.aducao} strokeWidth="2.2" strokeDasharray="12 4 2 4" className="un-fluxo un-fluxo--aducao" />
          </svg>
          Adução para ETA
        </span>
      )}
      {!comMapa && tem.descarregada && (
        <span>
          <b style={{ color: COR.descarregada }}>0,25 m³/s</b>
          Vazão descarregada (média do dia; em cima, a média do mês)
        </span>
      )}
      <span>
        <svg width="34" height="10" aria-hidden className="un-parado">
          <line x1="1" y1="5" x2="33" y2="5" stroke={COR.rio} strokeWidth="3" strokeDasharray="9 6" />
        </svg>
        Sem vazão no dia ou túnel sem dado (parado)
      </span>
      {tem.posto && (
        <span>
          <svg width="26" height="16" viewBox="-12 -8 24 16" aria-hidden>
            <circle r="6" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.6" />
          </svg>
          {textoPosto}
        </span>
      )}
      {tem.pluviometro && (
        <span>
          <svg width="22" height="22" viewBox="-12 -12 24 24" aria-hidden>
            <circle r="11" fill={COR.fundoSimbolo} stroke={COR.chuva} strokeWidth="1.6" />
            <path d="M-6-6h12l-4 5v8h-4v-8z" fill="none" stroke={COR.chuva} strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          Pluviômetro (SIBH): chuva em 24 h; 72 h e no mês na dica
        </span>
      )}
      {tem.reservatorio && (
        <span>
          <svg width="34" height="16" viewBox="-74 -24 156 48" aria-hidden>
            <polygon points="-52,-20 78,-20 52,20 -52,20" fill="url(#un-agua)" stroke={COR.contorno} strokeWidth="3" />
          </svg>
          Reservatório (volume útil)
        </span>
      )}
      {variacao && (
        <span>
          <b style={{ color: COR.sobe }}>▲</b>
          <b style={{ color: COR.desce }}>▼</b>
          Variação do volume útil no dia (p.p.)
        </span>
      )}
      {tem.eeab && (
        <span>
          <svg width="22" height="22" viewBox="-15 -15 30 30" aria-hidden>
            <circle r="13" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.8" />
            <circle r="4" fill={COR.contorno} />
          </svg>
          EEAB (elevatória de água bruta)
        </span>
      )}
      {tem.uhe && (
        <span>
          <svg width="24" height="24" viewBox="-17 -17 34 34" aria-hidden>
            <circle r="16" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.8" />
            <path d="M2-9l-7 10h6l-3 8 8-11h-6z" fill={COR.chuva} />
          </svg>
          Usina hidrelétrica (vazão defluente)
        </span>
      )}
      {tem.eta && (
        <span>
          <svg width="30" height="22" viewBox="-19 -13 38 26" aria-hidden>
            <rect x="-18" y="-12" width="36" height="24" rx="3" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.8" />
          </svg>
          ETA
        </span>
      )}
      {tem.estrutura && (
        <span>
          <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden>
            <rect x="-9" y="-9" width="18" height="18" rx="2" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.8" />
          </svg>
          Estrutura / represa de outro sistema
        </span>
      )}
      {tem.cidade && (
        <span>
          <svg width="30" height="26" viewBox="-24 -24 48 40" aria-hidden>
            <g fill="none" stroke={COR.contorno} strokeWidth="1.8">
              <rect x={-22} y={-10} width={12} height={22} />
              <rect x={-8} y={-22} width={14} height={34} />
              <rect x={8} y={-14} width={12} height={26} />
            </g>
          </svg>
          Destino da água (cidade, ETA, foz)
        </span>
      )}
      {tem.radar && (
        <span>
          <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden>
            <SimboloRadar />
          </svg>
          Chuva do dia por radar na bacia (SIBH, 00h–24h)
        </span>
      )}
      {tem.reservatorio && (
        <span>
          Nº da represa: volume útil
          {FAIXAS.map(([p, t]) => (
            <span key={p} className="un-legenda-faixa">
              <i style={{ background: COR_FAIXA(p) }} />
              {t}
            </span>
          ))}
        </span>
      )}
      <span className="un-legenda-nota">{nota}</span>
    </div>
  );
}

const BASE_PADRAO: NomeBase = 'Satélite';

const NOTA_FONTE = 'Vazões médias diárias (SSD SP Águas)';
const NOTA_ANTIGOS = '* último dado disponível, anterior à data escolhida';
const notaPostos = (sibh: boolean, ana: boolean) =>
  `postos ${sibh && ana ? 'do SIBH e da ANA' : sibh ? 'do SIBH' : 'da ANA'}: leitura mais recente do dia (dia que já acabou: média do dia)`;

const ZOOM_MAX = 3;
const ZOOM_PASSO = 0.5;

/**
 * Esquema com zoom (botões) e arrastar para mover, para o diagrama que não
 * cabe na tela. Com zoom, o desenho fica maior que a caixa e ela rola; arrastar
 * com o mouse rola também (um arrasto não conta como clique num posto).
 */
function ZoomPan({ children }: { children: ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const caixa = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ x: number; y: number; sl: number; st: number; moveu: boolean } | null>(null);

  // mantém o centro do que se via ao mudar o zoom
  const mudar = (z: number) => {
    const el = caixa.current;
    const novo = Math.min(ZOOM_MAX, Math.max(1, z));
    if (!el || novo === zoom) return;
    const cx = (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth;
    const cy = (el.scrollTop + el.clientHeight / 2) / el.scrollHeight;
    setZoom(novo);
    requestAnimationFrame(() => {
      el.scrollLeft = cx * el.scrollWidth - el.clientWidth / 2;
      el.scrollTop = cy * el.scrollHeight - el.clientHeight / 2;
    });
  };

  return (
    <div className="un-zoom">
      <div className="un-zoom-botoes" role="group" aria-label="Zoom do diagrama">
        <button type="button" onClick={() => mudar(zoom - ZOOM_PASSO)} disabled={zoom <= 1} aria-label="Diminuir o zoom" title="Diminuir">
          <i className="bi bi-zoom-out" aria-hidden />
        </button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => mudar(zoom + ZOOM_PASSO)} disabled={zoom >= ZOOM_MAX} aria-label="Aumentar o zoom" title="Aumentar">
          <i className="bi bi-zoom-in" aria-hidden />
        </button>
        <button type="button" onClick={() => mudar(1)} disabled={zoom === 1} title="Mostrar o diagrama inteiro">
          <i className="bi bi-arrows-angle-contract" aria-hidden /> Inteiro
        </button>
        {zoom > 1 && <small>arraste para mover</small>}
      </div>
      <div
        ref={caixa}
        className={`un-zoom-area${zoom > 1 ? ' is-ampliado' : ''}`}
        onPointerDown={(e) => {
          const el = caixa.current;
          if (zoom <= 1 || e.button !== 0 || !el) return;
          arrasto.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moveu: false };
        }}
        onPointerMove={(e) => {
          const a = arrasto.current;
          const el = caixa.current;
          if (!a || !el) return;
          const dx = e.clientX - a.x;
          const dy = e.clientY - a.y;
          if (!a.moveu && Math.hypot(dx, dy) < 5) return;
          if (!a.moveu) el.setPointerCapture(e.pointerId);
          a.moveu = true;
          el.scrollLeft = a.sl - dx;
          el.scrollTop = a.st - dy;
        }}
        onPointerUp={() => {
          // o clique vem logo depois do pointerup: se arrastou, ele é ignorado (onClickCapture)
          setTimeout(() => (arrasto.current = null), 0);
        }}
        onPointerCancel={() => (arrasto.current = null)}
        onClickCapture={(e) => {
          if (arrasto.current?.moveu) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <div style={{ width: `${zoom * 100}%` }}>{children}</div>
      </div>
    </div>
  );
}

/** Diagrama com os valores do SSD na data, os botões de modo, as barras de volume e a legenda. */
export function DiagramaUnifilar({
  d,
  data,
  tick = 0,
  destaque,
  aoEscolher,
  postoAtivo,
  aoPosto,
  sobre,
  lateral,
}: {
  d: Diagrama;
  data: string;
  tick?: number;
  destaque?: number | null;
  aoEscolher?: (space: number) => void;
  /** posto com os gráficos abertos (chavePosto) */
  postoAtivo?: string | null;
  aoPosto?: (n: NoPostoClicavel) => void;
  /** painel por cima do desenho (gráficos do posto clicado) */
  sobre?: ReactNode;
  /** mais conteúdo na coluna da direita, abaixo dos volumes (Cantareira: vazão descarregada) */
  lateral?: ReactNode;
}) {
  const [modo, setModo] = useState<Modo>('vazao');
  const [base, setBase] = useState<NomeBase | null>(d.semMapa ? null : BASE_PADRAO);
  const [hidro, setHidro] = useState(true);
  const st = useValoresSsd(d, data, tick);
  const reservatorios = d.nos.filter((n): n is Extract<No, { tipo: 'reservatorio' }> => n.tipo === 'reservatorio');
  const antigos = Object.values(st.valores).some((v) => v && v.data < data);
  const tem = useMemo(() => simbolosDe(d), [d]);
  const variacao = Object.entries(st.valores).some(([k, v]) => v && k.endsWith(':dia'));
  const ondePostos = tem.ana ? (tem.sibh ? 'postos no SIBH e na ANA' : 'postos na ANA') : 'radar e postos no SIBH';
  const desenho = (
    <DesenhoUnifilar
      d={d}
      valores={st.valores}
      data={data}
      modo={modo}
      destaque={destaque}
      aoEscolher={aoEscolher}
      postoAtivo={postoAtivo}
      aoPosto={aoPosto}
      classe={d.zoom ? 'un-svg un-svg--zoom' : undefined}
    />
  );

  return (
    <div className="un">
      <div className="un-topo">
        <BotoesModo modo={modo} aoMudar={setModo} />
        {!d.semMapa && (
          <div className="mu-grupo un-bases" role="group" aria-label="Mapa de fundo">
            <span>Mapa de fundo</span>
            {[null, ...BASES.map((b) => b.nome)].map((nome) => (
              <button key={nome ?? 'nenhum'} type="button" className={base === nome ? 'is-ativo' : ''} aria-pressed={base === nome} onClick={() => setBase(nome)}>
                {nome ?? 'Sem mapa'}
              </button>
            ))}
            {base && (
              <button type="button" className={`un-hidro${hidro ? ' is-ativo' : ''}`} aria-pressed={hidro} onClick={() => setHidro((h) => !h)} title={d.mapa?.hidrografia ? 'Rios principais e represas da bacia (IBGE)' : 'Rios principais e represas do sistema (IBGE e OpenStreetMap)'}>
                <i className="bi bi-water" aria-hidden /> Hidrografia
              </button>
            )}
          </div>
        )}
        {st.carregando && <span className="un-status">Atualizando valores…</span>}
        {st.erro && <span className="un-status is-erro">Valores indisponíveis ({st.erro}).</span>}
        {!st.carregando && st.carregandoSibh && <span className="un-status">Buscando {ondePostos}…</span>}
        {st.erroSibh && <span className="un-status is-erro">Postos indisponíveis ({st.erroSibh}): ficam sem valor.</span>}
      </div>
      <div className="un-corpo">
        <div className="un-palco">
          <div className={`un-desenho${st.carregando ? ' is-carregando' : ''}${base ? ` com-mapa com-mapa--${base === 'Escuro' ? 'escuro' : base === 'Satélite' ? 'satelite' : 'claro'}` : ''}`}>
            {base ? (
              <MapaUnifilar d={d} base={base} hidro={hidro}>
                {(v) => (
                  <DesenhoNoMapa d={d} {...v} valores={st.valores} data={data} modo={modo} destaque={destaque} aoEscolher={aoEscolher} postoAtivo={postoAtivo} aoPosto={aoPosto} />
                )}
              </MapaUnifilar>
            ) : d.zoom ? (
              <ZoomPan>{desenho}</ZoomPan>
            ) : (
              desenho
            )}
          </div>
          {sobre}
        </div>
        <div className="un-lateral">
        {reservatorios.length > 0 && (
          <aside className="un-volumes" aria-label="Volumes dos reservatórios">
            <h4>Volumes dos reservatórios</h4>
            {reservatorios.map((r) => {
              const p = st.valores[`${r.space}:${VD.volumePct}`]?.valor ?? null;
              return (
                <button key={r.space} type="button" className={`un-barra${destaque === r.space ? ' is-ativo' : ''}`} onClick={() => aoEscolher?.(r.space)}>
                  <span className="un-barra-nome">{r.nome}</span>
                  <span className="un-barra-trilho">
                    <span style={{ width: `${Math.max(0, Math.min(100, p ?? 0))}%`, background: COR_FAIXA(p) }} />
                  </span>
                  <b>{texto(st.valores, r.space, VD.volumePct, data)}</b>
                </button>
              );
            })}
            {aoEscolher && <p>Clique num reservatório para ver os gráficos dele.</p>}
          </aside>
        )}
        {lateral}
        </div>
      </div>
      <Legenda
        nota={[d.nota ?? NOTA_FONTE, ...(tem.sibh || tem.ana ? [notaPostos(tem.sibh, tem.ana)] : []), ...(antigos ? [NOTA_ANTIGOS] : [])].join(' · ')}
        comMapa={!!base}
        tem={tem}
        variacao={variacao}
      />
      {d.notas?.length ? (
        <ul className="un-notas">
          {d.notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
