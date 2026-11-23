// Hidrografia da bacia do Paraíba do Sul para o diagrama unifilar sobre o mapa
// (src/conteudo/hidrografia-paraiba.json, no formato de hidrografia-sistemas.json,
// com a chave do diagrama, "paraiba-do-sul").
//
// Rios: trechos de drenagem da Base Cartográfica Contínua 1:250.000 do IBGE (BC250,
// 2023), pelo WFS do IBGE. Cada rio vira um traçado só (o desenho segue o rio de um
// ponto a outro por ele): o caminho pelos trechos com o nome dele, da nascente (o
// ponto mais longe da foz pela rede) até a foz ou até o rio em que deságua, passando
// pelos `pontos` (barragens e postos do diagrama, de montante para jusante). Trechos
// com o nome que não se tocam (rio que atravessa represa) são ligados em linha reta
// até PONTE_M. Onde o rio não tem nome na BC250 (Ribeirão das Lajes e Guandu), o
// caminho segue a rede toda de uma região (REDES).
//
// Represas (aguas): espelhos d'água da BC250 (Massa_Dagua, "Represa/açude") que
// contêm a barragem ou passam perto dela (REPRESAS).
//
// Uso: node scripts/hidrografia-paraiba.mjs
// (respostas do IBGE guardadas em <tmp>/ssap-hidrografia-paraiba; apague para buscar de novo)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARQUIVO = join(RAIZ, 'src', 'conteudo', 'hidrografia-paraiba.json');
const CACHE = join(tmpdir(), 'ssap-hidrografia-paraiba');
const WFS = 'https://geoservicos.ibge.gov.br/geoserver/wfs?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application/json';
const DRENAGEM = 'CCAR:BC250_2023_Trecho_Drenagem_L';
const MASSA_DAGUA = 'CCAR:BC250_2023_Massa_Dagua_A';

const BBOX = [-46.8, -23.7, -40.8, -20.2]; // lon0, lat0, lon1, lat1
const PONTE_M = 4000; // pontas de trechos com o mesmo nome ligadas em linha reta até essa distância
const PONTO_M = 5000; // ponto (barragem, posto) que fica a mais disso do rio: fora do caminho (avisa)
const DESAGUA_M = 3000; // ponta do afluente até essa distância do rio principal: deságua ali
const TOLERANCIA_M = 40; // simplificação (Douglas-Peucker)
const ESPELHO_M = 1500; // represa: espelho d'água a até essa distância da barragem
const ILHA_M2 = 200_000; // ilha (buraco no espelho d'água) menor que isso some

// [lat, lon] — os mesmos pontos do diagrama (src/conteudo/diagrama-paraiba.ts)
const P = {
  barragemParaibuna: [-23.41, -45.6006],
  barragemParaitinga: [-23.372, -45.6579],
  santaBranca: [-23.3739, -45.8716],
  jacarei: [-23.3078, -45.9757],
  funil: [-22.529, -44.5675],
  santaCecilia: [-22.4813, -43.8388],
  anta: [-22.034, -43.0008],
  ilhaPombos: [-21.8447, -42.5792],
  saoFidelis: [-21.6453, -41.7522],
  campos: [-21.7514, -41.3244],
  saoLuiz: [-23.2227, -45.3121],
  ponteAlta: [-23.3301, -45.1437],
  jaguari: [-23.1927, -46.0217],
  tocos: [-22.748, -44.118],
  vigario: [-22.6298, -43.8956],
  santana: [-22.5322, -43.8183],
  sobragi: [-21.9817, -43.3497],
  picada: [-21.8844, -43.5411],
  cataguases: [-21.3894, -42.6964],
  barraBrauna: [-21.4498, -42.4054],
  padua: [-21.5422, -42.1806],
  patrocinio: [-21.1506, -42.2144],
  itaperuna: [-21.2078, -41.8922],
  cardoso: [-21.5006, -41.6106],
  barragemLajes: [-22.703, -43.8808],
  pereiraPassos: [-22.6864, -43.8252],
  etaGuandu: [-22.8083, -43.6283],
};

// Regiões com a rede toda (todos os trechos, com ou sem nome): [lon0, lat0, lon1, lat1]
const REDES = {
  lajes: [-43.95, -22.9, -43.5, -22.45],
  muriae: [-42.7, -21.3, -41.95, -21.05],
};

