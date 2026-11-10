import type { Diagrama, Ligacao, No } from '@/conteudo/diagramas-unifilares';

/**
 * Diagrama unifilar sobre o mapa: o mesmo esquema do "Sem mapa", com lugar
 * fixo no mapa (mapa-unifilar.tsx escolhe onde). Na tela, o ponto p do esquema
 * fica em k·p + t: com zoom, as distâncias crescem junto com o mapa, mas
 * símbolos e textos mantêm o tamanho (s px por unidade). Para o desenho
 * continuar ligado e reto:
 *   - ponta de ligação junto a um símbolo (porta da barragem, entrada da ETA)
 *     fica presa a ele, no mesmo deslocamento em px;
 *   - trecho horizontal ou vertical que chega numa ponta presa continua reto;
 *   - posto e junção sobre outra ligação ficam sobre ela;
 *   - rótulos e valores seguem o ponto mais perto da ligação deles, no mesmo
 *     deslocamento em px.
 * Com k = s, sai o próprio esquema.
 */

export type Pt = [number, number];

/** Tela (px): o ponto p do esquema vai para k·p + t; símbolos e textos medem s px por unidade (s ≤ k). */
export type Tela = { s: number; k: number; t: Pt };

/** Junto de uma ligação: o ponto q do trecho j da ligação l e o deslocamento o (unidades) até ela. */
type Junto = { l: number; j: number; q: Pt; o: Pt };

/** Como um ponto do esquema acha o lugar na tela. */
type Base =
  | { k: 'livre' } // k·p + t
  | { k: 'no'; i: number } // preso ao símbolo do nó i
  | ({ k: 'seg' } & Junto); // sobre (ou quase sobre) outra ligação

// até onde uma ponta de ligação fica presa ao nó: reservatório (barragem, bacia e portas) e demais símbolos
const PRESO_RES = { dx: 95, dy: 75 };
const PRESO_PONTO = 45;
const SOBRE_TRECHO = 3;
// rótulo mais longe que isso da ligação mais perto não segue nenhuma
const PERTO_ROTULO = 40;
const ALINHADO = 0.5;

/** Ponto do trecho a–b mais perto de p. */
function projetar(p: Pt, a: Pt, b: Pt): Pt {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const c2 = vx * vx + vy * vy;
  const t = c2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / c2)) : 0;
  return [a[0] + vx * t, a[1] + vy * t];
}

/** Ponto mais perto de p na linha: trecho, ponto e distância. */
function maisPerto(p: Pt, pontos: Pt[]) {
  let melhor = { j: 0, d: Infinity, q: pontos[0]! as Pt };
  for (let j = 0; j < pontos.length - 1; j++) {
    const q = projetar(p, pontos[j]!, pontos[j + 1]!);
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < melhor.d) melhor = { j, d, q };
  }
  return melhor;
}

