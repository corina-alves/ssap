// Traçado detalhado dos rios de src/conteudo/hidrografia-sistemas.json (diagramas
// unifilares do painel interativo, com mapa de fundo). O traçado que está lá (BC250
// do IBGE, 1:250.000, um ponto a cada ~400 m) corta as curvas do rio na imagem de
// satélite; cada rio passa a ser o caminho pelo OpenStreetMap (waterway) ao longo
// dele: só trechos do OSM perto do traçado atual, de preferência com o mesmo nome.
// Onde o OSM não serve (falta trecho, desvia demais), fica o traçado atual.
// ESTENDER leva rios até pontos do diagrama que ficavam além do fim deles. As
// represas (aguas) ficam como estão.
//
// Uso: node scripts/hidrografia-sistemas.mjs
// (respostas do Overpass guardadas em <tmp>/ssap-hidrografia-osm; apague para buscar de novo)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARQUIVO = join(RAIZ, 'src', 'conteudo', 'hidrografia-sistemas.json');
const CACHE = join(tmpdir(), 'ssap-hidrografia-osm');
const OVERPASS = 'https://overpass-api.de/api/interpreter';

const CORREDOR_M = 700; // só trechos do OSM até essa distância do traçado atual
const CORREDOR_MESMO_M = 1300; // trechos do OSM com o nome do rio: até essa distância
const PONTA_M = 1000; // começo e fim do rio: liga ao OSM até essa distância
const LIGA_M = 2500; // pontas soltas do OSM (rio que some dentro da represa) ligadas em linha reta até essa distância
const LIGA_ESTENDER_M = 5000; // idem, ao estender (atravessa represa inteira)
const COLA_M = 150; // ponta solta a essa distância de outro trecho: ligada a ele
const COBRE_M = 1500; // o caminho novo tem de passar a essa distância de todo o traçado atual (senão fica o atual)
const TOLERANCIA_M = 4; // simplificação (Douglas-Peucker)
const GUIA_CUSTO = 2.5; // o traçado atual só é usado onde o OSM falta: custa esse tanto por metro (OSM: 1)
const ENTRA_M = 200; // do traçado atual para o OSM (e de volta) até essa distância
const JUNTA_M = 300; // pedaços do mesmo rio com pontas a essa distância viram um só

// rios que o diagrama usa além do fim do traçado: da ponta perto de `de` até `ate` ([lat, lon])
const ESTENDER = {
  cantareira: [{ rio: 'Rio Jaguari', de: [-22.9097, -46.4939], ate: [-22.7973, -46.8961] }], // ~13 km além do Posto Buenópolis (a ponta do desenho segue o rio)
  'sao-lourenco': [{ rio: 'Rio Juquiá', de: [-23.932, -47.1268], ate: [-24.005, -47.2598] }], // pela represa Cachoeira do França até o trecho de jusante
};

const normalizar = (s = '') =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(rio|ribeirao|rib|corrego|da|do|de|das|dos)\b\.?/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim();

/** O mesmo rio pelo nome (normalizado): igual, ou um contém o outro ("biritiba" e "biritiba mirim", "juquia" e "juquia guacu"). */
const parecido = (a, b) => a === b || Boolean(a && b && (a.startsWith(`${b} `) || b.startsWith(`${a} `)));

// ------------------------------------------------------------------ Overpass

async function buscar(chave, consulta) {
  mkdirSync(CACHE, { recursive: true });
  const arq = join(CACHE, `${chave}.json`);
  if (existsSync(arq)) return JSON.parse(readFileSync(arq, 'utf8'));
  for (let tentativa = 0, espera = 20; tentativa < 7; tentativa++, espera *= 2) {
    try {
      const r = await fetch(OVERPASS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ssap-painel-interativo/1.0 (hidrografia dos sistemas produtores)' },
        body: new URLSearchParams({ data: consulta }),
      });
      const texto = await r.text();
      if (r.ok && texto.trimStart().startsWith('{')) {
        writeFileSync(arq, texto);
        return JSON.parse(texto);
      }
      console.warn(`  Overpass ${r.status}; de novo em ${espera} s`);
    } catch (e) {
      console.warn(`  Overpass: ${e.message}; de novo em ${espera} s`);
    }
    await new Promise((ok) => setTimeout(ok, espera * 1000));
  }
  throw new Error(`Overpass não respondeu (${chave})`);
}

