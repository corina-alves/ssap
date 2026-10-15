// Gera src/conteudo/ugrhi-mini.json: o contorno das 22 UGRHIs bem simplificado e já
// em coordenadas de tela, para os mapinhas dos cartões "Rede de Salas de Situação"
// da página inicial. Fonte: src/conteudo/ugrhi.json.  Uso: node scripts/ugrhi-mini.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const LARGURA = 240; // largura do viewBox
const PASSO = 6; // fica 1 ponto a cada PASSO
const MIN_PONTOS = 40; // anéis menores que isso (ilhas, recortes) são descartados

const origem = JSON.parse(readFileSync(join(RAIZ, 'src', 'conteudo', 'ugrhi.json'), 'utf8'));
const todos = origem.features.flatMap((f) => f.geometry.coordinates.flat(2));
const lonMin = Math.min(...todos.map((p) => p[0]));
const lonMax = Math.max(...todos.map((p) => p[0]));
const latMin = Math.min(...todos.map((p) => p[1]));
const latMax = Math.max(...todos.map((p) => p[1]));
const k = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
const escala = LARGURA / ((lonMax - lonMin) * k);
const altura = Math.ceil((latMax - latMin) * escala);

const ugrhis = origem.features.map((f) => {
  const aneis = f.geometry.coordinates.map((pol) => pol[0]);
  const maior = Math.max(...aneis.map((a) => a.length));
  const d = aneis
    .filter((a) => a.length >= MIN_PONTOS || a.length === maior)
    .map((a) => {
      const pontos = a.filter((_, i) => i % PASSO === 0).map(([lon, lat]) => `${((lon - lonMin) * k * escala).toFixed(1)},${((latMax - lat) * escala).toFixed(1)}`);
      return `M${pontos.join('L')}Z`;
    })
    .join('');
  return { codigo: f.properties.codigo, nome: f.properties.nome, d };
});

const destino = join(RAIZ, 'src', 'conteudo', 'ugrhi-mini.json');
writeFileSync(destino, JSON.stringify({ largura: LARGURA, altura, ugrhis }) + '\n');
console.log(`${destino}: ${ugrhis.length} UGRHIs, ${readFileSync(destino).length} bytes`);
