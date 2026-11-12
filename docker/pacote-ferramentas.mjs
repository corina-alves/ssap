// Gera o package.json da imagem "ferramentas" (migrações e scripts de manutenção):
// só os pacotes que os scripts usam, nas versões exatas do package-lock.json do
// projeto. O npm install que vem depois, com o package-lock.json original ao lado,
// mantém também as versões travadas das dependências deles e deixa o resto de fora.
//
//   node docker/pacote-ferramentas.mjs <pasta com package.json e package-lock.json>
//
// Os scripts (scripts/*.ts) importam pg, zod e @node-rs/argon2, e rodam com tsx.
// O next/headers aparece só como importação dinâmica dentro de try (src/lib/log.ts):
// sem o Next instalado, cai no catch. Conferido com o esbuild em 12/11/2026.
import { readFileSync, writeFileSync } from 'node:fs';

const USADOS = ['pg', 'zod', '@node-rs/argon2', 'tsx'];

const pasta = process.argv[2] ?? '.';
const pacote = JSON.parse(readFileSync(`${pasta}/package.json`, 'utf8'));
const lock = JSON.parse(readFileSync(`${pasta}/package-lock.json`, 'utf8'));

const versao = (nome) => {
  const v = lock.packages?.[`node_modules/${nome}`]?.version;
  if (!v) throw new Error(`${nome} não está no package-lock.json`);
  return v;
};

writeFileSync(
  `${pasta}/package.json`,
  JSON.stringify(
    {
      name: 'ssap-ferramentas',
      private: true,
      type: pacote.type,
      engines: pacote.engines,
      scripts: pacote.scripts,
      dependencies: Object.fromEntries(USADOS.map((n) => [n, versao(n)])),
    },
    null,
    2,
  ),
);
console.log(`ferramentas: ${USADOS.map((n) => `${n}@${versao(n)}`).join(', ')}`);
