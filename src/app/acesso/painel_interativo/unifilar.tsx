'use client';

import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { paresDoDiagrama, VD, type Ancora, type Diagrama, type Ligacao, type No, type Valor } from '@/conteudo/diagramas-unifilares';

/**
 * Diagrama unifilar de um sistema produtor no tema escuro do painel: rios e
 * túneis tracejados com o sentido do escoamento, reservatórios com o nível de
 * água pelo volume útil, e os valores do SSD na data escolhida. Os modos
 * mostram vazões, volume (hm³), nível (m) ou chuva sobre o mesmo desenho.
 */

export type ValoresSsd = Record<string, { valor: number; data: string } | null>;
export type Modo = 'vazao' | 'volume' | 'nivel' | 'chuva';

export const MODOS: { modo: Modo; rotulo: string; icone: string }[] = [
  { modo: 'vazao', rotulo: 'Vazão', icone: 'bi-water' },
  { modo: 'volume', rotulo: 'Volume', icone: 'bi-database' },
  { modo: 'nivel', rotulo: 'Nível', icone: 'bi-rulers' },
  { modo: 'chuva', rotulo: 'Chuva', icone: 'bi-cloud-rain' },
];

const COR = {
  rio: '#2f9bff',
  tunel: '#7fd3ff',
  aducao: '#9be7c4',
  contorno: '#5fb4ff',
  fundoSimbolo: '#35414e', // = fundo do diagrama (--un-fundo, painel-interativo.css)
  bacia: '#27313c', // parte vazia do reservatório
  valor: '#4fc3f7',
  nome: '#f2f7fc',
  fraco: '#8fb3d9',
  chuva: '#b9ff4f',
};

// casas decimais e unidade por variável do SSD
const FORMATO: Record<number, [number, string]> = {
  [VD.chuva]: [1, 'mm'],
  [VD.vazao]: [2, 'm³/s'],
  [VD.descarregada]: [2, 'm³/s'],
  [VD.natural]: [2, 'm³/s'],
  [VD.captada]: [2, 'm³/s'],
  [VD.volumePct]: [1, '%'],
  [VD.volumeHm3]: [2, 'hm³'],
  [VD.nivel]: [2, 'm'],
  [VD.defluente]: [2, 'm³/s'],
};

const numero = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** "4,61 m³/s" (ou "—"); com "*" quando o dado é de dia anterior ao pedido. */
function texto(valores: ValoresSsd, space: number, v: number, data: string, comUnidade = true): string {
  const x = valores[`${space}:${v}`];
  if (!x) return '—';
  const [casas, un] = FORMATO[v] ?? [2, ''];
  const unidade = comUnidade && un ? (un === '%' ? un : ` ${un}`) : '';
  return `${numero(x.valor, casas)}${unidade}${x.data < data ? '*' : ''}`;
}

// ---------------------------------------------------------------- símbolos

/** Setas no sentido do escoamento, nas frações pedidas do comprimento da linha. */
function setas(l: Ligacao, cor: string) {
  const fracoes = l.setas ?? (l.tipo === 'rio' ? [0.5] : [1]);
  const trechos = l.pontos.slice(1).map((p, i) => {
    const a = l.pontos[i]!;
    return { a, b: p, c: Math.hypot(p[0] - a[0], p[1] - a[1]) };
  });
  const total = trechos.reduce((s, t) => s + t.c, 0);
  if (!total) return null;
  return fracoes.map((f, k) => {
    let resto = f * total;
    const t = trechos.find((x) => (resto -= x.c) <= 0) ?? trechos.at(-1)!;
    const p = f >= 1 ? 1 : (t.c + resto) / t.c;
    const x = t.a[0] + (t.b[0] - t.a[0]) * p;
    const y = t.a[1] + (t.b[1] - t.a[1]) * p;
    const ang = (Math.atan2(t.b[1] - t.a[1], t.b[0] - t.a[0]) * 180) / Math.PI;
    return <polygon key={k} points="0,0 -11,-6 -11,6" fill={cor} transform={`translate(${x} ${y}) rotate(${ang})`} />;
  });
}

// passo = quanto o tracejado anda por ciclo da animação (múltiplo do traço; o mesmo de @keyframes un-fluxo-* no CSS)
const ESTILO_LINHA: Record<Ligacao['tipo'], { cor: string; largura: number; traco: string; passo: number }> = {
  rio: { cor: COR.rio, largura: 3, traco: '9 6', passo: 30 },
  tunel: { cor: COR.tunel, largura: 2.2, traco: '3 5', passo: 16 },
  aducao: { cor: COR.aducao, largura: 2.2, traco: '12 4 2 4', passo: 22 },
};

