'use client';

import { memo, useMemo } from 'react';
import type { Ancora, Diagrama, Ligacao, No, Valor } from '@/conteudo/diagramas-unifilares';
import { afastar, arrumarCartoes, caixaComNome, caixaRadar, type Escala, type ItemCartao, type NaLinha, type PlanoMapa, type Pt } from './posicoes-mapa';
import { COR, Ponto, PontoRadar, Reservatorio } from './simbolos-unifilar';
import { duracaoFluxo, texto, valorDe, type Modo, type ValoresSsd } from './valores-ssd';

/**
 * Diagrama unifilar sobre o mapa: os rios pelo traçado real, destacados, com
 * setas no sentido da água; túneis e adutoras tracejados. Os dados aparecem
 * como no esquema ("Sem mapa"): os mesmos símbolos (simbolos-unifilar.tsx) no
 * ponto real de cada nó, e os valores e nomes junto das linhas, no mesmo lado
 * e afastamento do esquema. Símbolo que cobriria outro sai um pouco do lugar,
 * com uma guia até o ponto real; valor ou nome que cobriria algo procura um
 * lugar livre perto. Posições: posicoes-mapa.ts; o mapa: mapa-unifilar.tsx.
 */

// ---------------------------------------------------------------- textos

/** Uma linha de texto, no estilo do esquema (TextoValor e Rotulo de simbolos-unifilar.tsx). */
type Linha = { t: string; tam: number; peso: number; cor: string; italico?: boolean };
const VALOR = { tam: 15, peso: 800, cor: COR.valor };
const SOB_VALOR = { tam: 11, peso: 400, cor: COR.fraco };
const NOME = { tam: 12, peso: 400, cor: COR.fraco, italico: true };

let medidor: CanvasRenderingContext2D | null | undefined;
let familia = 'system-ui, sans-serif';
/** Largura do texto (px, sem escala) na fonte da página; sem canvas (servidor), uma estimativa. */
function largura(l: Linha): number {
  if (medidor === undefined) {
    medidor = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (medidor) familia = getComputedStyle(document.body).fontFamily || familia;
  }
  if (!medidor) return l.t.length * l.tam * 0.6;
  medidor.font = `${l.italico ? 'italic ' : ''}${l.peso} ${l.tam}px ${familia}`;
  return medidor.measureText(l.t).width;
}
const altura = (l: Linha) => l.tam * 1.15;

type Texto = { chave: string; linhas: Linha[]; x: number; y: number; w: number; h: number; s: number };

/** Texto do esquema junto da linha: o ponto de base (âncora do texto no esquema) vai para o mesmo afastamento da linha, em px. */
function junto(em: NaLinha, s: number): Pt {
  const { p, d, o } = em;
  return [p[0] + s * (o[0] * d[0] - o[1] * d[1]), p[1] + s * (o[0] * d[1] + o[1] * d[0])];
}

/** Item para arrumar: caixa do texto com a base em `base` (alinhada como no esquema). */
function itemTexto(chave: string, em: NaLinha, linhas: Linha[], ancora: Ancora | undefined, s: number): Texto & ItemCartao {
  const base = junto(em, s);
  const w = s * Math.max(...linhas.map(largura));
  const h = s * linhas.reduce((a, l) => a + altura(l), 0);
  const x = ancora === 'start' ? base[0] : ancora === 'end' ? base[0] - w : base[0] - w / 2;
  const y = base[1] - s * linhas[0]!.tam * 0.85;
  return { chave, linhas, x, y, w, h, s, p: em.p, pref: [x, y], longe: false };
}

/**
 * Os símbolos (com o deslocamento, se saíram do ponto real), as guias e os
 * textos numa escala. `lugares`: os nós e, depois deles, os postos de radar.
 */
function montar(d: Diagrama, esc: Escala, s: number, valores: ValoresSsd, data: string, modo: Modo) {
  // símbolos no ponto real; os que se cobririam saem o mínimo, com uma guia até ele
  const reais = [...esc.nos, ...esc.radares];
  const caixas = [...d.nos.map(caixaComNome), ...(d.radares ?? []).map(caixaRadar)];
  const lugares = afastar(reais, caixas, s);
  const guias = reais.flatMap((p, i): [Pt, Pt][] => (Math.hypot(lugares[i]![0] - p[0], lugares[i]![1] - p[1]) > 3 ? [[p, lugares[i]!]] : []));
  const fixos = lugares.map((p, i): [number, number, number, number] => {
    const c = caixas[i]!;
    return [p[0] + s * c[0], p[1] + s * c[1], s * (c[2] - c[0]), s * (c[3] - c[1])];
  });

  // valores (no modo vazão, como no esquema) e nomes junto das linhas
  const itens: (Texto & ItemCartao)[] = [];
  const valor = (chave: string, v: Valor, em: NaLinha | null | undefined) => {
    if (modo !== 'vazao' || !em) return;
    const linhas: Linha[] = [{ t: texto(valores, v.space, v.v, data), ...VALOR }, ...(v.rotulo ? [{ t: v.rotulo, ...SOB_VALOR }] : [])];
    itens.push(itemTexto(chave, em, linhas, v.ancora, s));
  };
  d.ligacoes.forEach((l, k) => l.valor && valor(`v${k}`, l.valor, esc.valores[k]));
  (d.valores ?? []).forEach((v, k) => valor(`a${k}`, v, esc.avulsos[k]));
  d.ligacoes.forEach((l, k) => {
    const em = esc.rotulos[k];
    if (l.rotulo && em) itens.push(itemTexto(`r${k}`, em, [{ t: l.rotulo.texto, ...NOME }], l.rotulo.ancora, s));
  });
  const ancorasTextos = (d.textos ?? []).filter((t) => !t.semMapa);
  esc.textos.forEach((t, k) => itens.push(itemTexto(`t${k}`, t.em, [{ t: t.texto, ...NOME }], ancorasTextos[k]?.ancora, s)));

  const onde = arrumarCartoes(itens, reais, esc.linhas, fixos);
  return { lugares, guias, textos: itens.map((t, i) => ({ ...t, x: onde[i]![0], y: onde[i]![1] })) };
}