/** Para uma tela, o diagrama nas unidades do desenho (px / s), pronto para o DesenhoUnifilar. */
export function planoNoMapa(d: Diagrama): (tela: Tela, largura: number, altura: number) => Diagrama {
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
      if (m.d <= SOBRE_TRECHO) return { k: 'seg', l, j: m.j, q: m.q, o: [p[0] - m.q[0], p[1] - m.q[1]] };
    }
    return null;
  };

  const baseNos: Base[] = d.nos.map((n, i) => (n.tipo === 'reservatorio' ? null : sobreTrecho([n.x, n.y], (l) => presos[l]!.includes(i))) ?? { k: 'livre' });
  const baseVert: Base[][] = d.ligacoes.map((lg, l) =>
    lg.pontos.map((v, j) => {
      const i = presos[l]![j];
      return i != null ? { k: 'no', i } : (sobreTrecho(v, (x) => x === l) ?? { k: 'livre' });
    }),
  );
  // rótulo ou valor: o ponto mais perto da ligação dele (sem ligação: de qualquer uma)
  const junto = (p: Pt, so?: number): Junto | null => {
    let melhor: (ReturnType<typeof maisPerto> & { l: number }) | null = null;
    for (let l = 0; l < d.ligacoes.length; l++) {
      if (so !== undefined && l !== so) continue;
      const m = maisPerto(p, d.ligacoes[l]!.pontos);
      if (!melhor || m.d < melhor.d) melhor = { ...m, l };
    }
    if (!melhor || melhor.d > PERTO_ROTULO) return null;
    return { l: melhor.l, j: melhor.j, q: melhor.q, o: [p[0] - melhor.q[0], p[1] - melhor.q[1]] };
  };
  const juntoLigacoes = d.ligacoes.map((lg, l) => ({ valor: lg.valor && junto([lg.valor.x, lg.valor.y], l), rotulo: lg.rotulo && junto([lg.rotulo.x, lg.rotulo.y], l) }));
  const juntoValores = (d.valores ?? []).map((v) => junto([v.x, v.y]));
  const juntoTextos = (d.textos ?? []).map((t) => junto([t.x, t.y]));

  return ({ s, k, t }, largura, altura) => {
    const livre = (p: Pt): Pt => [k * p[0] + t[0], k * p[1] + t[1]];
    // posições na tela (px), com memória; se voltar a um ponto no meio do cálculo (ciclo), fica a posição livre
    const memo = new Map<string, Pt>();
    const em = (chave: string, p: Pt, calcular: () => Pt): Pt => {
      const m = memo.get(chave);
      if (m) return m;
      memo.set(chave, livre(p));
      const q = calcular();
      memo.set(chave, q);
      return q;
    };
    // junto da ligação: no mesmo ponto dela e no mesmo deslocamento em px
    const perto = (x: Junto): Pt => {
      const r = projetar(livre(x.q), vert(x.l, x.j), vert(x.l, x.j + 1));
      return [r[0] + s * x.o[0], r[1] + s * x.o[1]];
    };
    const no = (i: number): Pt => {
      const n = d.nos[i]!;
      const p: Pt = [n.x, n.y];
      const b = baseNos[i]!;
      return em(`n${i}`, p, () => (b.k === 'seg' ? perto(b) : livre(p)));
    };
    const vert = (l: number, j: number): Pt => {
      const pts = d.ligacoes[l]!.pontos;
      const v = pts[j]!;
      const b = baseVert[l]![j]!;
      return em(`v${l}.${j}`, v, () => {
        if (b.k === 'no') {
          const n = d.nos[b.i]!;
          const q = no(b.i);
          return [q[0] + s * (v[0] - n.x), q[1] + s * (v[1] - n.y)];
        }
        if (b.k === 'seg') return perto(b);
        // trecho reto até uma ponta presa ou sobre outra ligação: a mesma coordenada dela (c = 0: vertical; 1: horizontal)
        const q = livre(v);
        for (const c of [0, 1] as const) {
          for (const passo of [-1, 1]) {
            let m = j + passo;
            const alinhado = () => m >= 0 && m < pts.length && Math.abs(pts[m]![c] - v[c]) <= ALINHADO;
            while (alinhado() && baseVert[l]![m]!.k === 'livre') m += passo;
            if (alinhado()) {
              q[c] = vert(l, m)[c];
              break;
            }
          }
        }
        return q;
      });
    };
    const texto = (x: Junto | null, p: Pt): { x: number; y: number } => {
      const q = x ? perto(x) : livre(p);
      return { x: q[0] / s, y: q[1] / s };
    };
    const ligacoes = d.ligacoes.map(
      (lg, l): Ligacao => ({
        ...lg,
        pontos: lg.pontos.map((_, j): [number, number] => {
          const q = vert(l, j);
          return [q[0] / s, q[1] / s];
        }),
        valor: lg.valor && { ...lg.valor, ...texto(juntoLigacoes[l]!.valor ?? null, [lg.valor.x, lg.valor.y]) },
        rotulo: lg.rotulo && { ...lg.rotulo, ...texto(juntoLigacoes[l]!.rotulo ?? null, [lg.rotulo.x, lg.rotulo.y]) },
      }),
    );
    const nos = d.nos.map((n, i): No => {
      const q = no(i);
      return { ...n, x: q[0] / s, y: q[1] / s };
    });
    return {
      ...d,
      largura: largura / s,
      altura: altura / s,
      ligacoes,
      nos,
      valores: d.valores?.map((v, i) => ({ ...v, ...texto(juntoValores[i] ?? null, [v.x, v.y]) })),
      textos: d.textos?.map((x, i) => ({ ...x, ...texto(juntoTextos[i] ?? null, [x.x, x.y]) })),
    };
  };
}