// ------------------------------------------------------------------ geometria (m, plano local)

function plano(lat0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return { xy: ([lon, lat]) => [lon * kx, lat * ky], ll: ([x, y]) => [x / kx, y / ky] };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Índice em grade de pontos, para "qual a distância até o mais perto". */
function grade(pontos, lado = 500) {
  const g = new Map();
  const k = (x, y) => `${Math.floor(x / lado)},${Math.floor(y / lado)}`;
  for (const p of pontos) {
    const c = k(p[0], p[1]);
    if (!g.has(c)) g.set(c, []);
    g.get(c).push(p);
  }
  return (p, raio) => {
    let m = Infinity;
    const r = Math.ceil(raio / lado);
    const [cx, cy] = [Math.floor(p[0] / lado), Math.floor(p[1] / lado)];
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) for (const q of g.get(`${cx + i},${cy + j}`) ?? []) m = Math.min(m, dist(p, q));
    return m;
  };
}

/** A linha com um ponto a cada `passo` m (no máximo). */
function densificar(pts, passo = 50) {
  const r = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const n = Math.ceil(dist(a, b) / passo);
    for (let k = 1; k <= n; k++) r.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return r;
}

function simplificar(pts, tol) {
  if (pts.length < 3) return pts;
  const manter = new Uint8Array(pts.length);
  manter[0] = manter[pts.length - 1] = 1;
  const pilha = [[0, pts.length - 1]];
  while (pilha.length) {
    const [i, j] = pilha.pop();
    const [a, b] = [pts[i], pts[j]];
    const c = dist(a, b);
    let [mi, md] = [-1, 0];
    for (let k = i + 1; k < j; k++) {
      const p = pts[k];
      const d = c ? Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / c : dist(a, p);
      if (d > md) [mi, md] = [k, d];
    }
    if (md > tol) {
      manter[mi] = 1;
      pilha.push([i, mi], [mi, j]);
    }
  }
  return pts.filter((_, k) => manter[k]);
}

const comprimento = (pts) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);

// ------------------------------------------------------------------ caminho pelo OSM

