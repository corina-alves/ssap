import type { Diagrama, No } from '@/conteudo/diagramas-unifilares';

/**
 * Diagrama unifilar sobre o mapa, no lugar real (o desenho em si é o
 * desenho-mapa.tsx). Cada nó com `ll` fica na coordenada dele; os rios seguem o
 * traçado da hidrografia (hidrografia-sistemas.json) entre esses pontos, no
 * sentido da água; túneis e adutoras vão em linha reta, passando pelos pontos
 * `mapa.via` da ligação. O que não tem coordenada se encaixa:
 *   - posto, junção ou ponto sobre uma ligação: no ponto proporcional do
 *     trecho entre os vizinhos com coordenada;
 *   - ponta solta de rio (entrada ou saída do desenho): um trecho do próprio
 *     rio, rio acima ou rio abaixo; sem rio por perto, reta na direção do esquema;
 *   - nó solto (ETA, cidade): junto do nó com coordenada mais perto no esquema.
 * Tudo é calculado uma vez, em px do mundo no zoom 0 (o Web Mercator do
 * Leaflet); `naEscala` dá as posições em px num zoom. Os símbolos do esquema
 * vão no ponto real (`afastar` tira um de cima do outro) e `arrumarCartoes`
 * acerta valores e nomes para não se cobrirem.
 */

export type Pt = [number, number];
type LL = [number, number];

/** Rio da hidrografia de um sistema: nome e trechos em [lon, lat]. */
export type Rio = { n: string; c: [number, number][][] };
/** Espelho d'água (represa) da hidrografia: anéis em [lon, lat]. */
export type Agua = { n: string; c: [number, number][][] };

/** Lugar na linha: ponto, direção da água ali, de que lado dela (+1/-1) o texto fica no esquema e o afastamento dele no esquema ([ao longo, de lado], unidades). */
export type NaLinha = { p: Pt; d: Pt; lado: number; o: Pt };

/**
 * O desenho num zoom (f = 2^zoom): tudo em px, relativo a `origem` (para os números do
 * SVG ficarem pequenos); na tela, o ponto q fica em q + origem + t (t: deslocamento do mapa).
 */
export type Escala = {
  f: number;
  origem: Pt;
  /** ponto real de cada nó */
  nos: Pt[];
  /** traçado de cada ligação, no sentido da água */
  linhas: Pt[][];
  /** por ligação: onde ficam o valor e o rótulo dela */
  valores: (NaLinha | null)[];
  rotulos: (NaLinha | null)[];
  /** valores avulsos (Diagrama.valores) e textos avulsos (os que valem no mapa) */
  avulsos: NaLinha[];
  textos: { texto: string; em: NaLinha }[];
};

export type PlanoMapa = {
  /** caixa do desenho todo no mundo (zoom 0): x0, y0, x1, y1 */
  caixa: [number, number, number, number];
  naEscala: (f: number) => Escala;
};

/** Web Mercator do Leaflet (EPSG:3857) em px do mundo no zoom 0: o mesmo que `map.project(ll, 0)`. */
export function noMundo([lat, lon]: LL): Pt {
  const r = Math.PI / 180;
  const y = Math.max(-85.0511287798, Math.min(85.0511287798, lat)) * r;
  return [128 + (128 / Math.PI) * lon * r, 128 - (128 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + y / 2))];
}

// até onde uma ponta de ligação fica presa ao nó, no esquema: reservatório (barragem, bacia e portas) e demais símbolos
const PRESO_RES = { dx: 95, dy: 75 };
const PRESO_PONTO = 45;
const SOBRE_TRECHO = 3;
// rótulo mais longe que isso da ligação mais perto (no esquema) não segue nenhuma
const PERTO_ROTULO = 40;
// ponto até essa distância de um rio da hidrografia está nele (m)
const NO_RIO_M = 1500;
// afluente: chega ao rio principal quando passa a essa distância dele (m)
const CONFLUENCIA_M = 500;
// rio da hidrografia que acaba antes do principal: até essa distância, completa em linha reta (m)
const CONFLUENCIA_MAX_M = 8000;
// ponta solta: comprimento, em fração do tamanho do sistema no mapa (e no mínimo, em m)
const PONTA = 0.12;
const PONTA_MIN_M = 1500;
// ponta solta de rio: o rio com o nome do rótulo vale até essa distância (m)
const MESMO_NOME_M = 20000;
// represa: o espelho d'água dela é o que estiver a até essa distância da barragem (m)
const ESPELHO_M = 1500;

export type Caixa = [number, number, number, number];

/**
 * Caixa do símbolo do nó com o nome e o valor (unidades do esquema, relativa ao
 * centro), como em Reservatorio e Ponto (simbolos-unifilar.tsx).
 */