const BACIA = '-52,-20 78,-20 52,20 -52,20';

/** Valor numérico de um campo do SSD (null sem dado). */
const valorDe = (valores: ValoresSsd, c?: { space: number; v: number }) => (c ? (valores[`${c.space}:${c.v}`]?.valor ?? null) : null);

/** Duração de um ciclo da água correndo: mais rápida quanto maior a vazão (escala log; sem dado, velocidade média). */
const duracaoFluxo = (passo: number, q: number | null) => passo / (q === null ? 20 : 12 + 22 * Math.log10(1 + q));

function TextoValor({ v, valores, data, mostrar }: { v: Valor; valores: ValoresSsd; data: string; mostrar: boolean }) {
  if (!mostrar) return null;
  return (
    <g className="un-valor">
      <text x={v.x} y={v.y} textAnchor={v.ancora ?? 'middle'} fill={COR.valor} fontSize={15} fontWeight={800}>
        {texto(valores, v.space, v.v, data)}
      </text>
      {v.rotulo && (
        <text x={v.x} y={v.y + 15} textAnchor={v.ancora ?? 'middle'} fill={COR.fraco} fontSize={11}>
          {v.rotulo}
        </text>
      )}
    </g>
  );
}

function Rotulo({ t }: { t: { texto: string; x: number; y: number; ancora?: Ancora; giro?: number } }) {
  return (
    <text x={t.x} y={t.y} textAnchor={t.ancora ?? 'middle'} fill={COR.fraco} fontSize={12} fontStyle="italic" transform={t.giro ? `rotate(${t.giro} ${t.x} ${t.y})` : undefined}>
      {t.texto}
    </text>
  );
}

/** Ícone de nuvem com chuva (20×16), canto superior esquerdo em (x, y); as gotas caem quando choveu no dia. */
const Nuvem = ({ x, y, cor, chovendo = false }: { x: number; y: number; cor: string; chovendo?: boolean }) => (
  <g transform={`translate(${x} ${y})`} fill="none" stroke={cor} strokeWidth={1.6} strokeLinecap="round">
    <path d="M5 11h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.6A3.3 3.3 0 0 0 5 11z" />
    <path d="M6 14l-1 3M10 14l-1 3M14 14l-1 3" className={chovendo ? 'un-gotas' : undefined} />
  </g>
);