/** Menor caminho (Dijkstra) de 'S' a 'E' no grafo { id: [[vizinho, custo]] }. */
function menorCaminho(grafo) {
  const custo = new Map([['S', 0]]);
  const veio = new Map();
  const heap = [['S', 0]];
  const sobe = (i) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][1] <= heap[i][1]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const desce = (i) => {
    for (;;) {
      const [l, r] = [2 * i + 1, 2 * i + 2];
      let m = i;
      if (l < heap.length && heap[l][1] < heap[m][1]) m = l;
      if (r < heap.length && heap[r][1] < heap[m][1]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  };
  while (heap.length) {
    const [u, cu] = heap[0];
    const ult = heap.pop();
    if (heap.length) {
      heap[0] = ult;
      desce(0);
    }
    if (cu > (custo.get(u) ?? Infinity)) continue;
    if (u === 'E') break;
    for (const [v, c] of grafo.get(u) ?? []) {
      const n = cu + c;
      if (n < (custo.get(v) ?? Infinity)) {
        custo.set(v, n);
        veio.set(v, u);
        heap.push([v, n]);
        sobe(heap.length - 1);
      }
    }
  }
  if (!veio.has('E')) return null;
  const ids = ['E'];
  while (ids[0] !== 'S') ids.unshift(veio.get(ids[0]));
  return ids;
}

/**
 * Caminho pelos trechos do OSM de `ini` a `fim` (m). `peso(caminho, a, b)` dá o fator
 * do custo de cada pedaço (Infinity: fora). Pontas soltas são ligadas em linha reta
 * (rio que some dentro da represa, trechos que não se tocam), mais caro. Com `guia`
 * (o traçado atual, denso), ele também entra no grafo, bem mais caro que o OSM: onde
 * o OSM falta (trecho sem nome, rio dentro da represa), o caminho segue o guia.
 */
function peloOsm(caminhos, ini, fim, peso, { guia = null, ligaM = LIGA_M } = {}) {
  const grafo = new Map();
  const pos = new Map();
  const pontas = new Set(); // começo e fim de cada trecho do OSM (no corredor)
  const liga = (a, b, c) => {
    if (!grafo.has(a)) grafo.set(a, []);
    if (!grafo.has(b)) grafo.set(b, []);
    grafo.get(a).push([b, c]);
    grafo.get(b).push([a, c]);
  };
  for (const w of caminhos)
    for (let i = 1; i < w.pts.length; i++) {
      const f = peso(w, w.pts[i - 1], w.pts[i]);
      if (!Number.isFinite(f)) continue;
      const [a, b] = [w.nos[i - 1], w.nos[i]];
      pos.set(a, w.pts[i - 1]);
      pos.set(b, w.pts[i]);
      liga(a, b, f * dist(w.pts[i - 1], w.pts[i]));
      if (i === 1 || !Number.isFinite(peso(w, w.pts[i - 2], w.pts[i - 1]))) pontas.add(a);
      if (i === w.pts.length - 1 || !Number.isFinite(peso(w, w.pts[i], w.pts[i + 1]))) pontas.add(b);
    }
  if (!pos.size) return null;
  const todos = [...pos.entries()];
  const soltos = todos.filter(([id]) => pontas.has(id));
  for (let i = 0; i < soltos.length; i++) {
    const [a, pa] = soltos[i];
    for (let j = i + 1; j < soltos.length; j++) {
      const [b, pb] = soltos[j];
      const d = dist(pa, pb);
      // com guia, salto reto só onde nem ele serve (cortaria curvas do rio)
      if (d <= ligaM) liga(a, b, (guia ? 8 : 3) * d + 200);
    }
    // ponta solta junto de outro trecho (sem nó em comum)
    for (const [b, pb] of todos) if (b !== a && dist(pa, pb) <= COLA_M) liga(a, b, 2 * dist(pa, pb));
  }
  for (const [id, p] of todos) {
    const [di, df] = [dist(p, ini), dist(p, fim)];
    if (di <= PONTA_M) liga('S', id, 3 * di);
    if (df <= PONTA_M) liga(id, 'E', 3 * df);
  }
  if (guia) {
    // o guia: g0 … gN, ligado ao OSM a cada ponto (até ENTRA_M)
    const lado = 200;
    const celulas = new Map();
    for (const [id, p] of todos) {
      const k = `${Math.floor(p[0] / lado)},${Math.floor(p[1] / lado)}`;
      if (!celulas.has(k)) celulas.set(k, []);
      celulas.get(k).push([id, p]);
    }
    guia.forEach((g, i) => {
      const id = `g${i}`;
      pos.set(id, g);
      if (i) liga(`g${i - 1}`, id, GUIA_CUSTO * dist(guia[i - 1], g));
      const [cx, cy] = [Math.floor(g[0] / lado), Math.floor(g[1] / lado)];
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const [o, p] of celulas.get(`${cx + a},${cy + b}`) ?? []) {
            const d = dist(g, p);
            if (d <= ENTRA_M) liga(id, o, 2 * d + 40);
          }
    });
    liga('S', 'g0', 0);
    liga(`g${guia.length - 1}`, 'E', 0);
  }
  const ids = menorCaminho(grafo);
  if (!ids) return null;
  const pts = ids.slice(1, -1).map((id) => pos.get(id));
  // quanto do caminho ficou no guia (m)
  pts.peloGuia = ids.slice(2, -1).reduce((s, id, k) => s + (String(id)[0] === 'g' && String(ids[k + 1])[0] === 'g' ? dist(pos.get(ids[k + 1]), pos.get(id)) : 0), 0);
  // pontas: o começo e o fim do traçado atual, se o OSM parou antes
  if (dist(ini, pts[0]) > 100) pts.unshift(ini);
  if (dist(fim, pts.at(-1)) > 100) pts.push(fim);
  return pts;
}

