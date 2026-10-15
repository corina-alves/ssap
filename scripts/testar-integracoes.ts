/**
 * Consulta todas as fontes externas ao vivo (sem cache) e mostra a situação.
 *   npm run integracoes:testar
 * Sai com código 1 se alguma fonte estiver fora do ar.
 */
import { verificarFontes } from '../src/lib/integracoes/status';
import { carregarEnv } from './_comum';

carregarEnv();

const ROTULO = { online: 'online', instavel: 'INSTÁVEL', offline: 'FORA DO AR' } as const;

const { fontes } = await verificarFontes(true);
for (const f of fontes) {
  const detalhe = f.detalhe ? ` — ${f.detalhe}` : '';
  console.log(`${f.nome.padEnd(26)} ${ROTULO[f.situacao].padEnd(11)} ${String(f.ms).padStart(5)} ms${detalhe}`);
}
const fora = fontes.filter((f) => f.situacao === 'offline').length;
console.log(fora ? `\n${fora} fonte(s) fora do ar.` : '\nTodas as fontes responderam.');
process.exit(fora ? 1 : 0);
