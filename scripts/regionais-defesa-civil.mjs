/**
 * Prepara as regionais da Defesa Civil a partir de public/acesso/geo/regionais_defesa_civil.geojson:
 *   node scripts/regionais-defesa-civil.mjs
 *
 * O arquivo traz só as LINHAS de divisa (abertas: o resto do contorno de cada
 * regional é a divisa do estado, o litoral ou a linha de uma vizinha). Para
 * saber em que regional cai um ponto, o estado (união das UGRHIs) é dividido
 * numa grade, as linhas viram "paredes" e cada área fechada recebe o nome da
 * regional cuja linha a contorna.
 *
 * Gera:
 *   src/conteudo/regionais-defesa-civil.json            grade (ponto → regional) e o centro de cada regional
 *   public/acesso/geo/regionais_defesa_civil_linhas.json linhas simplificadas e rótulos, para desenhar no mapa
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PASSO = 0.004; // graus (~400 m)
const TOLERANCIA = 0.0008; // simplificação das linhas desenhadas (~80 m)

const origem = JSON.parse(readFileSync('public/acesso/geo/regionais_defesa_civil.geojson', 'utf8'));
const ugrhis = JSON.parse(readFileSync('src/conteudo/ugrhi.json', 'utf8'));
const linhas = origem.features.map((f) => ({ nome: String(f.properties.name).trim(), pontos: f.geometry.coordinates.map((c) => [c[0], c[1]]) }));

// ---- grade sobre o estado
let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
const aneisEstado = [];
for (const f of ugrhis.features) {
  const polis = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of polis) aneisEstado.push(p);
}
for (const p of aneisEstado) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
x0 -= PASSO * 3; y0 -= PASSO * 3;
const W = Math.ceil((x1 - x0) / PASSO) + 4;
const H = Math.ceil((y1 - y0) / PASSO) + 4;
const col = (x) => Math.floor((x - x0) / PASSO);
const lin = (y) => Math.floor((y - y0) / PASSO);

/** Preenche (par-ímpar) as células cujo centro está dentro dos anéis. */
function preencher(aneis, destino, valor) {
  for (let j = 0; j < H; j++) {
    const y = y0 + (j + 0.5) * PASSO;
    const xs = [];
    for (const anel of aneis) {
      for (let i = 0, n = anel.length; i < n - 1; i++) {
        const [ax, ay] = anel[i], [bx, by] = anel[i + 1];
        if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const de = Math.max(0, Math.ceil((xs[k] - x0) / PASSO - 0.5));
      const ate = Math.min(W - 1, Math.floor((xs[k + 1] - x0) / PASSO - 0.5));
      for (let i = de; i <= ate; i++) destino[j * W + i] = valor;
    }
  }
}

const estado = new Uint8Array(W * H);
for (const p of aneisEstado) preencher(p, estado, 1);

// ---- paredes: as linhas, engrossadas (fecham as pequenas folgas entre linhas vizinhas)
const parede = new Uint8Array(W * H);
const donoParede = new Int16Array(W * H).fill(-1); // linha que passa pela célula (sem o engrossamento)
linhas.forEach((l, indice) => {
  for (let i = 0; i + 1 < l.pontos.length; i++) {
    const [ax, ay] = l.pontos[i], [bx, by] = l.pontos[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (PASSO / 3)));
    for (let k = 0; k <= n; k++) {
      const c = col(ax + ((bx - ax) * k) / n), r = lin(ay + ((by - ay) * k) / n);
      if (c >= 0 && c < W && r >= 0 && r < H && donoParede[r * W + c] < 0) donoParede[r * W + c] = indice;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i2 = c + di, j2 = r + dj;
        if (i2 >= 0 && i2 < W && j2 >= 0 && j2 < H) parede[j2 * W + i2] = 1;
      }
    }
  }
});

// ---- áreas fechadas (4 vizinhos) dentro do estado
const area = new Int32Array(W * H).fill(-1);
const tamanhos = [];
const pilha = [];
for (let s = 0; s < W * H; s++) {
  if (!estado[s] || parede[s] || area[s] >= 0) continue;
  const id = tamanhos.length;
  let n = 0;
  area[s] = id; pilha.push(s);
  while (pilha.length) {
    const p = pilha.pop(); n++;
    const i = p % W;
    for (const q of [p - W, p + W, i > 0 ? p - 1 : -1, i < W - 1 ? p + 1 : -1]) {
      if (q >= 0 && q < W * H && estado[q] && !parede[q] && area[q] < 0) { area[q] = id; pilha.push(q); }
    }
  }
  tamanhos.push(n);
}