export function caixaComNome(n: No): Caixa {
  const lado = n.rotulo ?? 'acima';
  if (n.tipo === 'reservatorio') {
    const nome = Math.max(n.nome.length * 9.6, (n.prefixo ?? 'Represa').length * 6.2) + 100;
    if (lado === 'abaixo') return [-72, -28, Math.max(78, -52 + nome), 56];
    if (lado === 'direita') return [-72, -28, 96 + nome, 20];
    if (lado === 'esquerda') return [-88 - nome, -28, 78, 20];
    return [-72, -64, Math.max(78, -52 + nome), 22];
  }
  const raio = n.tipo === 'eta' || n.tipo === 'cidade' ? 24 : n.tipo === 'eeab' || n.tipo === 'uhe' ? 18 : 12;
  const meio = Math.max(raio, Math.max(n.nome.length * 7.8, (n.prefixo ?? '').length * 6.2) / 2);
  const c: Caixa =
    lado === 'abaixo'
      ? [-meio, -raio, meio, raio + 34]
      : lado === 'direita'
        ? [-raio, -raio, raio + 6 + 2 * meio, Math.max(raio, 18)]
        : lado === 'esquerda'
          ? [-raio - 6 - 2 * meio, -raio, raio, Math.max(raio, 18)]
          : [-meio, -raio - 34, meio, raio];
  if (!n.valor) return c;
  // o valor (vazão), em (dx, dy): uns 9 caracteres de 15 px
  const w = 80;
  const x0 = n.valor.ancora === 'start' ? n.valor.dx : n.valor.ancora === 'end' ? n.valor.dx - w : n.valor.dx - w / 2;
  return [Math.min(c[0], x0), Math.min(c[1], n.valor.dy - 15), Math.max(c[2], x0 + w), Math.max(c[3], n.valor.dy + 4)];
}

// afastamento máximo de um símbolo do ponto real (px) e folga entre símbolos vizinhos
const MAX_AFASTAR = 170;
const FOLGA_SIMBOLOS = 6;

/** Afasta os símbolos que se cobririam (px), pelo eixo de menor sobreposição, no máximo MAX_AFASTAR do ponto real. */
export function afastar(reais: Pt[], caixas: Caixa[], s: number): Pt[] {
  const p = reais.map((q): Pt => [q[0], q[1]]);
  for (let volta = 0; volta < 60; volta++) {
    let mexeu = false;
    for (let a = 0; a < p.length; a++)
      for (let b = a + 1; b < p.length; b++) {
        const [A, B, pa, pb] = [caixas[a]!, caixas[b]!, p[a]!, p[b]!];
        const ox = Math.min(pa[0] + s * A[2], pb[0] + s * B[2]) - Math.max(pa[0] + s * A[0], pb[0] + s * B[0]) + FOLGA_SIMBOLOS;
        const oy = Math.min(pa[1] + s * A[3], pb[1] + s * B[3]) - Math.max(pa[1] + s * A[1], pb[1] + s * B[1]) + FOLGA_SIMBOLOS;
        if (ox <= 0 || oy <= 0) continue;
        mexeu = true;
        const eixo = ox < oy ? 0 : 1;
        const centro = (q: Pt, C: Caixa) => q[eixo] + (s * (C[eixo]! + C[eixo + 2]!)) / 2;
        const lado = centro(pa, A) <= centro(pb, B) ? -1 : 1;
        const passo = (eixo ? oy : ox) / 2;
        pa[eixo] += lado * passo;
        pb[eixo] -= lado * passo;
      }
    p.forEach((q, i) => {
      const [x0, y0] = reais[i]!;
      const dd = Math.hypot(q[0] - x0, q[1] - y0);
      if (dd > MAX_AFASTAR) [q[0], q[1]] = [x0 + ((q[0] - x0) * MAX_AFASTAR) / dd, y0 + ((q[1] - y0) * MAX_AFASTAR) / dd];
    });
    if (!mexeu) break;
  }
  return p;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (v: Pt): Pt => {
  const c = Math.hypot(v[0], v[1]);
  return c ? [v[0] / c, v[1] / c] : [1, 0];
};
const media = (ps: Pt[]): Pt => [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
const espalho = (ps: Pt[]) => {
  const [mx, my] = media(ps);
  return Math.sqrt(ps.reduce((a, p) => a + (p[0] - mx) ** 2 + (p[1] - my) ** 2, 0));
};

/** Comprimento acumulado até cada ponto da linha. */
function acumulado(ps: Pt[]): number[] {
  const a = [0];
  for (let i = 1; i < ps.length; i++) a.push(a[i - 1]! + dist(ps[i - 1]!, ps[i]!));
  return a;
}
const comprimento = (ps: Pt[]) => acumulado(ps).at(-1) ?? 0;

/** Ponto do trecho a–b mais perto de p e a fração dele no trecho. */
function projetar(p: Pt, a: Pt, b: Pt): { q: Pt; t: number } {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const c2 = vx * vx + vy * vy;
  const t = c2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / c2)) : 0;
  return { q: [a[0] + vx * t, a[1] + vy * t], t };
}

/** Ponto mais perto de p na linha: trecho, fração, ponto e distância. */
function maisPerto(p: Pt, pontos: Pt[]) {
  let melhor = { j: 0, t: 0, d: Infinity, q: pontos[0]! as Pt };
  for (let j = 0; j < pontos.length - 1; j++) {
    const { q, t } = projetar(p, pontos[j]!, pontos[j + 1]!);
    const d = dist(p, q);
    if (d < melhor.d) melhor = { j, t, d, q };
  }
  return melhor;
}