/**
 * Rios, na ordem em que são montados (o rio em que um afluente deságua vem antes dele).
 * n: nome no diagrama; nome: na BC250 (sem: só a rede da região); pontos: de montante
 * para jusante; desagua: rio de destino (sem: o caminho vai até o ponto mais longe da
 * nascente — a foz); rede: região com a rede toda, para onde o rio não tem nome.
 */
const RIOS = [
  { n: 'Rio Paraíba do Sul', nome: 'Rio Paraíba do Sul', pontos: [P.santaBranca, P.jacarei, P.funil, P.santaCecilia, P.anta, P.ilhaPombos, P.saoFidelis, P.campos] },
  { n: 'Rio Paraitinga', nome: 'Rio Paraitinga', pontos: [P.saoLuiz, P.barragemParaitinga], desagua: 'Rio Paraíba do Sul' },
  { n: 'Rio Paraibuna', nome: 'Rio Paraibuna', pontos: [P.ponteAlta, P.barragemParaibuna], desagua: 'Rio Paraíba do Sul' },
  { n: 'Rio Jaguari', nome: 'Rio Jaguari', pontos: [P.jaguari], desagua: 'Rio Paraíba do Sul' },
  { n: 'Rio Piraí', nome: 'Rio Piraí', pontos: [P.tocos, P.vigario, P.santana], desagua: 'Rio Paraíba do Sul' },
  { n: 'Rio Paraibuna (MG)', nome: 'Rio Paraibuna', pontos: [P.sobragi], desagua: 'Rio Paraíba do Sul' },
  { n: 'Rio do Peixe', nome: 'Rio do Peixe', pontos: [P.picada], desagua: 'Rio Paraibuna (MG)' },
  { n: 'Rio Preto', nome: 'Rio Preto', pontos: [], desagua: 'Rio Paraibuna (MG)' },
  { n: 'Rio Pomba', nome: 'Rio Pomba', pontos: [P.cataguases, P.barraBrauna, P.padua], desagua: 'Rio Paraíba do Sul' },
  { n: 'Rio Muriaé', nome: 'Rio Muriaé', pontos: [P.patrocinio, P.itaperuna, P.cardoso], desagua: 'Rio Paraíba do Sul', rede: 'muriae' },
  // sem nome na BC250: pela rede da região, da barragem de Lajes ao Guandu (a ETA da RMRJ)
  { n: 'Ribeirão das Lajes', pontos: [P.barragemLajes, P.pereiraPassos, P.etaGuandu], rede: 'lajes', ate: P.etaGuandu },
];

// Represas do diagrama: o espelho d'água em volta da barragem
const REPRESAS = [
  ['Represa de Paraibuna', P.barragemParaibuna],
  ['Represa de Paraibuna', P.barragemParaitinga],
  ['Represa de Santa Branca', P.santaBranca],
  ['Represa do Jaguari', P.jaguari],
  ['Represa do Funil', P.funil],
  ['Reservatório de Santa Cecília', P.santaCecilia],
  ['Reservatório de Santana', P.santana],
  ['Reservatório de Vigário', P.vigario],
  ['Represa de Tocos', P.tocos],
  ['Represa de Ribeirão das Lajes', P.barragemLajes],
  ['Reservatório de Ponte Coberta (Pereira Passos)', P.pereiraPassos],
  ['Reservatório de Anta', P.anta],
];

// ------------------------------------------------------------------ IBGE (WFS)

// depois de um pedido que não foi atendido, os outros (fora do cache) nem são tentados
let foraDoAr = false;