// ---- nome de cada área. A linha de uma regional é o contorno DELA: a regional toca a linha
// inteira, e a linha é boa parte do perímetro da regional. Nota = (parte da linha que toca a
// área) × (parte do perímetro da área feita dessa linha); as melhores notas ficam com o nome.
const MINIMO = 30; // células: áreas menores são sobras junto às paredes
const toca = tamanhos.map(() => new Float64Array(linhas.length)); // células da linha k que tocam a área a
const tamanhoLinha = new Float64Array(linhas.length);
for (let s = 0; s < W * H; s++) {
  const k = donoParede[s];
  if (k < 0) continue;
  tamanhoLinha[k]++;
  const i = s % W, j = Math.floor(s / W);
  const vistas = new Set();
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const i2 = i + di, j2 = j + dj;
    if (i2 >= 0 && i2 < W && j2 >= 0 && j2 < H && area[j2 * W + i2] >= 0) vistas.add(area[j2 * W + i2]);
  }
  for (const a of vistas) toca[a][k]++;
}
const pares = [];
tamanhos.forEach((n, a) => {
  if (n < MINIMO) return;
  const perimetro = toca[a].reduce((x, y) => x + y, 0);
  linhas.forEach((_, k) => { if (toca[a][k]) pares.push([(toca[a][k] / tamanhoLinha[k]) * (toca[a][k] / perimetro), a, k]); });
});
pares.sort((p, q) => q[0] - p[0]);
const nomeDaArea = new Map(), areaDaLinha = new Map();
for (const [, a, k] of pares) {
  if (nomeDaArea.has(a) || areaDaLinha.has(k)) continue;
  nomeDaArea.set(a, k); areaDaLinha.set(k, a);
}
// Linhas que não fecham área própria: subdivisões sem divisa traçada entre as duas partes
// (I-2.1/I-2.2, M-4.1/M-4.2) entram na área que contornam; a linha do litoral não é regional.
const grupos = [...nomeDaArea].map(([a, k]) => ({ area: a, linhas: [k] }));
const soltas = [];
linhas.forEach((l, k) => {
  if (areaDaLinha.has(k)) return;
  let melhorArea = -1, parte = 0;
  tamanhos.forEach((n, a) => { if (nomeDaArea.has(a) && toca[a][k] / tamanhoLinha[k] > parte) { parte = toca[a][k] / tamanhoLinha[k]; melhorArea = a; } });
  if (parte >= 0.8) grupos.find((g) => g.area === melhorArea).linhas.push(k);
  else soltas.push(l.nome);
});
grupos.sort((p, q) => p.linhas[0] - q.linhas[0]);
const grupoDaArea = new Map(grupos.map((g, i) => [g.area, i]));
const nomes = grupos.map((g) => g.linhas.sort((p, q) => p - q).map((k) => linhas[k].nome).join(' / '));
const semNome = tamanhos.map((n, a) => [a, n]).filter(([a, n]) => n >= MINIMO && !nomeDaArea.has(a));
console.log(`grade ${W}×${H}, ${linhas.length} linhas, ${grupos.length} regionais`);
if (soltas.length) console.log('  linhas que não são contorno de regional:', soltas.join(', '));
if (semNome.length) console.log('  áreas sem nome, somadas à vizinha (células):', semNome.map(([, n]) => n).join(', '));

// ---- regional de cada célula do estado; paredes e sobras ficam com a regional mais próxima
const regional = new Int16Array(W * H).fill(-1);
let fila = [];
for (let s = 0; s < W * H; s++) {
  const k = area[s] >= 0 ? grupoDaArea.get(area[s]) : undefined;
  if (k !== undefined) { regional[s] = k; fila.push(s); }
}
while (fila.length) {
  const proxima = [];
  for (const p of fila) {
    const i = p % W;
    for (const q of [p - W, p + W, i > 0 ? p - 1 : -1, i < W - 1 ? p + 1 : -1]) {
      if (q >= 0 && q < W * H && estado[q] && regional[q] < 0) { regional[q] = regional[p]; proxima.push(q); }
    }
  }
  fila = proxima;
}