/** p dentro do anel (polígono), pela regra par-ímpar. */
function dentro(p: Pt, anel: Pt[]): boolean {
  let r = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [a, b] = [anel[i]!, anel[j]!];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) r = !r;
  }
  return r;
}

/** Ponto a uma distância λ do começo da linha e a direção (unitária) ali. */
function aoLongo(ps: Pt[], lambda: number): { p: Pt; d: Pt } {
  let resto = Math.max(0, lambda);
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1]!;
    const b = ps[i]!;
    const c = dist(a, b);
    if (resto <= c || i === ps.length - 1) {
      const t = c ? Math.min(1, resto / c) : 0;
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], d: unit([b[0] - a[0], b[1] - a[1]]) };
    }
    resto -= c;
  }
  return { p: ps[0]!, d: [1, 0] };
}

/** Trecho de rio no mundo: pontos, comprimento acumulado e sentido da água (+1: na ordem dos pontos). */
type Parte = { n: string; pts: Pt[]; acum: number[]; sentido: number };

/** Posição de p na parte (distância desde o primeiro ponto) e a distância até ela. */
function naParte(pa: Parte, p: Pt) {
  const m = maisPerto(p, pa.pts);
  return { u: pa.acum[m.j]! + m.t * (pa.acum[m.j + 1]! - pa.acum[m.j]!), d: m.d };
}

/** Pedaço da parte entre as posições u0 e u1, de u0 para u1. */
function pedaco(pa: Parte, u0: number, u1: number): Pt[] {
  const [a, b] = u0 <= u1 ? [u0, u1] : [u1, u0];
  const pts: Pt[] = [aoLongo(pa.pts, a).p, ...pa.pts.filter((_, i) => pa.acum[i]! > a && pa.acum[i]! < b), aoLongo(pa.pts, b).p];
  return u0 <= u1 ? pts : pts.reverse();
}

/** Nome de rio sem acento, "rio", "ribeirão", preposições e pontuação: para comparar nomes. */
export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(rio|ribeirao|rib|res|represa|da|do|de|das|dos)\b\.?/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim();

/** `res`: nó (represa) de onde a ligação sai ou aonde chega */
type Ancora = { a: number; p: Pt; res?: number };
type Caminho = { pts: Pt[]; marcas: { a: number; lambda: number }[] };
/** Texto junto de uma ligação: posição `a` nela (esquema) e afastamento [ao longo, de lado] no sentido dela. */
type Junto = { l: number; a: number; o: Pt };