async function wfs(chave, camada, filtro) {
  mkdirSync(CACHE, { recursive: true });
  const arq = join(CACHE, `${chave}.json`);
  if (existsSync(arq)) return JSON.parse(readFileSync(arq, 'utf8'));
  if (foraDoAr) return null;
  const url = `${WFS}&typeName=${camada}&${filtro}`;
  for (let tentativa = 0, espera = 10; tentativa < 4; tentativa++, espera *= 2) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'ssap-painel-interativo/1.0 (hidrografia Paraiba do Sul)' } });
      const texto = await r.text();
      if (r.ok && texto.trimStart().startsWith('{')) {
        writeFileSync(arq, texto);
        return JSON.parse(texto);
      }
      console.warn(`  IBGE ${r.status} (${chave}); de novo em ${espera} s`);
    } catch (e) {
      console.warn(`  IBGE: ${e.message} (${chave}); de novo em ${espera} s`);
    }
    await new Promise((ok) => setTimeout(ok, espera * 1000));
  }
  console.warn(`  IBGE não respondeu (${chave}): fica de fora, e o que faltar também`);
  foraDoAr = true;
  return null;
}
const cql = (s) => `CQL_FILTER=${encodeURIComponent(s)}`;
const linhas = (f) => (f.geometry?.type === 'LineString' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiLineString' ? f.geometry.coordinates : []);

// ------------------------------------------------------------------ geometria (m, plano local)

const kx = 111320 * Math.cos((22 * Math.PI) / 180);
const ky = 110540;
const xy = ([lon, lat]) => [lon * kx, lat * ky];
const deLL = ([lat, lon]) => xy([lon, lat]);
const ll = ([x, y]) => [Math.round((x / kx) * 1e4) / 1e4, Math.round((y / ky) * 1e4) / 1e4];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const comprimento = (pts) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
const area = (anel) => Math.abs(anel.reduce((s, p, i) => { const q = anel[(i + 1) % anel.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

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

/** Ponto da linha mais perto de p (índice do trecho, ponto e distância). */
function maisPerto(p, pts) {
  let m = { j: 0, q: pts[0], d: Infinity };
  for (let j = 0; j < pts.length - 1; j++) {
    const [a, b] = [pts[j], pts[j + 1]];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const c2 = vx * vx + vy * vy;
    const t = c2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / c2)) : 0;
    const q = [a[0] + vx * t, a[1] + vy * t];
    const d = dist(p, q);
    if (d < m.d) m = { j, q, d };
  }
  return m;
}

// ------------------------------------------------------------------ grafo dos trechos

/** Grafo: cada ponto dos trechos é um nó (a mesma coordenada, o mesmo nó); `fator` multiplica o custo. */
function grafo() {
  const id = new Map();
  const pos = [];
  const viz = [];
  const pontas = new Set();
  const no = (p) => {
    const k = `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    if (!id.has(k)) {
      id.set(k, pos.length);
      pos.push(p);
      viz.push([]);
    }
    return id.get(k);
  };
  const ligar = (a, b, c) => {
    viz[a].push([b, c]);
    viz[b].push([a, c]);
  };
  return {
    pos,
    viz,
    pontas,
    trecho(pts, fator) {
      let ant = no(pts[0]);
      pontas.add(ant);
      for (let i = 1; i < pts.length; i++) {
        const k = no(pts[i]);
        if (k !== ant) ligar(ant, k, fator * dist(pts[i - 1], pts[i]));
        ant = k;
      }
      pontas.add(ant);
    },
    ligar,
  };
}

/** Distâncias de `de` a todos (Dijkstra) e de onde veio cada um. */
function dijkstra(g, de) {
  const custo = new Float64Array(g.pos.length).fill(Infinity);
  const veio = new Int32Array(g.pos.length).fill(-1);
  custo[de] = 0;
  const heap = [[0, de]];
  const sobe = (i) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const desce = (i) => {
    for (;;) {
      const [l, r] = [2 * i + 1, 2 * i + 2];
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  };
  while (heap.length) {
    const [c, u] = heap[0];
    const ult = heap.pop();
    if (heap.length) {
      heap[0] = ult;
      desce(0);
    }
    if (c > custo[u]) continue;
    for (const [v, w] of g.viz[u]) {
      if (c + w < custo[v]) {
        custo[v] = c + w;
        veio[v] = u;
        heap.push([c + w, v]);
        sobe(heap.length - 1);
      }
    }
  }
  return { custo, veio };
}

const caminho = (g, de, ate) => {
  const { veio } = dijkstra(g, de);
  if (de !== ate && veio[ate] < 0) return null;
  const ids = [ate];
  while (ids[0] !== de) ids.unshift(veio[ids[0]]);
  return ids.map((i) => g.pos[i]);
};

/** Nó mais perto de p entre os nós `entre` e a distância. */
function noPerto(g, p, entre) {
  let m = { i: -1, d: Infinity };
  for (const i of entre) {
    const d = dist(p, g.pos[i]);
    if (d < m.d) m = { i, d };
  }
  return m;
}

// ------------------------------------------------------------------ montagem

async function main() {
  const nomes = [...new Set(RIOS.flatMap((r) => (r.nome ? [r.nome] : [])))];
  const bb = `BBOX(geom,${BBOX.join(',')})`;
  const comNome = await wfs('drenagem-rios', DRENAGEM, cql(`nome IN (${nomes.map((n) => `'${n}'`).join(',')}) AND ${bb}`));
  if (!comNome) throw new Error('sem os trechos de drenagem do IBGE');
  const redes = {};
  for (const [k, b] of Object.entries(REDES)) redes[k] = await wfs(`drenagem-rede-${k}`, DRENAGEM, `bbox=${b.join(',')}`);

  const feitos = new Map(); // nome no diagrama → traçado (m)
  const saida = [];
  for (const rio of RIOS) {
    const g = grafo();
    const doNome = new Set();
    // trechos com o nome do rio (custo 1)
    for (const f of comNome.features)
      if (rio.nome && f.properties.nome === rio.nome)
        for (const c of linhas(f)) {
          const n0 = g.pos.length;
          g.trecho(c.map(xy), 1);
          for (let i = n0; i < g.pos.length; i++) doNome.add(i);
        }
    // pontas soltas do mesmo nome, ligadas em linha reta (mais caro)
    const soltas = [...g.pontas];
    for (let a = 0; a < soltas.length; a++)
      for (let b = a + 1; b < soltas.length; b++) {
        const d = dist(g.pos[soltas[a]], g.pos[soltas[b]]);
        if (d > 1 && d <= PONTE_M) g.ligar(soltas[a], soltas[b], 3 * d + 300);
      }
    // a rede toda da região: sem nome custa um pouco mais; com outro nome, bem mais
    const rede = rio.rede && redes[rio.rede];
    if (rede)
      for (const f of rede.features) {
        if (rio.nome && f.properties.nome === rio.nome) continue;
        for (const c of linhas(f)) g.trecho(c.map(xy), f.properties.nome ? (rio.nome ? 4 : 2.5) : rio.nome ? 2 : 1);
      }
    if (!g.pos.length) {
      console.warn(`${rio.n}: nenhum trecho`);
      continue;
    }
    const todos = [...g.pos.keys()];
    // nós do rio: os do nome (sem nome: a rede toda)
    const nos = rio.nome ? [...doNome] : todos;

    // os pontos no rio, de preferência num trecho com o nome (os longe demais ficam de fora)
    const marcos = [];
    for (const p of rio.pontos) {
      let m = noPerto(g, deLL(p), nos);
      if (m.d > PONTO_M && rede) m = noPerto(g, deLL(p), todos);
      if (m.d > PONTO_M) console.warn(`${rio.n}: ponto ${p} a ${(m.d / 1000).toFixed(1)} km do rio, fora do caminho`);
      else marcos.push(m.i);
    }
    // fim: o ponto do rio mais perto do rio em que deságua (e o ponto dele ali), o ponto dado ou a foz
    let fim = null;
    let foz = null;
    const destino = rio.desagua && feitos.get(rio.desagua);
    if (rio.desagua && !destino) throw new Error(`${rio.n}: monte ${rio.desagua} antes`);
    // nós ao alcance do primeiro ponto (sem ponto: todos)
    const alcance = marcos.length ? dijkstra(g, marcos[0]).custo : null;
    const alcancaveis = nos.filter((i) => !alcance || Number.isFinite(alcance[i]));
    if (destino) {
      let m = { i: -1, d: Infinity, q: null };
      for (const i of alcancaveis) {
        const x = maisPerto(g.pos[i], destino);
        if (x.d < m.d) m = { i, d: x.d, q: x.q };
      }
      if (m.d > DESAGUA_M) console.warn(`${rio.n}: chega a ${(m.d / 1000).toFixed(1)} km de ${rio.desagua}`);
      fim = m.i;
      foz = m.q;
    } else if (rio.ate) fim = noPerto(g, deLL(rio.ate), todos).i;
    // sem ponto: o pedaço (componente) que chega ao destino
    if (!marcos.length && fim !== null) marcos.push(fim);
    // nascente: o ponto mais longe do fim pela rede com o nome
    const doFim = dijkstra(g, fim ?? marcos.at(-1)).custo;
    let nascente = marcos[0];
    if (rio.nome) for (const i of nos) if (Number.isFinite(doFim[i]) && doFim[i] > doFim[nascente]) nascente = i;
    // sem destino nem ponto final: até o ponto mais longe da nascente (a foz)
    if (fim === null) {
      const daNascente = dijkstra(g, nascente).custo;
      fim = nascente;
      for (const i of nos) if (Number.isFinite(daNascente[i]) && daNascente[i] > daNascente[fim]) fim = i;
    }
    const etapas = [nascente, ...marcos.filter((i) => i !== nascente && i !== fim), fim];
    let pts = [g.pos[nascente]];
    for (let k = 1; k < etapas.length; k++) {
      const c = caminho(g, etapas[k - 1], etapas[k]);
      if (!c) {
        console.warn(`${rio.n}: sem caminho entre dois pontos; reta`);
        pts.push(g.pos[etapas[k]]);
      } else pts.push(...c.slice(1));
    }
    if (foz) pts.push(foz);
    feitos.set(rio.n, pts);
    const s = simplificar(pts, TOLERANCIA_M);
    console.log(`${rio.n}: ${(comprimento(pts) / 1000).toFixed(0)} km, ${s.length} pontos`);
    saida.push({ n: rio.n, pts: s });
  }

  // Ribeirão das Lajes vira Rio Guandu na confluência com o Rio Santana (aqui: a partir de Pereira Passos,
  // o ponto do traçado mais perto do fim do Santana)
  const lajes = saida.find((r) => r.n === 'Ribeirão das Lajes');
  const santana = redes.lajes?.features.filter((f) => f.properties.nome === 'Rio Santana').flatMap(linhas).map((c) => c.map(xy));
  if (lajes && santana?.length) {
    const pp = maisPerto(deLL(P.pereiraPassos), lajes.pts).j;
    let melhor = { j: -1, d: Infinity };
    for (const c of santana)
      for (const p of [c[0], c.at(-1)]) {
        const m = maisPerto(p, lajes.pts.slice(pp));
        if (m.d < melhor.d) melhor = { j: pp + m.j + 1, d: m.d };
      }
    if (melhor.d < 1500) {
      saida.push({ n: 'Rio Guandu', pts: lajes.pts.slice(melhor.j - 1) });
      lajes.pts = lajes.pts.slice(0, melhor.j);
      console.log(`Rio Guandu: a partir da confluência com o Rio Santana (${(comprimento(saida.at(-1).pts) / 1000).toFixed(0)} km)`);
    }
  }

  // represas: o espelho d'água em volta de cada barragem
  const aguas = [];
  const vistos = new Set();
  for (const [nome, p] of REPRESAS) {
    const [lat, lon] = p;
    const caixa = [lon - 0.12, lat - 0.12, lon + 0.12, lat + 0.12];
    const j = await wfs(`represas-${lat}-${lon}`, MASSA_DAGUA, cql(`tipomassadagua='Represa/açude' AND BBOX(geom,${caixa.join(',')})`));
    if (!j) continue;
    const b = deLL(p);
    let melhor = null;
    for (const f of j.features) {
      const polis = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      for (const pol of polis) {
        const aneis = pol.map((a) => a.map(xy));
        const d = Math.min(...aneis.map((a) => maisPerto(b, a).d));
        if (d <= ESPELHO_M && (!melhor || d < melhor.d)) melhor = { d, aneis, id: `${f.id}` };
      }
    }
    if (!melhor) {
      console.warn(`${nome}: sem espelho d'água perto da barragem`);
      continue;
    }
    if (vistos.has(melhor.id)) continue;
    vistos.add(melhor.id);
    // o contorno e as ilhas maiores
    const aneis = melhor.aneis.filter((a, i) => i === 0 || area(a) >= ILHA_M2);
    aguas.push({ n: nome, c: aneis.map((a) => simplificar(a, TOLERANCIA_M).map(ll)) });
  }

  const rios = saida.map(({ n, pts }) => {
    const c = pts.map(ll);
    // ponto do nome: no meio do rio
    const meio = comprimento(pts) / 2;
    let acc = 0;
    let r = c[0];
    for (let i = 1; i < pts.length; i++) {
      acc += dist(pts[i - 1], pts[i]);
      if (acc >= meio) {
        r = c[i];
        break;
      }
    }
    return { n, c: [c], r };
  });
  const json = {
    fonte: 'Rios e espelhos d’água: Base Cartográfica Contínua 1:250.000 do IBGE (BC250, 2023).',
    atribuicao: 'Hidrografia: IBGE (BC250)',
    sistemas: { 'paraiba-do-sul': { rios, aguas } },
  };
  writeFileSync(ARQUIVO, JSON.stringify(json));
  console.log(`${ARQUIVO}: ${rios.length} rios, ${aguas.length} represas, ${(JSON.stringify(json).length / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
