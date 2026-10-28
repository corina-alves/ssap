import type { Diagrama, Ligacao, No } from '@/conteudo/diagramas-unifilares';

/**
 * Diagrama unifilar sobre o mapa: os nós com coordenada (as represas) ficam no
 * ponto real e o resto do desenho acompanha os nós em volta.
 *   - ponta de ligação junto a um nó (porta da barragem, entrada da ETA) fica
 *     presa a ele, no mesmo deslocamento em pixels do desenho;
 *   - posto e junção sobre um trecho de outra ligação seguem esse trecho;
 *   - o resto (cantos, entradas na borda do desenho, nós sem coordenada) anda
 *     com a média dos nós com coordenada, pesada pela proximidade no desenho;
 *   - rótulos e valores seguem o ponto mais perto da ligação deles.
 * Os símbolos e textos têm tamanho fixo na tela (s px por unidade do desenho):
 * com zoom, só as distâncias entre as represas mudam. Represas vizinhas que se
 * cobririam (zoom afastado) são afastadas o mínimo, com uma guia até o ponto real.
 */

export type Pt = [number, number];

/** Escala dos símbolos (px por unidade do desenho) e posição na tela de cada nó com coordenada, na ordem de `controles`. */
export type Tela = { s: number; nos: Pt[] };

type Base = { k: 'ctrl'; c: number } | { k: 'no'; i: number } | { k: 'seg'; l: number; j: number; t: number } | { k: 'livre' };
/** Ponto do desenho: base que o posiciona, deslocamento fixo (unidades) e pesos dos nós com coordenada. */
type Desc = { p: Pt; base: Base; o: Pt; w: number[] };

// até onde uma ponta de ligação fica presa ao nó: reservatório (barragem, bacia e portas) e demais símbolos
const PRESO_RES = { dx: 95, dy: 75 };
const PRESO_PONTO = 45;
const SOBRE_TRECHO = 3;
// afastamento máximo de um símbolo do ponto real (px) e folga entre símbolos vizinhos
const MAX_AFASTAR = 170;
const FOLGA_SIMBOLOS = 6;

/** Caixa do símbolo de um reservatório com nome e chuva (unidades, relativa ao centro), como em Reservatorio (unifilar.tsx). */
function caixaReservatorio(n: Extract<No, { tipo: 'reservatorio' }>): [number, number, number, number] {
  const nome = Math.max(n.nome.length * 9.6, (n.prefixo ?? 'Represa').length * 6.2) + 100;
  switch (n.rotulo ?? 'acima') {
    case 'abaixo':
      return [-72, -28, Math.max(78, -52 + nome), 56];
    case 'direita':
      return [-72, -28, 96 + nome, 20];
    case 'esquerda':
      return [-88 - nome, -28, 78, 20];
    default:
      return [-72, -64, Math.max(78, -52 + nome), 22];
  }
}

/** Ponto mais perto de p na linha: trecho, fração e distância. */
function maisPerto(p: Pt, pontos: Pt[]) {
  let melhor = { j: 0, t: 0, d: Infinity, q: pontos[0]! as Pt };
  for (let j = 0; j < pontos.length - 1; j++) {
    const a = pontos[j]!;
    const b = pontos[j + 1]!;
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const c2 = vx * vx + vy * vy;
    const t = c2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / c2)) : 0;
    const q: Pt = [a[0] + vx * t, a[1] + vy * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < melhor.d) melhor = { j, t, d, q };
  }
  return melhor;
}

export type PlanoMapa = {
  /** nós com coordenada ([lat, lon]), na ordem de `Tela.nos` */
  controles: { i: number; ll: [number, number] }[];
  /** o diagrama nas unidades da tela (px / s), para o DesenhoUnifilar, e as guias (ponto real → símbolo afastado) */
  aplicar: (tela: Tela, largura: number, altura: number) => { desenho: Diagrama; guias: [Pt, Pt][] };
  /** todos os pontos do desenho na tela (para enquadrar o mapa) */
  pontos: (tela: Tela) => Pt[];
};