// ---------------------------------------------------------------- linhas

// passo: quanto o tracejado anda por ciclo da animação (o mesmo de @keyframes un-fluxo-* no CSS)
const ESTILO: Record<Ligacao['tipo'], { cor: string; largura: number; traco?: string; fluxo?: string; passo: number }> = {
  rio: { cor: '#1f8fff', largura: 4, fluxo: '2 13', passo: 30 },
  tunel: { cor: COR.tunel, largura: 2.6, traco: '3 5', passo: 16 },
  aducao: { cor: COR.aducao, largura: 2.6, traco: '12 4 2 4', passo: 22 },
};
// setas nos rios: a primeira e a distância entre elas (px)
const SETA_INICIO = 60;
const SETA_PASSO = 160;

/** A linha sem pontos a menos de 1,5 px do anterior (no zoom afastado, o traçado tem muito mais pontos que pixels). */
function enxugar(ps: Pt[]): Pt[] {
  if (ps.length < 3) return ps;
  const r = [ps[0]!];
  for (let i = 1; i < ps.length - 1; i++) {
    const a = r.at(-1)!;
    if (Math.abs(ps[i]![0] - a[0]) + Math.abs(ps[i]![1] - a[1]) >= 1.5) r.push(ps[i]!);
  }
  r.push(ps.at(-1)!);
  return r;
}

/** Setas ao longo da linha: posição e ângulo (graus), nas distâncias pedidas a partir do começo. */
function setasEm(ps: Pt[], distancias: number[]): { p: Pt; ang: number }[] {
  const r: { p: Pt; ang: number }[] = [];
  let k = 0;
  let acum = 0;
  for (let i = 1; i < ps.length && k < distancias.length; i++) {
    const [a, b] = [ps[i - 1]!, ps[i]!];
    const c = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (k < distancias.length && distancias[k]! <= acum + c) {
      const t = c ? (distancias[k]! - acum) / c : 0;
      // direção suavizada: de ~8 px antes a ~8 px depois
      const antes = ps[Math.max(0, i - 2)]!;
      const depois = ps[Math.min(ps.length - 1, i + 1)]!;
      r.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ang: (Math.atan2(depois[1] - antes[1], depois[0] - antes[0]) * 180) / Math.PI });
      k++;
    }
    acum += c;
  }
  return r;
}

const comprimento = (ps: Pt[]) => ps.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - ps[i]![0], p[1] - ps[i]![1]), 0);