export function planoNoMapa(d: Diagrama, rios: Rio[] = [], aguas: Agua[] = []): PlanoMapa {
  // ------------------------------------------------------------ esquema
  const presoA = (v: Pt): number | null => {
    let melhor: number | null = null;
    let dm = Infinity;
    d.nos.forEach((n, i) => {
      const dx = v[0] - n.x;
      const dy = v[1] - n.y;
      const dentro = n.tipo === 'reservatorio' ? Math.abs(dx) <= PRESO_RES.dx && Math.abs(dy) <= PRESO_RES.dy : Math.hypot(dx, dy) <= PRESO_PONTO;
      if (dentro && Math.hypot(dx, dy) < dm) [melhor, dm] = [i, Math.hypot(dx, dy)];
    });
    return melhor;
  };
  const presos = d.ligacoes.map((l) => l.pontos.map((v) => presoA(v)));
  const arcos = d.ligacoes.map((l) => acumulado(l.pontos));
  /** ponto da ligação l (esquema) mais perto de p: posição `a`, distância, trecho e ponto */
  const arcoEm = (l: number, p: Pt) => {
    const m = maisPerto(p, d.ligacoes[l]!.pontos);
    const ac = arcos[l]!;
    return { a: ac[m.j]! + m.t * (ac[m.j + 1]! - ac[m.j]!), d: m.d, j: m.j, q: m.q };
  };
  // ponto sobre outra ligação (posto, junção de rios): qual e onde
  const sobre = (p: Pt, pular: (l: number) => boolean): { l: number; a: number } | null => {
    for (let l = 0; l < d.ligacoes.length; l++) {
      if (pular(l)) continue;
      const m = arcoEm(l, p);
      if (m.d <= SOBRE_TRECHO) return { l, a: m.a };
    }
    return null;
  };
  const noSobre = d.nos.map((n, i) => (n.tipo === 'reservatorio' ? null : sobre([n.x, n.y], (l) => presos[l]!.includes(i))));
  const vertSobre = d.ligacoes.map((lg, l) => lg.pontos.map((v, j) => (presos[l]![j] == null ? sobre(v, (x) => x === l) : null)));

  // ------------------------------------------------------------ escala do mundo
  const comLL = d.nos.flatMap((n, i) => (n.ll ? [i] : []));
  const esqLL = comLL.map((i): Pt => [d.nos[i]!.x, d.nos[i]!.y]);
  const mundoLL = comLL.map((i) => noMundo(d.nos[i]!.ll!));
  const latRef = comLL.length ? comLL.reduce((a, i) => a + d.nos[i]!.ll![0], 0) / comLL.length : -23.5;
  const W = (m: number) => (m * 256) / (2 * Math.PI * 6378137 * Math.cos((latRef * Math.PI) / 180)); // metros → px do mundo
  // esquema → mundo, para o que não tem coordenada (pelo espalhamento dos nós com coordenada)
  const sigma = comLL.length >= 2 && espalho(esqLL) > 0 && espalho(mundoLL) > 0 ? espalho(mundoLL) / espalho(esqLL) : W(25000) / d.largura;
  /** junto do nó com coordenada mais perto no esquema, no mesmo afastamento (escalado) */
  const pertoDeAncora = (p: Pt): Pt => {
    if (!comLL.length) return [p[0] * sigma, p[1] * sigma];
    let k = 0;
    esqLL.forEach((q, c) => {
      if (dist(p, q) < dist(p, esqLL[k]!)) k = c;
    });
    return [mundoLL[k]![0] + sigma * (p[0] - esqLL[k]![0]), mundoLL[k]![1] + sigma * (p[1] - esqLL[k]![1])];
  };
  const tamanho =
    mundoLL.length >= 2
      ? Math.hypot(Math.max(...mundoLL.map((p) => p[0])) - Math.min(...mundoLL.map((p) => p[0])), Math.max(...mundoLL.map((p) => p[1])) - Math.min(...mundoLL.map((p) => p[1])))
      : sigma * d.largura;
  const ponta = Math.max(W(PONTA_MIN_M), PONTA * tamanho);
  const perto = W(NO_RIO_M);

  // ------------------------------------------------------------ rios
  const partes: Parte[] = rios.flatMap((r) =>
    r.c.map((c) => {
      const pts = c.map(([lon, lat]) => noMundo([lat, lon]));
      return { n: r.n, pts, acum: acumulado(pts), sentido: 0 };
    }),
  );
  // sentido da água em cada parte: pelos pontos com coordenada das ligações de rio, na ordem delas
  d.ligacoes.forEach((lg, l) => {
    if (lg.tipo !== 'rio') return;
    const conhecidos: Ancora[] = [];
    lg.pontos.forEach((_, j) => {
      const i = presos[l]![j];
      if (i != null && d.nos[i]!.ll) conhecidos.push({ a: arcos[l]![j]!, p: noMundo(d.nos[i]!.ll!) });
    });
    d.nos.forEach((n, i) => {
      if (n.ll && noSobre[i]?.l === l) conhecidos.push({ a: noSobre[i]!.a, p: noMundo(n.ll) });
    });
    if (lg.mapa?.inicio) conhecidos.push({ a: -Infinity, p: noMundo(lg.mapa.inicio) });
    if (lg.mapa?.fim) conhecidos.push({ a: Infinity, p: noMundo(lg.mapa.fim) });
    conhecidos.sort((x, y) => x.a - y.a);
    for (let k = 1; k < conhecidos.length; k++)
      for (const pa of partes) {
        const [x, y] = [naParte(pa, conhecidos[k - 1]!.p), naParte(pa, conhecidos[k]!.p)];
        if (x.d <= perto && y.d <= perto && x.u !== y.u) pa.sentido += Math.sign(y.u - x.u);
      }
  });
  for (const pa of partes) pa.sentido = pa.sentido < 0 ? -1 : 1; // sem pista: na ordem dos pontos

  // espelho d'água de cada represa (o que contém a barragem ou passa mais perto dela)
  const espelhos: Pt[][][] = aguas.map((a) => a.c.map((anel) => anel.map(([lon, lat]) => noMundo([lat, lon]))));
  const espelhoDe = new Map<number, Pt[][]>();
  d.nos.forEach((n, i) => {
    if (n.tipo !== 'reservatorio' || !n.ll) return;
    const b = noMundo(n.ll);
    let melhor: { e: Pt[][]; d: number } | null = null;
    for (const e of espelhos) {
      const dd = dentro(b, e[0]!) ? 0 : Math.min(...e.map((anel) => maisPerto(b, anel).d));
      if (dd <= W(ESPELHO_M) && (!melhor || dd < melhor.d)) melhor = { e, d: dd };
    }
    if (melhor) espelhoDe.set(i, melhor.e);
  });
  /** ponto da margem da represa (nó i) mais perto de p */
  const naMargem = (i: number, p: Pt): Pt | null => {
    const e = espelhoDe.get(i);
    if (!e) return null;
    let melhor: { q: Pt; d: number } | null = null;
    for (const anel of e) {
      const m = maisPerto(p, anel);
      if (!melhor || m.d < melhor.d) melhor = m;
    }
    return melhor?.q ?? null;
  };

  /** De a para b pelo rio que passa perto dos dois (o mais perto); null sem um assim. */
  const peloRio = (a: Pt, b: Pt): { pts: Pt[]; parte: Parte } | null => {
    let melhor: { pts: Pt[]; parte: Parte; d: number } | null = null;
    for (const pa of partes) {
      const [x, y] = [naParte(pa, a), naParte(pa, b)];
      if (x.d > perto || y.d > perto || x.u === y.u || (melhor && x.d + y.d >= melhor.d)) continue;
      const pts = pedaco(pa, x.u, y.u);
      if (comprimento(pts) > 3 * dist(a, b) + perto) continue; // volta demais: não é esse rio
      melhor = { pts, parte: pa, d: x.d + y.d };
    }
    return melhor ? { pts: [a, ...melhor.pts, b], parte: melhor.parte } : porDoisRios(a, b);
  };

  /** De a para b por dois rios: o de a rio abaixo até desaguar no de b, e por este até b (o caminho mais curto). */
  const porDoisRios = (a: Pt, b: Pt): { pts: Pt[]; parte: Parte } | null => {
    let melhor: { pts: Pt[]; parte: Parte; comp: number } | null = null;
    for (const p1 of partes) {
      const x = naParte(p1, a);
      if (x.d > perto) continue;
      const abaixo = pedaco(p1, x.u, p1.sentido > 0 ? p1.acum.at(-1)! : 0);
      for (const p2 of partes) {
        const y = naParte(p2, b);
        if (p2 === p1 || y.d > perto) continue;
        const i = abaixo.findIndex((q, k) => k > 0 && naParte(p2, q).d <= W(CONFLUENCIA_M));
        if (i < 0) continue;
        const pts = [a, ...abaixo.slice(0, i + 1), ...pedaco(p2, naParte(p2, abaixo[i]!).u, y.u), b];
        const comp = comprimento(pts);
        if (comp <= 3 * dist(a, b) + perto && (!melhor || comp < melhor.comp)) melhor = { pts, parte: p2, comp };
      }
    }
    return melhor && { pts: melhor.pts, parte: melhor.parte };
  };

  /** Pedaço solto de rio a partir de p, rio acima (-1) ou rio abaixo (+1): o rio do trecho vizinho, o de mesmo nome ou o mais perto. */
  const pontaPeloRio = (p: Pt, rumo: 1 | -1, vizinho: Parte | null, nome: string): Pt[] | null => {
    let melhor: { pa: Parte; u: number; peso: number } | null = null;
    // o rio com o nome do rótulo, mesmo longe (rio que entra na represa longe da barragem)
    for (const pa of partes) {
      const x = naParte(pa, p);
      if (nome && normalizar(pa.n) === nome && x.d <= W(MESMO_NOME_M) && (!melhor || x.d < melhor.peso)) melhor = { pa, u: x.u, peso: x.d };
    }
    if (!melhor)
      for (const pa of partes) {
        const x = naParte(pa, p);
        if (x.d > perto) continue;
        const peso = x.d - (pa === vizinho ? 2 * perto : 0);
        if (!melhor || peso < melhor.peso) melhor = { pa, u: x.u, peso };
      }
    if (!melhor) return null;
    const { pa, u } = melhor;
    const fim = Math.max(0, Math.min(pa.acum.at(-1)!, u + rumo * pa.sentido * ponta));
    return Math.abs(fim - u) < 0.3 * ponta ? null : pedaco(pa, u, fim);
  };

  /**
   * De p rio abaixo, pelo rio que passa ali (o de mesmo nome ou o mais perto), até
   * chegar perto da ligação `outra` (o rio principal): o caminho até a confluência.
   */
  const confluencia = (p: Pt, outra: number, nome: string): Pt[] | null => {
    const principal = caminho(outra)?.pts;
    if (!principal) return null;
    let melhor: { pa: Parte; u: number; peso: number } | null = null;
    for (const pa of partes) {
      const x = naParte(pa, p);
      if (x.d > perto) continue;
      const peso = x.d - (nome && normalizar(pa.n) === nome ? perto : 0);
      if (!melhor || peso < melhor.peso) melhor = { pa, u: x.u, peso };
    }
    if (!melhor) return null;
    const { pa, u } = melhor;
    const rioAbaixo = pedaco(pa, u, pa.sentido > 0 ? pa.acum.at(-1)! : 0);
    for (let i = 1; i < rioAbaixo.length; i++) {
      const m = maisPerto(rioAbaixo[i]!, principal);
      if (m.d <= W(CONFLUENCIA_M)) return [p, ...rioAbaixo.slice(0, i), m.q];
    }
    // o rio da hidrografia acaba antes: do fim dele, reto até o principal (se ficou mais perto e não é longe)
    const fim = maisPerto(rioAbaixo.at(-1)!, principal);
    return fim.d <= W(CONFLUENCIA_MAX_M) && fim.d < maisPerto(p, principal).d ? [p, ...rioAbaixo, fim.q] : null;
  };

  // ------------------------------------------------------------ posições no mundo (com memória e proteção contra ciclo)
  const memoNo = new Map<number, Pt | null>();
  const posNo = (i: number): Pt => {
    const n = d.nos[i]!;
    if (memoNo.has(i)) return memoNo.get(i) ?? pertoDeAncora([n.x, n.y]);
    memoNo.set(i, null);
    const s = noSobre[i];
    const p = n.ll ? noMundo(n.ll) : ((s && naLigacao(s.l, s.a)) ?? pertoDeAncora([n.x, n.y]));
    memoNo.set(i, p);
    return p;
  };

  const lambdaDe = (c: Caminho, a: number) => {
    const m = c.marcas;
    if (a <= m[0]!.a) return m[0]!.lambda;
    for (let k = 1; k < m.length; k++) {
      const [x, y] = [m[k - 1]!, m[k]!];
      if (a <= y.a) return y.a > x.a ? x.lambda + ((a - x.a) / (y.a - x.a)) * (y.lambda - x.lambda) : y.lambda;
    }
    return m.at(-1)!.lambda;
  };
  const memoLig = new Map<number, Caminho | null>();
  const caminho = (l: number): Caminho | null => {
    if (memoLig.has(l)) return memoLig.get(l) ?? null;
    memoLig.set(l, null);
    const c = montar(l);
    memoLig.set(l, c);
    return c;
  };
  /** ponto da ligação l na posição a do esquema (null enquanto ela está sendo montada: ciclo) */
  const naLigacao = (l: number, a: number): Pt | null => {
    const c = caminho(l);
    return c && aoLongo(c.pts, lambdaDe(c, a)).p;
  };

  const montar = (l: number): Caminho => {
    const lg = d.ligacoes[l]!;
    const ultimoJ = lg.pontos.length - 1;
    const nome = normalizar(lg.rotulo?.texto ?? '');
    // âncoras (o que tem lugar no mapa): pontas presas a nós, pontas com coordenada,
    // pontas sobre outra ligação e nós com coordenada sobre esta
    const itens: { a: number; pos: () => Pt | null; res?: number }[] = [];
    let soltoInicio = false;
    let soltoFim = false;
    // rio que deságua em outra ligação: a ponta vai para a confluência real (pelo próprio rio)
    let desague: { l: number; a: number; aqui: number } | null = null;
    for (let j = 0; j <= ultimoJ; j++) {
      const a = arcos[l]![j]!;
      const i = presos[l]![j];
      const s = vertSobre[l]![j];
      const ll = j === 0 ? lg.mapa?.inicio : j === ultimoJ ? lg.mapa?.fim : undefined;
      if (i != null) itens.push({ a, pos: () => posNo(i), res: d.nos[i]!.tipo === 'reservatorio' ? i : undefined });
      else if (ll) itens.push({ a, pos: () => noMundo(ll) });
      else if (s && j === ultimoJ && lg.tipo === 'rio') desague = { ...s, aqui: a };
      else if (s) itens.push({ a, pos: () => naLigacao(s.l, s.a) });
      else if (j === 0) soltoInicio = true;
      else if (j === ultimoJ) soltoFim = true;
    }
    d.nos.forEach((n, i) => {
      if (n.ll && noSobre[i]?.l === l) itens.push({ a: noSobre[i]!.a, pos: () => noMundo(n.ll!) });
    });
    itens.sort((x, y) => x.a - y.a);
    const ancoras = itens.flatMap((x): Ancora[] => {
      const p = x.pos();
      return p ? [{ a: x.a, p, res: x.res }] : [];
    });
    let ateConfluencia: Pt[] | null = null;
    if (desague) {
      ateConfluencia = ancoras.length ? confluencia(ancoras.at(-1)!.p, desague.l, nome) : null;
      // sem achar a confluência pelo rio: o ponto proporcional da outra ligação
      const p = ateConfluencia?.at(-1) ?? naLigacao(desague.l, desague.a);
      if (p) ancoras.push({ a: desague.aqui, p });
    }
    if (!ancoras.length) {
      // nada com lugar no mapa: o desenho do esquema junto do nó com coordenada mais perto
      const pts = lg.pontos.map((v) => pertoDeAncora(v));
      const ac = acumulado(pts);
      return { pts, marcas: lg.pontos.map((_, j) => ({ a: arcos[l]![j]!, lambda: ac[j]! })) };
    }

    // entre âncoras: pelo rio (ligação de rio) ou em linha reta, passando pelos pontos `via`
    const via = (lg.mapa?.via ?? []).map((x) => noMundo(x));
    // túnel e adutora saem da represa (e chegam a ela) pela margem mais perto do outro lado, não pela barragem
    if (lg.tipo !== 'rio' && ancoras.length >= 2) {
      const [ini, fim] = [ancoras[0]!, ancoras.at(-1)!];
      if (ini.res != null) ini.p = naMargem(ini.res, via[0] ?? ancoras[1]!.p) ?? ini.p;
      if (fim.res != null) fim.p = naMargem(fim.res, ancoras.length === 2 && via.length ? via.at(-1)! : ancoras.at(-2)!.p) ?? fim.p;
    }
    let pts: Pt[] = [ancoras[0]!.p];
    const marcas = [{ a: ancoras[0]!.a, lambda: 0 }];
    let rioVizinho: Parte | null = null;
    for (let k = 1; k < ancoras.length; k++) {
      const [a, b] = [ancoras[k - 1]!.p, ancoras[k]!.p];
      const r = k === ancoras.length - 1 && ateConfluencia ? { pts: ateConfluencia, parte: null } : lg.tipo === 'rio' ? peloRio(a, b) : null;
      rioVizinho = r?.parte ?? rioVizinho;
      pts = [...pts, ...(r ? r.pts : k === 1 ? [a, ...via, b] : [a, b]).slice(1)];
      marcas.push({ a: ancoras[k]!.a, lambda: comprimento(pts) });
    }

    // pontas soltas: antes da primeira âncora (água chegando) e depois da última (água saindo)
    const solta = (rumo: 1 | -1, de: Ancora, j: number): Pt[] => {
      if (ancoras.length === 1 && via.length) return rumo > 0 ? via : [...via].reverse();
      const pelo = lg.tipo === 'rio' ? pontaPeloRio(de.p, rumo, rioVizinho, nome) : null;
      if (pelo) return pelo;
      // sem rio: reta na direção do esquema, da âncora para a ponta
      const v = lg.pontos[j]!;
      const q = aoLongo(lg.pontos, de.a).p;
      const u = unit([v[0] - q[0], v[1] - q[1]]);
      return [[de.p[0] + u[0] * ponta, de.p[1] + u[1] * ponta]];
    };
    if (soltoInicio) {
      const antes = solta(-1, ancoras[0]!, 0).reverse();
      const extra = comprimento([...antes, ancoras[0]!.p]);
      pts = [...antes, ...pts];
      for (const m of marcas) m.lambda += extra;
      marcas.unshift({ a: 0, lambda: 0 });
    }
    if (soltoFim) {
      pts = [...pts, ...solta(1, ancoras.at(-1)!, ultimoJ)];
      marcas.push({ a: arcos[l]!.at(-1)!, lambda: comprimento(pts) });
    }
    return { pts, marcas };
  };

  // ------------------------------------------------------------ rótulos e valores
  const junto = (p: Pt, so?: number): Junto | null => {
    let melhor: { l: number; m: ReturnType<typeof arcoEm> } | null = null;
    for (let l = 0; l < d.ligacoes.length; l++) {
      if (so !== undefined && l !== so) continue;
      const m = arcoEm(l, p);
      if (!melhor || m.d < melhor.m.d) melhor = { l, m };
    }
    if (!melhor || melhor.m.d > PERTO_ROTULO) return null;
    const pts = d.ligacoes[melhor.l]!.pontos;
    const [a, b] = [pts[melhor.m.j]!, pts[melhor.m.j + 1]!];
    const u = unit([b[0] - a[0], b[1] - a[1]]);
    const o: Pt = [p[0] - melhor.m.q[0], p[1] - melhor.m.q[1]];
    return { l: melhor.l, a: melhor.m.a, o: [o[0] * u[0] + o[1] * u[1], -o[0] * u[1] + o[1] * u[0]] };
  };
  const textos = (d.textos ?? []).filter((t) => !t.semMapa);
  const juntos = {
    ligacoes: d.ligacoes.map((lg, l) => ({
      valor: lg.valor ? { j: junto([lg.valor.x, lg.valor.y], l), solto: pertoDeAncora([lg.valor.x, lg.valor.y]) } : null,
      rotulo: lg.rotulo ? { j: junto([lg.rotulo.x, lg.rotulo.y], l), solto: pertoDeAncora([lg.rotulo.x, lg.rotulo.y]) } : null,
    })),
    valores: (d.valores ?? []).map((v) => ({ j: junto([v.x, v.y]), solto: pertoDeAncora([v.x, v.y]) })),
    textos: textos.map((t) => ({ j: junto([t.x, t.y]), solto: pertoDeAncora([t.x, t.y]) })),
  };

  // tudo no mundo, uma vez
  const nosMundo = d.nos.map((_, i) => posNo(i));
  const ligMundo = d.ligacoes.map((_, l) => caminho(l)!);
  const todos = [...nosMundo, ...ligMundo.flatMap((c) => c.pts)];
  const caixa: PlanoMapa['caixa'] = [Math.min(...todos.map((p) => p[0])), Math.min(...todos.map((p) => p[1])), Math.max(...todos.map((p) => p[0])), Math.max(...todos.map((p) => p[1]))];

  return {
    caixa,
    naEscala(f) {
      const origem: Pt = [caixa[0] * f, caixa[1] * f];
      const px = (p: Pt): Pt => [p[0] * f - origem[0], p[1] * f - origem[1]];
      const linhas = ligMundo.map((c) => c.pts.map(px));
      const lugar = (x: { j: Junto | null; solto: Pt }): NaLinha => {
        if (!x.j) return { p: px(x.solto), d: [1, 0], lado: 1, o: [0, 0] };
        const { l, a, o } = x.j;
        const { p, d: u } = aoLongo(linhas[l]!, lambdaDe(ligMundo[l]!, a) * f);
        return { p, d: u, lado: o[1] < 0 ? -1 : 1, o };
      };
      return {
        f,
        origem,
        nos: nosMundo.map(px),
        linhas,
        valores: juntos.ligacoes.map((j) => j.valor && lugar(j.valor)),
        rotulos: juntos.ligacoes.map((j) => j.rotulo && lugar(j.rotulo)),
        avulsos: juntos.valores.map(lugar),
        textos: textos.map((t, i) => ({ texto: t.texto, em: lugar(juntos.textos[i]!) })),
      };
    },
  };
}

