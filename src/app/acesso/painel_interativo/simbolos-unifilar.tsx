'use client';

import { useId, type CSSProperties } from 'react';
import { VD, type Ancora, type Ligacao, type No, type Valor } from '@/conteudo/diagramas-unifilares';
import { COR_FAIXA, texto, type Modo, type ValoresSsd } from './valores-ssd';

/**
 * Símbolos e textos dos diagramas unifilares, os mesmos no esquema ("Sem mapa",
 * unifilar.tsx) e sobre o mapa (desenho-mapa.tsx): represa com a água até o
 * volume útil, postos, EEABs, ETAs, valores em azul e nomes em itálico.
 */

export const COR = {
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

// ---------------------------------------------------------------- símbolos

/** Setas no sentido do escoamento, nas frações pedidas do comprimento da linha. */
export function setas(l: Ligacao, cor: string) {
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
export const ESTILO_LINHA: Record<Ligacao['tipo'], { cor: string; largura: number; traco: string; passo: number }> = {
  rio: { cor: COR.rio, largura: 3, traco: '9 6', passo: 30 },
  tunel: { cor: COR.tunel, largura: 2.2, traco: '3 5', passo: 16 },
  aducao: { cor: COR.aducao, largura: 2.2, traco: '12 4 2 4', passo: 22 },
};

const BACIA = '-52,-20 78,-20 52,20 -52,20';

export function TextoValor({ v, valores, data, mostrar }: { v: Valor; valores: ValoresSsd; data: string; mostrar: boolean }) {
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

export function Rotulo({ t }: { t: { texto: string; x: number; y: number; ancora?: Ancora; giro?: number } }) {
  return (
    <text x={t.x} y={t.y} textAnchor={t.ancora ?? 'middle'} fill={COR.fraco} fontSize={12} fontStyle="italic" transform={t.giro ? `rotate(${t.giro} ${t.x} ${t.y})` : undefined}>
      {t.texto}
    </text>
  );
}

/** Ícone de nuvem com chuva (20×16), canto superior esquerdo em (x, y); as gotas caem quando choveu no dia. */
export const Nuvem = ({ x, y, cor, chovendo = false }: { x: number; y: number; cor: string; chovendo?: boolean }) => (
  <g transform={`translate(${x} ${y})`} fill="none" stroke={cor} strokeWidth={1.6} strokeLinecap="round">
    <path d="M5 11h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.6A3.3 3.3 0 0 0 5 11z" />
    <path d="M6 14l-1 3M10 14l-1 3M14 14l-1 3" className={chovendo ? 'un-gotas' : undefined} />
  </g>
);

/** Cor do texto sobre a cor da faixa: escuro no amarelo e no laranja, claro nas demais. */
const corNoFaixa = (p: number | null) => (p !== null && p >= 30 && p < 60 ? '#1b1f24' : '#fff');

export function Reservatorio({
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
      {/* número na cor da faixa do volume útil (a mesma das barras e da legenda) */}
      <circle cx={bx + circ} cy={by - 6} r={11} fill={COR_FAIXA(pct)} stroke={COR.nome} strokeWidth={1.4} />
      <text x={bx + circ} y={by - 1.5} textAnchor="middle" fill={corNoFaixa(pct)} fontSize={12} fontWeight={800}>
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
export function Simbolo({ n, ativo }: { n: Exclude<No, { tipo: 'reservatorio' }>; ativo: boolean }) {
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

export function Ponto({ n, valores, data, modo, vazao }: { n: Exclude<No, { tipo: 'reservatorio' }>; valores: ValoresSsd; data: string; modo: Modo; vazao: number | null }) {
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