function Linhas({ d, esc, valores }: { d: Diagrama; esc: Escala; valores: ValoresSsd }) {
  const desenho = useMemo(
    () =>
      esc.linhas.map((ps0, k) => {
        const ps = enxugar(ps0);
        const tipo = d.ligacoes[k]!.tipo;
        const c = comprimento(ps);
        const ds = tipo === 'rio' ? Array.from({ length: Math.max(c > 50 ? 1 : 0, Math.floor((c - SETA_INICIO) / SETA_PASSO) + 1) }, (_, j) => Math.min(c / 2, SETA_INICIO) + j * SETA_PASSO) : c > 30 ? [c / 2, c - 6] : [c];
        return { pontos: ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '), setas: setasEm(ps, ds) };
      }),
    [d, esc],
  );
  return (
    <g className="um-linhas">
      {d.ligacoes.map((l, k) => {
        const e = ESTILO[l.tipo];
        const q = valorDe(valores, l.valor);
        const parado = q !== null && q <= 0;
        const { pontos, setas } = desenho[k]!;
        return (
          <g key={k} className={parado ? 'um-parado' : undefined}>
            <polyline points={pontos} className="um-contorno" strokeWidth={e.largura + 3.5} />
            {/* túnel e adutora: o próprio tracejado corre; rio: linha cheia e a água (tracejado claro) correndo por cima */}
            <polyline
              points={pontos}
              fill="none"
              stroke={e.cor}
              strokeWidth={e.largura}
              strokeDasharray={e.traco}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={!parado && l.tipo !== 'rio' ? `un-fluxo un-fluxo--${l.tipo}` : undefined}
              style={!parado && l.tipo !== 'rio' ? { animationDuration: `${duracaoFluxo(e.passo, q).toFixed(2)}s` } : undefined}
            />
            {!parado && l.tipo === 'rio' && (
              <polyline
                points={pontos}
                fill="none"
                stroke="#e9f6ff"
                strokeWidth={1.6}
                strokeDasharray={e.fluxo}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.75}
                className="un-fluxo un-fluxo--rio"
                style={{ animationDuration: `${duracaoFluxo(e.passo, q).toFixed(2)}s` }}
              />
            )}
            {setas.map((s, j) => (
              <polygon key={j} points="4,0 -6,-5.5 -3,0 -6,5.5" className="um-seta" fill={l.tipo === 'rio' ? '#fff' : e.cor} transform={`translate(${s.p[0].toFixed(1)} ${s.p[1].toFixed(1)}) rotate(${s.ang.toFixed(0)})`} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------- desenho

const Conteudo = memo(function Conteudo({
  d,
  esc,
  s,
  valores,
  data,
  modo,
  destaque,
  aoEscolher,
}: {
  d: Diagrama;
  esc: Escala;
  s: number;
  valores: ValoresSsd;
  data: string;
  modo: Modo;
  destaque?: number | null;
  aoEscolher?: (space: number) => void;
}) {
  const { lugares, guias, textos } = useMemo(() => montar(d, esc, s, valores, data, modo), [d, esc, s, valores, data, modo]);
  // vazão de um ponto (EEAB, UHE): a dele ou a da ligação que começa ou termina nele no esquema (gira o rotor)
  const vazaoNo = (n: Exclude<No, { tipo: 'reservatorio' }>) =>
    n.valor
      ? valorDe(valores, n.valor)
      : valorDe(valores, d.ligacoes.find((l) => l.valor && [l.pontos[0], l.pontos.at(-1)].some((p) => p && Math.hypot(p[0] - n.x, p[1] - n.y) < 24))?.valor);
  return (
    <>
      <Linhas d={d} esc={esc} valores={valores} />
      {/* do ponto real ao símbolo que saiu do lugar */}
      {guias.map(([a, b], i) => (
        <g key={i} className="um-guia">
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
          <circle cx={a[0]} cy={a[1]} r={5} />
        </g>
      ))}
      {textos.map((t) => {
        let y = t.y;
        return (
          <g key={t.chave} className="um-texto">
            {t.linhas.map((l, i) => {
              y += t.s * altura(l);
              return (
                <text key={i} x={t.x} y={y - t.s * l.tam * 0.3} fill={l.cor} fontSize={t.s * l.tam} fontWeight={l.peso} fontStyle={l.italico ? 'italic' : undefined}>
                  {l.t}
                </text>
              );
            })}
          </g>
        );
      })}
      {d.nos.map((n, i) => {
        const [x, y] = lugares[i]!;
        const aqui = { ...n, x: 0, y: 0 };
        return (
          <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})`}>
            {aqui.tipo === 'reservatorio' ? (
              <Reservatorio n={aqui} valores={valores} data={data} modo={modo} ativo={destaque === aqui.space} aoEscolher={aoEscolher} />
            ) : (
              <Ponto n={aqui} valores={valores} data={data} modo={modo} vazao={aqui.tipo === 'eeab' || aqui.tipo === 'uhe' ? vazaoNo(n as typeof aqui) : null} />
            )}
          </g>
        );
      })}
      {(d.radares ?? []).map((r, k) => {
        const [x, y] = lugares[d.nos.length + k]!;
        return (
          <g key={r.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})`}>
            <PontoRadar r={{ ...r, x: 0, y: 0 }} valores={valores} data={data} modo={modo} />
          </g>
        );
      })}
    </>
  );
});

/** O desenho sobre o mapa no zoom f (2^zoom), deslocado t px (onde o mapa está na tela); s: px por unidade do esquema. */
export function DesenhoNoMapa({
  d,
  plano,
  f,
  t,
  s,
  valores,
  data,
  modo,
  destaque,
  aoEscolher,
}: {
  d: Diagrama;
  plano: PlanoMapa;
  f: number;
  t: Pt;
  s: number;
  valores: ValoresSsd;
  data: string;
  modo: Modo;
  destaque?: number | null;
  aoEscolher?: (space: number) => void;
}) {
  const esc = useMemo(() => plano.naEscala(f), [plano, f]);
  return (
    <svg className="um-svg" role="img" aria-label={`Diagrama unifilar sobre o mapa — ${d.titulo}`}>
      {/* a água das represas (o mesmo degradê do esquema, unifilar.tsx: só um dos dois fica na página) */}
      <defs>
        <linearGradient id="un-agua" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fc3f7" />
          <stop offset="1" stopColor="#0b5fbf" />
        </linearGradient>
      </defs>
      <g transform={`translate(${(t[0] + esc.origem[0]).toFixed(1)} ${(t[1] + esc.origem[1]).toFixed(1)})`}>
        <Conteudo d={d} esc={esc} s={s} valores={valores} data={data} modo={modo} destaque={destaque} aoEscolher={aoEscolher} />
      </g>
    </svg>
  );
}
