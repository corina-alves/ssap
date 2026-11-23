// Contorno da bacia do Paraíba do Sul para o diagrama unifilar sobre o mapa
// (src/conteudo/contorno-bacia-paraiba.json, uma Feature GeoJSON com o anel externo).
//
// Fonte: public/acesso/geo/bacia_ps.geojson (ANA, SNIRH: 1 polígono, ~54 mil pontos,
// 5 MB). O mapa desenha só a linha da divisa, então o anel é simplificado
// (Douglas-Peucker com TOLERANCIA_M, em metros) e as coordenadas vão com 4 casas
// (~11 m): fica com ~90 KB, carregado só quando o mapa do Paraíba do Sul abre.
//
// Uso: node scripts/contorno-bacia-paraiba.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = join(RAIZ, 'public', 'acesso', 'geo', 'bacia_ps.geojson');
const SAIDA = join(RAIZ, 'src', 'conteudo', 'contorno-bacia-paraiba.json');
const TOLERANCIA_M = 50;

// metros por grau no meio da bacia (projeção equiretangular local: basta para simplificar)
const LAT_MEIO = (-22 * Math.PI) / 180;
const KX = 111320 * Math.cos(LAT_MEIO);
const KY = 110574;

/** Douglas-Peucker sem recursão: mantém os pontos que se afastam mais de `tol` metros da corda. */
function simplificar(ps, tol) {
  const fica = new Uint8Array(ps.length);
  fica[0] = fica[ps.length - 1] = 1;
  const pilha = [[0, ps.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop();
    const ax = ps[a][0] * KX, ay = ps[a][1] * KY;
    const dx = ps[b][0] * KX - ax, dy = ps[b][1] * KY - ay;
    const l2 = dx * dx + dy * dy;
    let maior = -1, onde = -1;
    for (let i = a + 1; i < b; i++) {
      const px = ps[i][0] * KX - ax, py = ps[i][1] * KY - ay;
      const t = l2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0;
      const dist = Math.hypot(px - t * dx, py - t * dy);
      if (dist > maior) (maior = dist), (onde = i);
    }
    if (maior > tol) {
      fica[onde] = 1;
      pilha.push([a, onde], [onde, b]);
    }
  }
  return ps.filter((_, i) => fica[i]);
}

const fonte = JSON.parse(readFileSync(ENTRADA, 'utf8'));
const feicoes = fonte.type === 'FeatureCollection' ? fonte.features : [fonte];
if (feicoes.length !== 1 || feicoes[0].geometry.type !== 'Polygon') throw new Error('bacia_ps.geojson: esperado 1 polígono');
const original = feicoes[0].geometry.coordinates[0];
const anel = simplificar(original, TOLERANCIA_M).map(([lon, lat]) => [+lon.toFixed(4), +lat.toFixed(4)]);
// sem pontos repetidos seguidos depois do arredondamento (o anel continua fechado)
const limpo = anel.filter((p, i) => i === 0 || p[0] !== anel[i - 1][0] || p[1] !== anel[i - 1][1]);

const json = {
  type: 'Feature',
  properties: { nome: feicoes[0].properties?.nome ?? 'Bacia Hidrográfica do Rio Paraíba do Sul', atribuicao: 'Bacia: ANA (SNIRH)' },
  geometry: { type: 'Polygon', coordinates: [limpo] },
};
writeFileSync(SAIDA, JSON.stringify(json));
console.log(`${original.length} → ${limpo.length} pontos, ${(JSON.stringify(json).length / 1024).toFixed(0)} KB em ${SAIDA}`);