// ---- centro de cada regional: a célula mais afastada da borda da regional (cabe um rótulo)
const dist = new Int32Array(W * H).fill(-1);
fila = [];
for (let s = 0; s < W * H; s++) {
  if (regional[s] < 0) continue;
  const i = s % W;
  const borda = [s - W, s + W, i > 0 ? s - 1 : -1, i < W - 1 ? s + 1 : -1].some((q) => q < 0 || q >= W * H || regional[q] !== regional[s]);
  if (borda) { dist[s] = 0; fila.push(s); }
}
while (fila.length) {
  const proxima = [];
  for (const p of fila) {
    const i = p % W;
    for (const q of [p - W, p + W, i > 0 ? p - 1 : -1, i < W - 1 ? p + 1 : -1]) {
      if (q >= 0 && q < W * H && regional[q] === regional[p] && dist[q] < 0) { dist[q] = dist[p] + 1; proxima.push(q); }
    }
  }
  fila = proxima;
}
const melhor = grupos.map(() => [-1, -1]);
const celulas = grupos.map(() => 0);
for (let s = 0; s < W * H; s++) {
  const k = regional[s];
  if (k < 0) continue;
  celulas[k]++;
  if (dist[s] > melhor[k][0]) melhor[k] = [dist[s], s];
}
const arred = (v, c = 5) => Math.round(v * 10 ** c) / 10 ** c;
const regionais = nomes.map((nome, k) => {
  const s = melhor[k][1];
  return { nome, centro: [arred(y0 + (Math.floor(s / W) + 0.5) * PASSO, 4), arred(x0 + ((s % W) + 0.5) * PASSO, 4)] };
});
regionais.forEach((r, k) => console.log(`  ${r.nome.padEnd(14)} ${String(celulas[k]).padStart(7)} células  centro ${r.centro}`));

// ---- grade compacta: por linha, pares [quantas células, índice da regional ou -1]
const corridas = [];
for (let j = 0; j < H; j++) {
  const linha = [];
  let atual = regional[j * W], n = 0;
  for (let i = 0; i < W; i++) {
    const v = regional[j * W + i];
    if (v === atual) n++;
    else { linha.push(n, atual); atual = v; n = 1; }
  }
  linha.push(n, atual);
  corridas.push(linha);
}
writeFileSync('src/conteudo/regionais-defesa-civil.json', JSON.stringify({ lng0: arred(x0, 6), lat0: arred(y0, 6), passo: PASSO, colunas: W, linhas: H, regionais, corridas }));

// ---- linhas simplificadas (Douglas-Peucker) para o mapa
function simplificar(pts) {
  const manter = new Uint8Array(pts.length);
  manter[0] = manter[pts.length - 1] = 1;
  const trechos = [[0, pts.length - 1]];
  while (trechos.length) {
    const [a, b] = trechos.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy;
    let maior = 0, onde = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = d2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / d2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > maior) { maior = d; onde = i; }
    }
    if (maior > TOLERANCIA) { manter[onde] = 1; trechos.push([a, onde], [onde, b]); }
  }
  return pts.filter((_, i) => manter[i]);
}
const desenho = { regionais, linhas: linhas.map((l) => simplificar(l.pontos).map(([x, y]) => [arred(y), arred(x)])) };
writeFileSync('public/acesso/geo/regionais_defesa_civil_linhas.json', JSON.stringify(desenho));
console.log(`linhas: ${linhas.reduce((t, l) => t + l.pontos.length, 0)} → ${desenho.linhas.reduce((t, l) => t + l.length, 0)} pontos`);

// ---- conferência visual: node scripts/regionais-defesa-civil.mjs --imagem saida.png
const iImg = process.argv.indexOf('--imagem');
if (iImg > 0 && process.argv[iImg + 1]) {
  const { default: sharp } = await import('sharp');
  const px = Buffer.alloc(W * H * 3, 255);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const s = j * W + i, o = ((H - 1 - j) * W + i) * 3; // norte para cima
    const k = regional[s];
    if (donoParede[s] >= 0) { px[o] = px[o + 1] = px[o + 2] = 0; continue; }
    if (k < 0) continue;
    px[o] = 90 + ((k * 67) % 150); px[o + 1] = 90 + ((k * 131) % 150); px[o + 2] = 90 + ((k * 29) % 150);
  }
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(process.argv[iImg + 1]);
}