export function planoNoMapa(d: Diagrama): PlanoMapa {
  const controles = d.nos.flatMap((n, i) => (n.ll ? [{ i, ll: n.ll }] : []));
  const pesos = (p: Pt) => {
    const w = controles.map(({ i }) => 1 / Math.max(Math.hypot(p[0] - d.nos[i]!.x, p[1] - d.nos[i]!.y), 1) ** 3);
    const soma = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / soma);
  };
  const desc = (p: Pt, base: Base, o: Pt = [0, 0]): Desc => ({ p, base, o, w: pesos(p) });

  // pontas presas a nós
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

  // ponto sobre um trecho de outra ligação (posto, junção de rios)
  const sobreTrecho = (p: Pt, pular: (l: number) => boolean): Base | null => {
    for (let l = 0; l < d.ligacoes.length; l++) {
      if (pular(l)) continue;
      const m = maisPerto(p, d.ligacoes[l]!.pontos);
      if (m.d <= SOBRE_TRECHO) return { k: 'seg', l, j: m.j, t: m.t };
    }
    return null;
  };

  const descNos: Desc[] = d.nos.map((n, i) => {
    const p: Pt = [n.x, n.y];
    const c = controles.findIndex((x) => x.i === i);
    if (c >= 0) return desc(p, { k: 'ctrl', c });
    const seg = n.tipo === 'reservatorio' ? null : sobreTrecho(p, (l) => presos[l]!.includes(i));
    return desc(p, seg ?? { k: 'livre' });
  });
  const descVert: Desc[][] = d.ligacoes.map((lg, l) =>
    lg.pontos.map((v, j) => {
      const i = presos[l]![j];
      if (i != null) return desc(v, { k: 'no', i }, [v[0] - d.nos[i]!.x, v[1] - d.nos[i]!.y]);
      return desc(v, sobreTrecho(v, (x) => x === l) ?? { k: 'livre' });
    }),
  );
  // rótulo ou valor: segue o ponto mais perto da ligação dele (sem ligação: de qualquer uma)
  const rotulo = (p: Pt, so?: number): Desc => {
    let melhor: { l: number; m: ReturnType<typeof maisPerto> } | null = null;
    for (let l = 0; l < d.ligacoes.length; l++) {
      if (so !== undefined && l !== so) continue;
      const m = maisPerto(p, d.ligacoes[l]!.pontos);
      if (!melhor || m.d < melhor.m.d) melhor = { l, m };
    }
    if (!melhor) return desc(p, { k: 'livre' });
    return desc(p, { k: 'seg', l: melhor.l, j: melhor.m.j, t: melhor.m.t }, [p[0] - melhor.m.q[0], p[1] - melhor.m.q[1]]);
  };
  const descRotulos = d.ligacoes.map((lg, l) => ({ valor: lg.valor && rotulo([lg.valor.x, lg.valor.y], l), rotulo: lg.rotulo && rotulo([lg.rotulo.x, lg.rotulo.y], l) }));
  const descValores = (d.valores ?? []).map((v) => rotulo([v.x, v.y]));
  const descTextos = (d.textos ?? []).map((t) => rotulo([t.x, t.y]));

  /** Resolve as posições na tela (px), com memória e proteção contra ciclo. */
  const resolvedor = (tela: Tela) => {
    const memo = new Map<string, Pt>();
    const livre = (x: Desc): Pt => {
      let px = tela.s * x.p[0];
      let py = tela.s * x.p[1];
      controles.forEach(({ i }, c) => {
        const n = d.nos[i]!;
        px += x.w[c]! * (tela.nos[c]![0] - tela.s * n.x);
        py += x.w[c]! * (tela.nos[c]![1] - tela.s * n.y);
      });
      return [px, py];
    };
    const calcular = (x: Desc): Pt => {
      const b = x.base;
      if (b.k === 'livre') return livre(x);
      let q: Pt;
      if (b.k === 'ctrl') q = tela.nos[b.c]!;
      else if (b.k === 'no') q = no(b.i);
      else {
        const a = vert(b.l, b.j);
        const z = vert(b.l, b.j + 1);
        q = [a[0] + (z[0] - a[0]) * b.t, a[1] + (z[1] - a[1]) * b.t];
      }
      return [q[0] + tela.s * x.o[0], q[1] + tela.s * x.o[1]];
    };
    const em = (chave: string, x: Desc): Pt => {
      const m = memo.get(chave);
      if (m) return m;
      memo.set(chave, livre(x)); // se voltar a este ponto no meio do cálculo (ciclo), fica a posição livre
      const q = calcular(x);
      memo.set(chave, q);
      return q;
    };
    const no = (i: number) => em(`n${i}`, descNos[i]!);
    const vert = (l: number, j: number) => em(`v${l}.${j}`, descVert[l]![j]!);
    return { no, vert, calcular };
  };

  const emUnidades = (tela: Tela, p: Pt): [number, number] => [p[0] / tela.s, p[1] / tela.s];

  /** Afasta os símbolos de represas que se cobririam, pelo eixo de menor sobreposição. */
  const caixas = controles.map(({ i }) => {
    const n = d.nos[i]!;
    return n.tipo === 'reservatorio' ? caixaReservatorio(n) : ([-30, -30, 30, 30] as [number, number, number, number]);
  });
  const afastar = (tela: Tela): Tela => {
    const p = tela.nos.map((q): Pt => [q[0], q[1]]);
    const k = tela.s;
    for (let volta = 0; volta < 60; volta++) {
      let mexeu = false;
      for (let a = 0; a < p.length; a++)
        for (let b = a + 1; b < p.length; b++) {
          const [A, B, pa, pb] = [caixas[a]!, caixas[b]!, p[a]!, p[b]!];
          const ox = Math.min(pa[0] + k * A[2], pb[0] + k * B[2]) - Math.max(pa[0] + k * A[0], pb[0] + k * B[0]) + FOLGA_SIMBOLOS;
          const oy = Math.min(pa[1] + k * A[3], pb[1] + k * B[3]) - Math.max(pa[1] + k * A[1], pb[1] + k * B[1]) + FOLGA_SIMBOLOS;
          if (ox <= 0 || oy <= 0) continue;
          mexeu = true;
          const eixo = ox < oy ? 0 : 1;
          const centro = (q: Pt, C: number[]) => q[eixo] + (k * (C[eixo]! + C[eixo + 2]!)) / 2;
          const lado = centro(pa, A) <= centro(pb, B) ? -1 : 1;
          const passo = (eixo ? oy : ox) / 2;
          pa[eixo] += lado * passo;
          pb[eixo] -= lado * passo;
        }
      p.forEach((q, c) => {
        const [x0, y0] = tela.nos[c]!;
        const dd = Math.hypot(q[0] - x0, q[1] - y0);
        if (dd > MAX_AFASTAR) [q[0], q[1]] = [x0 + ((q[0] - x0) * MAX_AFASTAR) / dd, y0 + ((q[1] - y0) * MAX_AFASTAR) / dd];
      });
      if (!mexeu) break;
    }
    return { ...tela, nos: p };
  };

  return {
    controles,
    pontos(tela) {
      const r = resolvedor(afastar(tela));
      return [...d.nos.map((_, i) => r.no(i)), ...d.ligacoes.flatMap((lg, l) => lg.pontos.map((_, j) => r.vert(l, j)))];
    },
    aplicar(real, largura, altura) {
      const tela = afastar(real);
      const r = resolvedor(tela);
      const xy = (x: Desc) => {
        const [px, py] = emUnidades(tela, r.calcular(x));
        return { x: px, y: py };
      };
      const ligacoes: Ligacao[] = d.ligacoes.map((lg, l) => ({
        ...lg,
        pontos: lg.pontos.map((_, j) => emUnidades(tela, r.vert(l, j))),
        valor: lg.valor && { ...lg.valor, ...xy(descRotulos[l]!.valor!) },
        rotulo: lg.rotulo && { ...lg.rotulo, ...xy(descRotulos[l]!.rotulo!) },
      }));
      const nos: No[] = d.nos.map((n, i) => {
        const [x, y] = emUnidades(tela, r.no(i));
        return { ...n, x, y };
      });
      const guias = real.nos.flatMap((q, c): [Pt, Pt][] => {
        const p = tela.nos[c]!;
        return Math.hypot(p[0] - q[0], p[1] - q[1]) > 3 ? [[emUnidades(tela, q), emUnidades(tela, p)]] : [];
      });
      const desenho: Diagrama = {
        ...d,
        largura: largura / tela.s,
        altura: altura / tela.s,
        ligacoes,
        nos,
        valores: d.valores?.map((v, k) => ({ ...v, ...xy(descValores[k]!) })),
        textos: d.textos?.flatMap((t, k) => (t.semMapa ? [] : [{ ...t, ...xy(descTextos[k]!) }])),
      };
      return { desenho, guias };
    },
  };
}
