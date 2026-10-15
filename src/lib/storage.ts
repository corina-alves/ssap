import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { env } from './env';

/**
 * Armazenamento local de arquivos, fora da pasta pública. O banco guarda só o
 * caminho relativo; os arquivos continuam no disco mesmo sem o banco.
 * (Uma implementação para Blob Storage pode seguir a mesma interface.)
 */

function raiz(): string {
  // Caminhos dinâmicos de propósito (validados em absoluto()): turbopackIgnore evita
  // que o build inclua o projeto inteiro no pacote de produção.
  return resolve(/*turbopackIgnore: true*/ env().STORAGE_DIR ?? join(process.cwd(), 'storage'));
}

/** Caminho absoluto, garantindo que fica dentro da raiz (sem "..", sem absoluto). */
export function absoluto(caminhoRelativo: string): string {
  const r = raiz();
  const abs = resolve(r, caminhoRelativo);
  if (!abs.startsWith(r + sep)) throw new Error('Caminho de arquivo fora da área de armazenamento.');
  return abs;
}

export type Gravado = { caminho: string; nomeInterno: string; tamanho: number; sha256: string };

/** Grava o conteúdo em <pasta>/<AAAA>/<MM>/<aleatório>.<ext>. */
export async function gravar(conteudo: Uint8Array, pasta: string, ext: string): Promise<Gravado> {
  if (!/^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/.test(pasta) || !/^[a-z0-9]{1,8}$/.test(ext)) {
    throw new Error('Pasta ou extensão de armazenamento inválida.');
  }
  const agora = new Date();
  const nomeInterno = `${randomBytes(16).toString('hex')}.${ext}`;
  const caminho = [pasta, String(agora.getFullYear()), String(agora.getMonth() + 1).padStart(2, '0'), nomeInterno].join('/');
  const abs = absoluto(caminho);
  await mkdir(/*turbopackIgnore: true*/ dirname(abs), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ abs, conteudo, { flag: 'wx', mode: 0o640 }); // wx: nunca sobrescreve
  return {
    caminho,
    nomeInterno,
    tamanho: conteudo.byteLength,
    sha256: createHash('sha256').update(conteudo).digest('hex'),
  };
}

/**
 * Grava com nome legível em <pasta>/<nomeBase>.<ext>; se o nome já existe,
 * tenta <nomeBase>_2, _3... (PDFs de boletim: uma pasta por tipo de boletim).
 * `ocupados`: nomes que não podem ser usados mesmo sem arquivo na pasta (já
 * registrados no banco).
 */
export async function gravarComNome(conteudo: Uint8Array, pasta: string, nomeBase: string, ext: string, ocupados: ReadonlySet<string> = new Set()): Promise<Gravado> {
  if (!/^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/.test(pasta) || !/^[a-z0-9_]{1,80}$/.test(nomeBase) || !/^[a-z0-9]{1,8}$/.test(ext)) {
    throw new Error('Pasta, nome ou extensão de armazenamento inválidos.');
  }
  await mkdir(/*turbopackIgnore: true*/ absoluto(pasta), { recursive: true });
  for (let i = 1; i <= 500; i++) {
    const nomeInterno = `${nomeBase}${i > 1 ? `_${i}` : ''}.${ext}`;
    const caminho = `${pasta}/${nomeInterno}`;
    if (ocupados.has(nomeInterno)) continue;
    try {
      await writeFile(/*turbopackIgnore: true*/ absoluto(caminho), conteudo, { flag: 'wx', mode: 0o640 }); // wx: nunca sobrescreve
      return { caminho, nomeInterno, tamanho: conteudo.byteLength, sha256: createHash('sha256').update(conteudo).digest('hex') };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new Error('Muitos arquivos com o mesmo nome nesta pasta.');
}

/** Regrava um arquivo que sumiu do disco (a partir da cópia guardada no banco). */
export async function regravar(caminho: string, conteudo: Uint8Array): Promise<void> {
  const abs = absoluto(caminho);
  await mkdir(/*turbopackIgnore: true*/ dirname(abs), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ abs, conteudo, { mode: 0o640 });
}

/** O arquivo está no disco? */
export async function existe(caminho: string): Promise<boolean> {
  return stat(/*turbopackIgnore: true*/ absoluto(caminho)).then((s) => s.isFile(), () => false);
}

/** Remove um arquivo recém-gravado (quando o registro no banco falha). */
export async function remover(caminho: string): Promise<void> {
  await rm(/*turbopackIgnore: true*/ absoluto(caminho), { force: true });
}

/** Stream do arquivo, ou null se ele não existe mais no disco. */
export async function abrir(caminho: string): Promise<{ stream: ReadableStream<Uint8Array>; tamanho: number } | null> {
  const abs = absoluto(caminho);
  try {
    const s = await stat(/*turbopackIgnore: true*/ abs);
    if (!s.isFile()) return null;
    return { stream: Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ abs)) as ReadableStream<Uint8Array>, tamanho: s.size };
  } catch {
    return null;
  }
}