function Reservatorio({
  n,
  valores,
  data,
  modo,
  ativo,
  aoEscolher,
}: {
  n: Extract<No, { tipo: 'reservatorio' }>;
  valores: ValoresSsd;
  data: string;
  modo: Modo;
  ativo: boolean;
  aoEscolher?: (space: number) => void;
}) {
  const pct = valores[`${n.space}:${VD.volumePct}`]?.valor ?? null;
  const nivelAgua = pct === null ? 0 : Math.max(0, Math.min(1, pct / 100));
  const yAgua = 20 - 40 * nivelAgua; // superfície da água (fundo da bacia em y = 20)
  const chovendo = (valores[`${n.space}:${VD.chuva}`]?.valor ?? 0) > 0;
  const id = `un-cp-${n.space}-${useId().replace(/[^\w-]/g, '')}`; // único na página (vários diagramas juntos)
  // bloco do nome: acima (padrão), abaixo, à direita ou à esquerda do símbolo
  const lado = n.rotulo ?? 'acima';
  const bx = lado === 'direita' ? 96 : lado === 'esquerda' ? -88 : -52;
  const by = lado === 'abaixo' ? 44 : lado === 'acima' ? -48 : -14;
  const anc: Ancora = lado === 'esquerda' ? 'end' : 'start';
  const circ = lado === 'esquerda' ? 14 : -18;
  const extra = modo === 'volume' ? texto(valores, n.space, VD.volumeHm3, data) : modo === 'nivel' ? texto(valores, n.space, VD.nivel, data) : null;
  const chuva = texto(valores, n.space, VD.chuva, data);
  // chuva ao lado do nome (largura do nome estimada pelo número de letras)
  const larguraNome = Math.max(n.nome.length * 9.6, (n.prefixo ?? 'Represa').length * 6.2);
  const cx = anc === 'end' ? bx - 4 - larguraNome - 92 : bx + larguraNome + 12;

  return (
    <g
      className={`un-res${ativo ? ' is-ativo' : ''}`}
      transform={`translate(${n.x} ${n.y})`}
      onClick={aoEscolher ? () => aoEscolher(n.space) : undefined}
      role={aoEscolher ? 'button' : undefined}
      tabIndex={aoEscolher ? 0 : undefined}
      onKeyDown={aoEscolher ? (e) => (e.key === 'Enter' || e.key === ' ') && aoEscolher(n.space) : undefined}
    >
      <title>{`${n.nome} — volume útil ${texto(valores, n.space, VD.volumePct, data)} · ${texto(valores, n.space, VD.volumeHm3, data)} · nível ${texto(valores, n.space, VD.nivel, data)} · chuva ${chuva}`}</title>
      {/* água até o volume útil; y e height também no style, para a transição (represa enchendo) */}
      <clipPath id={id}>
        <rect className="un-agua-nivel" x={-60} y={yAgua} width={150} height={20 - yAgua} style={{ y: yAgua, height: 20 - yAgua } as CSSProperties} />
      </clipPath>
      <clipPath id={`${id}-b`}>
        <polygon points={BACIA} />
      </clipPath>
      {/* barragem e bacia */}
      <polygon points="-72,20 -52,-28 -52,20" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth={1.5} />
      <polygon points={BACIA} fill={COR.bacia} stroke={ativo ? '#ffb020' : COR.contorno} strokeWidth={ativo ? 3 : 1.6} />
      <polygon points={BACIA} fill="url(#un-agua)" clipPath={`url(#${id})`} />
      <g clipPath={`url(#${id}-b)`}>
        <line className="un-agua-nivel" x1={-60} x2={90} y1={0} y2={0} style={{ transform: `translateY(${yAgua}px)` }} stroke="#bfe9ff" strokeWidth={1.2} opacity={pct === null ? 0 : 0.8} />
      </g>
      <text x={10} y={6} textAnchor="middle" fill="#fff" fontSize={17} fontWeight={800} className="un-sombra">
        {texto(valores, n.space, VD.volumePct, data)}
      </text>
      {/* nome */}
      <circle cx={bx + circ} cy={by - 6} r={11} fill="none" stroke={COR.contorno} strokeWidth={1.4} />
      <text x={bx + circ} y={by - 1.5} textAnchor="middle" fill={COR.nome} fontSize={12} fontWeight={700}>
        {n.num}
      </text>
      <text x={bx + (anc === 'end' ? -4 : 0)} y={by - 12} textAnchor={anc} fill={COR.fraco} fontSize={11}>
        {n.prefixo ?? 'Represa'}
      </text>
      <text x={bx + (anc === 'end' ? -4 : 0)} y={by + 5} textAnchor={anc} fill={COR.nome} fontSize={16} fontWeight={800}>
        {n.nome}
      </text>
      {/* chuva (destacada no modo chuva) */}
      <g opacity={modo === 'chuva' || modo === 'vazao' ? 1 : 0.55}>
        <Nuvem x={cx} y={by - 16} cor={modo === 'chuva' ? COR.chuva : COR.fraco} chovendo={chovendo} />
        <text x={cx + 25} y={by + 1} fill={modo === 'chuva' ? COR.chuva : COR.valor} fontSize={modo === 'chuva' ? 17 : 14} fontWeight={800}>
          {chuva}
        </text>
      </g>
      {extra && (
        <text x={10} y={40} textAnchor="middle" fill={COR.chuva} fontSize={15} fontWeight={800} className="un-sombra">
          {extra}
        </text>
      )}
    </g>
  );
}

/** Símbolo do ponto; `ativo` (vazão > 0) faz o rotor da EEAB girar e o raio da UHE pulsar. */
function Simbolo({ n, ativo }: { n: Exclude<No, { tipo: 'reservatorio' }>; ativo: boolean }) {
  const s = { fill: COR.fundoSimbolo, stroke: COR.contorno, strokeWidth: 1.8 };
  switch (n.tipo) {
    case 'posto':
      return <circle r={9} {...s} />;
    case 'estrutura':
      return <rect x={-9} y={-9} width={18} height={18} rx={2} {...s} />;
    case 'eeab':
      return (
        <g>
          <circle r={14} {...s} />
          <g className={ativo ? 'un-rotor' : undefined}>
            <circle r={4} fill={COR.contorno} />
            <path d="M0-4a8 8 0 0 1 8 6M4 2a8 8 0 0 1-8 6M-4 2a8 8 0 0 1 0-10" fill="none" stroke={COR.contorno} strokeWidth={1.6} />
          </g>
        </g>
      );
    case 'eta':
      return (
        <g>
          <rect x={-18} y={-12} width={36} height={24} rx={3} {...s} />
          <path d="M-12-6h24M-12 0h24M-12 6h24" stroke={COR.contorno} strokeWidth={1.4} />
        </g>
      );
    case 'uhe':
      return (
        <g>
          <circle r={16} {...s} />
          <path d="M2-9l-7 10h6l-3 8 8-11h-6z" fill={COR.chuva} className={ativo ? 'un-pulso' : undefined} />
        </g>
      );
    case 'cidade':
      return (
        <g {...s} fill="none">
          <rect x={-22} y={-10} width={12} height={22} />
          <rect x={-8} y={-22} width={14} height={34} />
          <rect x={8} y={-14} width={12} height={26} />
        </g>
      );
  }
}