// ------------------------------------------------------------------ cartões

/**
 * Texto a pôr no mapa: o ponto dele (px), o tamanho, o lugar preferido (canto
 * superior esquerdo, tentado antes de tudo) e se pode ir longe do ponto.
 */
export type ItemCartao = { p: Pt; w: number; h: number; longe?: boolean; pref?: Pt };

// distância do cartão ao ponto (px) em cada volta de tentativas, e o custo de ir para a volta seguinte
const VOLTAS = [8, 30, 60, 100];
const CUSTO_VOLTA = 70;
// direções, na ordem de preferência: acima à direita, acima à esquerda, à direita, abaixo à direita…
const RUMOS: Pt[] = [
  [1, -1],
  [-1, -1],
  [1, 0],
  [0, -1],
  [1, 1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const LADO_GRADE = 24;

/**
 * Onde vai cada texto (canto superior esquerdo, px): no lugar preferido ou perto
 * do ponto dele, sem cobrir os já postos, os `fixos` (x, y, w, h: os símbolos),
 * os pontos dos outros e, se der, as linhas. Os primeiros escolhem antes. Só
 * depende das posições relativas: arrastar o mapa não mexe neles.
 */
export function arrumarCartoes(itens: ItemCartao[], pontos: Pt[], linhas: Pt[][], fixos: [number, number, number, number][] = []): Pt[] {
  // amostras das linhas (a cada ~8 px), contadas numa grade
  const grade = new Map<string, Pt[]>();
  for (const ps of linhas)
    for (let i = 1; i < ps.length; i++) {
      const [a, b] = [ps[i - 1]!, ps[i]!];
      const n = Math.max(1, Math.ceil(dist(a, b) / 8));
      for (let k = 0; k < n; k++) {
        const q: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        const c = `${Math.floor(q[0] / LADO_GRADE)},${Math.floor(q[1] / LADO_GRADE)}`;
        const lista = grade.get(c);
        if (lista) lista.push(q);
        else grade.set(c, [q]);
      }
    }
  const naLinha = (x: number, y: number, w: number, h: number) => {
    let n = 0;
    for (let i = Math.floor(x / LADO_GRADE); i <= Math.floor((x + w) / LADO_GRADE); i++)
      for (let j = Math.floor(y / LADO_GRADE); j <= Math.floor((y + h) / LADO_GRADE); j++)
        for (const q of grade.get(`${i},${j}`) ?? []) if (q[0] > x && q[0] < x + w && q[1] > y && q[1] < y + h) n++;
    return n;
  };
  const postos: [number, number, number, number][] = [...fixos];
  return itens.map((it) => {
    let melhor: Pt = it.pref ?? [it.p[0] + VOLTAS[0]!, it.p[1] - VOLTAS[0]! - it.h];
    let custoMelhor = Infinity;
    const voltas = it.longe === false ? VOLTAS.slice(0, 2) : VOLTAS;
    // candidatos: o lugar preferido (sem custo) e as voltas em torno do ponto
    const candidatos: [number, number, number][] = it.pref ? [[it.pref[0], it.pref[1], 0]] : [];
    voltas.forEach((g, v) =>
      RUMOS.forEach(([rx, ry], r) => {
        const x = rx > 0 ? it.p[0] + g : rx < 0 ? it.p[0] - g - it.w : it.p[0] - it.w / 2;
        const y = ry > 0 ? it.p[1] + g : ry < 0 ? it.p[1] - g - it.h : it.p[1] - it.h / 2;
        candidatos.push([x, y, (it.pref ? 20 : 0) + v * CUSTO_VOLTA + r * 3]);
      }),
    );
    for (const [x, y, base] of candidatos) {
      {
        let custo = base;
        for (const [px, py, pw, ph] of postos) {
          const ox = Math.min(x + it.w, px + pw) - Math.max(x, px) + 4;
          const oy = Math.min(y + it.h, py + ph) - Math.max(y, py) + 4;
          if (ox > 0 && oy > 0) custo += 400 + ox * oy;
        }
        for (const q of pontos) if (q !== it.p && q[0] > x - 5 && q[0] < x + it.w + 5 && q[1] > y - 5 && q[1] < y + it.h + 5) custo += 300;
        custo += 2 * naLinha(x, y, it.w, it.h);
        if (custo < custoMelhor) [custoMelhor, melhor] = [custo, [x, y]];
      }
    }
    postos.push([melhor[0], melhor[1], it.w, it.h]);
    return melhor;
  });
}