// ------------------------------------------------------------------ por sistema

const hidro = JSON.parse(readFileSync(ARQUIVO, 'utf8'));
let antes = 0;
let depois = 0;

for (const [chave, sistema] of Object.entries(hidro.sistemas)) {
  const extras = ESTENDER[chave] ?? [];
  const lls = [...sistema.rios.flatMap((r) => r.c.flat()), ...extras.map((x) => [x.ate[1], x.ate[0]])];
  const [w, s, e, n] = [Math.min(...lls.map((p) => p[0])) - 0.02, Math.min(...lls.map((p) => p[1])) - 0.02, Math.max(...lls.map((p) => p[0])) + 0.02, Math.max(...lls.map((p) => p[1])) + 0.02];
  const nomes = [...new Set(sistema.rios.map((r) => r.n.replace(/^(Rio|Ribeirão|Rib\.|Córrego)\s+/, '').replace(/[.*+?^${}()|[\]\\]/g, '').replace(/[-\s]+/g, '.')))];
  const bbox = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
  const consulta = `[out:json][timeout:240];(way["waterway"~"^(river|canal|stream)$"]["name"~"(${nomes.join('|')})"](${bbox});way["waterway"~"^(river|canal)$"][!"name"](${bbox}););out geom;`;
  console.log(`${chave}: buscando ${nomes.length} rios no OSM…`);
  const osm = await buscar(chave, consulta);
  const P = plano((s + n) / 2);
  const caminhos = osm.elements
    .filter((x) => x.type === 'way' && x.geometry?.length > 1)
    .map((x) => ({ nome: normalizar(x.tags?.name), semNome: !x.tags?.name, nos: x.nodes, pts: x.geometry.map((g) => P.xy([g.lon, g.lat])) }));
  console.log(`  ${caminhos.length} trechos do OSM`);

  const rios = sistema.rios.map((r) => ({ ...r, c: r.c.map((c) => c.map(P.xy)) }));
  for (const r of rios) {
    const nome = normalizar(r.n);
    r.c = r.c.map((guia, k) => {
      const denso = densificar(guia);
      const perto = grade(denso);
      // o mesmo rio no OSM (mesmo nome, ou um contém o outro: "Biritiba" e "Biritiba-Mirim") vale mais longe do
      // traçado atual (que chega a errar ~1 km); os demais, só bem perto e mais caros (afluentes, canais)
      const peso = (w, a, b) => {
        const m = parecido(w.nome, nome);
        const lim = m ? CORREDOR_MESMO_M : CORREDOR_M;
        const d = Math.max(perto(a, lim), perto(b, lim));
        if (d > lim) return Infinity;
        if (m) return (w.nome === nome ? 1 : 1.2) * (1 + (d / 1500) ** 2);
        return (w.semNome ? 1.5 : 4) * (1 + (d / 400) ** 2);
      };
      const novo = peloOsm(caminhos, guia[0], guia.at(-1), peso, { guia: denso });
      const rotulo = `  ${r.n}${r.c.length > 1 ? ` (${k + 1})` : ''}`;
      if (!novo) {
        console.log(`${rotulo}: sem caminho no OSM, fica o atual`);
        return guia;
      }
      const cobre = grade(densificar(novo));
      const longe = Math.max(...denso.map((p) => cobre(p, COBRE_M)));
      const razao = comprimento(novo) / comprimento(guia);
      if (longe > COBRE_M || razao < 0.8 || razao > 4) {
        console.log(`${rotulo}: caminho do OSM não serve (desvio ${Number.isFinite(longe) ? Math.round(longe) : '>' + COBRE_M} m, ${razao.toFixed(2)}× o comprimento), fica o atual`);
        return guia;
      }
      const pg = novo.peloGuia / comprimento(novo);
      console.log(`${rotulo}: ${guia.length} → ${novo.length} pontos (${(comprimento(novo) / 1000).toFixed(1)} km, ${razao.toFixed(2)}× o atual; ${Math.round(100 * pg)}% sem OSM)`);
      return novo;
    });
  }

  for (const x of extras) {
    const r = rios.find((y) => y.n === x.rio);
    if (!r) throw new Error(`${chave}: rio ${x.rio} não está na hidrografia`);
    const de = P.xy([x.de[1], x.de[0]]);
    const ate = P.xy([x.ate[1], x.ate[0]]);
    // a ponta (de qual pedaço, começo ou fim) mais perto de `de`
    let m = { k: 0, fim: true, d: Infinity };
    r.c.forEach((c, k) => {
      for (const fim of [false, true]) {
        const d = dist(de, fim ? c.at(-1) : c[0]);
        if (d < m.d) m = { k, fim, d };
      }
    });
    const c = r.c[m.k];
    if (grade(densificar(c))(ate, JUNTA_M) <= JUNTA_M) continue; // esse pedaço já chega lá (rodando de novo)
    const ponta = m.fim ? c.at(-1) : c[0];
    const nome = normalizar(r.n);
    const ext = peloOsm(caminhos, ponta, ate, (w) => (parecido(w.nome, nome) ? 1 : w.semNome ? 2 : Infinity), { ligaM: LIGA_ESTENDER_M });
    if (!ext) {
      console.log(`  ${r.n}: sem caminho no OSM até ${x.ate}, não estendido`);
      continue;
    }
    console.log(`  ${r.n}: estendido ${(comprimento(ext) / 1000).toFixed(1)} km até ${x.ate}`);
    r.c[m.k] = m.fim ? [...c, ...ext.slice(1)] : [...ext.slice(1).reverse(), ...c];
  }

  // pedaços do mesmo rio que se encontram viram um só
  for (const r of rios) {
    for (let juntou = true; juntou && r.c.length > 1; ) {
      juntou = false;
      for (let i = 0; i < r.c.length && !juntou; i++)
        for (let j = 0; j < r.c.length && !juntou; j++) {
          if (i === j) continue;
          const [a, b] = [r.c[i], r.c[j]];
          const pares = [
            [a.at(-1), b[0], () => [...a, ...b]],
            [a.at(-1), b.at(-1), () => [...a, ...[...b].reverse()]],
            [a[0], b[0], () => [...[...a].reverse(), ...b]],
          ];
          for (const [p, q, unir] of pares)
            if (!juntou && dist(p, q) <= JUNTA_M) {
              r.c[i] = unir();
              r.c.splice(j, 1);
              juntou = true;
              console.log(`  ${r.n}: pedaços juntados`);
            }
        }
    }
  }

  sistema.rios = rios.map((r) => ({
    ...r,
    c: r.c.map((c) => {
      antes += c.length;
      const pts = simplificar(c, TOLERANCIA_M).map((p) => P.ll(p).map((v) => Math.round(v * 1e5) / 1e5));
      depois += pts.length;
      return pts;
    }),
  }));
}

hidro.fonte =
  'Rios: OpenStreetMap (© colaboradores do OpenStreetMap, ODbL), ao longo dos rios da Base Cartográfica Contínua 1:250.000 do IBGE (BC250, 2023); espelhos d’água: BC250; Águas Claras e a posição das represas: OpenStreetMap.';
writeFileSync(ARQUIVO, JSON.stringify(hidro));
console.log(`pronto: ${antes} pontos do OSM, ${depois} depois de simplificar`);