function Ponto({ n, valores, data, modo, vazao }: { n: Exclude<No, { tipo: 'reservatorio' }>; valores: ValoresSsd; data: string; modo: Modo; vazao: number | null }) {
  const lado = n.rotulo ?? 'acima';
  const raio = n.tipo === 'eta' || n.tipo === 'cidade' ? 24 : n.tipo === 'eeab' || n.tipo === 'uhe' ? 18 : 12;
  const pos =
    lado === 'acima'
      ? { x: 0, y1: -raio - 22, y2: -raio - 6, anc: 'middle' as Ancora }
      : lado === 'abaixo'
        ? { x: 0, y1: raio + 14, y2: raio + 30, anc: 'middle' as Ancora }
        : lado === 'direita'
          ? { x: raio + 6, y1: -2, y2: 14, anc: 'start' as Ancora }
          : { x: -raio - 6, y1: -2, y2: 14, anc: 'end' as Ancora };
  const titulo = [n.prefixo, n.nome].filter(Boolean).join(' ');
  return (
    <g transform={`translate(${n.x} ${n.y})`} className="un-ponto">
      <title>{n.valor ? `${titulo}: ${texto(valores, n.valor.space, n.valor.v, data)}` : titulo}</title>
      <Simbolo n={n} ativo={vazao !== null && vazao > 0} />
      {n.prefixo && (
        <text x={pos.x} y={pos.y1} textAnchor={pos.anc} fill={COR.fraco} fontSize={11}>
          {n.prefixo}
        </text>
      )}
      <text x={pos.x} y={n.prefixo ? pos.y2 : pos.y1 + 8} textAnchor={pos.anc} fill={COR.nome} fontSize={13} fontWeight={700}>
        {n.nome}
      </text>
      {n.valor && modo === 'vazao' && (
        <text x={n.valor.dx} y={n.valor.dy} textAnchor={n.valor.ancora ?? 'middle'} fill={COR.valor} fontSize={15} fontWeight={800}>
          {texto(valores, n.valor.space, n.valor.v, data)}
        </text>
      )}
    </g>
  );
}

