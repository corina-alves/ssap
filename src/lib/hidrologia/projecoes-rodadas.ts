import 'server-only';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { absoluto } from '../storage';
import { csvConsolidado, decodificar, lerCsv, SISTEMAS, type Registro } from './projecoes';

/**
 * Rodadas de projeção gravadas em arquivo (como no PHP, nada vai para o banco):
 * cada rodada é um CSV consolidado em <storage>/projecoes/<sistema>/, no mesmo
 * formato do dados_consolidados.csv do kit, com o índice em rodadas.json.
 */

export type Rodada = { arquivo: string; referencia: string; enviado_em: string; enviado_por: string; series: number };

const RE_ARQUIVO = /^rodada_\d{8}_\d{6}\.csv$/;

function caminho(sistema: string, arquivo: string): string {
  if (!Object.hasOwn(SISTEMAS, sistema)) throw new Error('Sistema inválido.');
  return absoluto(`projecoes/${sistema}/${arquivo}`);
}

const existe = (f: string) => stat(/*turbopackIgnore: true*/ f).then((s) => s.isFile(), () => false);

/** Rodadas do sistema, da mais recente para a mais antiga (só as que ainda têm o arquivo). */
export async function rodadas(sistema: string): Promise<Rodada[]> {
  let indice: unknown;
  try {
    indice = JSON.parse(await readFile(/*turbopackIgnore: true*/ caminho(sistema, 'rodadas.json'), 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(indice)) return [];
  const validas: Rodada[] = [];
  for (const r of indice as Partial<Rodada>[]) {
    if (typeof r?.arquivo !== 'string' || !RE_ARQUIVO.test(r.arquivo) || !(await existe(caminho(sistema, r.arquivo)))) continue;
    validas.push({
      arquivo: r.arquivo,
      referencia: String(r.referencia ?? ''),
      enviado_em: String(r.enviado_em ?? ''),
      enviado_por: String(r.enviado_por ?? ''),
      series: Number(r.series) || 0,
    });
  }
  return validas;
}

/** Texto do CSV da rodada (sem o BOM), ou null se o nome é inválido ou o arquivo não existe mais. */
export async function csvRodada(sistema: string, arquivo: string): Promise<string | null> {
  if (!RE_ARQUIVO.test(arquivo)) return null;
  try {
    return decodificar(await readFile(/*turbopackIgnore: true*/ caminho(sistema, arquivo)));
  } catch {
    return null;
  }
}

export async function carregarRodada(sistema: string, arquivo: string): Promise<Registro[]> {
  const csv = await csvRodada(sistema, arquivo);
  return csv === null ? [] : lerCsv(csv, arquivo);
}

/** Grava a rodada consolidada e devolve o nome do arquivo. */
export async function salvarRodada(sistema: string, registros: Registro[], referencia: string, enviadoPor: string): Promise<string> {
  // Data e hora de São Paulo, como "2026-09-28 14:07:54".
  const agora = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
  const arquivo = `rodada_${agora.replace(/[-:]/g, '').replace(' ', '_')}.csv`;
  const destino = caminho(sistema, arquivo);
  await mkdir(/*turbopackIgnore: true*/ caminho(sistema, ''), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ destino, csvConsolidado(registros), { flag: 'wx', mode: 0o640 }); // wx: nunca sobrescreve

  const indice: Rodada[] = [
    {
      arquivo,
      referencia: [...referencia].slice(0, 120).join(''),
      enviado_em: agora,
      enviado_por: enviadoPor,
      series: new Set(registros.map((r) => `${r.esi}|${r.qn}`)).size,
    },
    ...(await rodadas(sistema)),
  ];
  await writeFile(/*turbopackIgnore: true*/ caminho(sistema, 'rodadas.json'), JSON.stringify(indice, null, 4));
  return arquivo;
}