/** O desenho em si (sem busca de dados): serve também para testes e exportação. */
export function DesenhoUnifilar({
  d,
  valores,
  data,
  modo,
  destaque,
  aoEscolher,
}: {
  d: Diagrama;
  valores: ValoresSsd;
  data: string;
  modo: Modo;
  destaque?: number | null;
  aoEscolher?: (space: number) => void;
}) {
  const vazoes = modo === 'vazao';
  // vazão de um ponto (EEAB, UHE): a dele ou a da ligação que começa ou termina nele
  const vazaoNo = (n: Exclude<No, { tipo: 'reservatorio' }>) =>
    n.valor
      ? valorDe(valores, n.valor)
      : valorDe(valores, d.ligacoes.find((l) => l.valor && [l.pontos[0], l.pontos.at(-1)].some((p) => p && Math.hypot(p[0] - n.x, p[1] - n.y) < 24))?.valor);
  return (
    <svg className="un-svg" viewBox={`0 0 ${d.largura} ${d.altura}`} role="img" aria-label={`Diagrama unifilar — ${d.titulo}`}>
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
          const parado = q !== null && q <= 0;
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
      {d.nos.map((n, i) =>
        n.tipo === 'reservatorio' ? (
          <Reservatorio key={i} n={n} valores={valores} data={data} modo={modo} ativo={destaque === n.space} aoEscolher={aoEscolher} />
        ) : (
          <Ponto key={i} n={n} valores={valores} data={data} modo={modo} vazao={n.tipo === 'eeab' || n.tipo === 'uhe' ? vazaoNo(n) : null} />
        ),
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- com dados

const COR_FAIXA = (p: number | null) => (p === null ? '#6c7f91' : p >= 60 ? '#1aa564' : p >= 40 ? '#f4b400' : p >= 30 ? '#e08600' : p >= 20 ? '#dc3545' : '#9b3fb0');

/** Valores do SSD de todos os campos do diagrama, na data (refeito a cada `tick`). */
function useValoresSsd(d: Diagrama, data: string, tick: number) {
  const [st, setSt] = useState<{ valores: ValoresSsd; carregando: boolean; erro?: string }>({ valores: {}, carregando: true });
  const pares = useMemo(() => paresDoDiagrama(d).join(','), [d]);

  useEffect(() => {
    let vivo = true;
    setSt((s) => ({ valores: s.valores, carregando: true }));
    fetch(`/api/acesso/painel_interativo/valores?data=${data}&p=${pares}&t=${tick}`)
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
  }, [pares, data, tick]);

  return st;
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

function Legenda({ nota }: { nota: string }) {
  return (
    <div className="un-legenda" aria-label="Legenda">
      <span>
        <svg width="34" height="10" aria-hidden>
          <line x1="1" y1="5" x2="33" y2="5" stroke={COR.rio} strokeWidth="3" strokeDasharray="9 6" className="un-fluxo un-fluxo--rio" />
        </svg>
        Rio / canal
      </span>
      <span>
        <svg width="34" height="10" aria-hidden>
          <line x1="1" y1="5" x2="33" y2="5" stroke={COR.tunel} strokeWidth="2.2" strokeDasharray="3 5" className="un-fluxo un-fluxo--tunel" />
        </svg>
        Túnel / transferência
      </span>
      <span>
        <svg width="34" height="10" aria-hidden>
          <line x1="1" y1="5" x2="33" y2="5" stroke={COR.aducao} strokeWidth="2.2" strokeDasharray="12 4 2 4" className="un-fluxo un-fluxo--aducao" />
        </svg>
        Adução para ETA
      </span>
      <span>
        <svg width="34" height="10" aria-hidden className="un-parado">
          <line x1="1" y1="5" x2="33" y2="5" stroke={COR.rio} strokeWidth="3" strokeDasharray="9 6" />
        </svg>
        Sem vazão no dia (parado)
      </span>
      <span>
        <svg width="26" height="16" viewBox="-12 -8 24 16" aria-hidden>
          <circle r="6" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.6" />
        </svg>
        Posto fluviométrico
      </span>
      <span>
        <svg width="34" height="16" viewBox="-74 -24 156 48" aria-hidden>
          <polygon points="-52,-20 78,-20 52,20 -52,20" fill="url(#un-agua)" stroke={COR.contorno} strokeWidth="3" />
        </svg>
        Reservatório (volume útil)
      </span>
      <span>
        <svg width="22" height="22" viewBox="-15 -15 30 30" aria-hidden>
          <circle r="13" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.8" />
          <circle r="4" fill={COR.contorno} />
        </svg>
        EEAB (elevatória de água bruta)
      </span>
      <span>
        <svg width="30" height="22" viewBox="-19 -13 38 26" aria-hidden>
          <rect x="-18" y="-12" width="36" height="24" rx="3" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.8" />
        </svg>
        ETA
      </span>
      <span className="un-legenda-nota">{nota}</span>
    </div>
  );
}

const NOTA_FONTE = 'Vazões médias diárias (SSD SP Águas)';
const NOTA_ANTIGOS = '* último dado disponível, anterior à data escolhida';

/** Diagrama com os valores do SSD na data, os botões de modo, as barras de volume e a legenda. */
export function DiagramaUnifilar({
  d,
  data,
  tick = 0,
  destaque,
  aoEscolher,
}: {
  d: Diagrama;
  data: string;
  tick?: number;
  destaque?: number | null;
  aoEscolher?: (space: number) => void;
}) {
  const [modo, setModo] = useState<Modo>('vazao');
  const st = useValoresSsd(d, data, tick);
  const reservatorios = d.nos.filter((n): n is Extract<No, { tipo: 'reservatorio' }> => n.tipo === 'reservatorio');
  const antigos = Object.values(st.valores).some((v) => v && v.data < data);

  return (
    <div className="un">
      <div className="un-topo">
        <BotoesModo modo={modo} aoMudar={setModo} />
        {st.carregando && <span className="un-status">Atualizando valores…</span>}
        {st.erro && <span className="un-status is-erro">Valores indisponíveis ({st.erro}).</span>}
      </div>
      <div className="un-corpo">
        <div className={`un-desenho${st.carregando ? ' is-carregando' : ''}`}>
          <DesenhoUnifilar d={d} valores={st.valores} data={data} modo={modo} destaque={destaque} aoEscolher={aoEscolher} />
        </div>
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
            <p>Clique num reservatório para ver os gráficos dele.</p>
          </aside>
        )}
      </div>
      <Legenda nota={antigos ? `${NOTA_FONTE} · ${NOTA_ANTIGOS}` : NOTA_FONTE} />
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
