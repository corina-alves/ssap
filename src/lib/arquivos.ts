import 'server-only';
import type pg from 'pg';
import { UPLOAD } from './config';
import { pool, queryOne } from './db';
import { createHash } from 'node:crypto';
import { abrir, existe, gravar, gravarComNome, regravar, remover } from './storage';

export { remover as removerDoDisco };

/**
 * Uploads: extensão em lista branca E assinatura do conteúdo (nunca o tipo que
 * o navegador informa); limite de tamanho; nome interno aleatório; SHA-256.
 * Download só por rota que confere a permissão antes.
 */

export type Arquivo = {
  id: string;
  sala_id: number | null;
  nome_original: string;
  caminho: string;
  mime: string;
  tamanho: string;
  sha256: string;
  criado_em: Date;
};

export class ErroUpload extends Error {}

const LIMITE_MB = Math.round(UPLOAD.maxBytes / 1024 / 1024);

/** Nome original só para exibição: sem caminho, sem caracteres de controle, tamanho limitado. */
export function nomeSeguro(nome: string): string {
  const base = nome.replaceAll('\\', '/').split('/').pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const limpo = base.replace(/[\x00-\x1f\x7f"<>|:*?]/g, '').replace(/^[.\s]+|[.\s]+$/g, '');
  return [...(limpo || 'arquivo')].slice(0, 200).join('');
}

/** Formato aceito: MIME gravado e conferência do conteúdo (assinatura). */
type Formato = { mime: string; confere: (c: Uint8Array) => boolean };

const comeca = (c: Uint8Array, ...bytes: number[]) => bytes.every((b, i) => c[i] === b);
const ehPdf = (c: Uint8Array) => comeca(c, 0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
const ehZip = (c: Uint8Array) => comeca(c, 0x50, 0x4b, 0x03, 0x04); // PK.. (zip e Office)
/** Texto (CSV/TXT, em UTF-8 ou Latin-1): sem byte nulo nos primeiros 64 KB, ou seja, não é binário. */
const ehTexto = (c: Uint8Array) => !c.subarray(0, 64 * 1024).includes(0);

export const FORMATOS_PDF: Record<string, Formato> = {
  pdf: { mime: 'application/pdf', confere: ehPdf },
};

export const FORMATOS_DOCUMENTO: Record<string, Formato> = {
  ...FORMATOS_PDF,
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', confere: ehZip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', confere: ehZip },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', confere: ehZip },
  zip: { mime: 'application/zip', confere: ehZip },
  csv: { mime: 'text/csv', confere: ehTexto },
  txt: { mime: 'text/plain', confere: ehTexto },
  png: { mime: 'image/png', confere: (c) => comeca(c, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) },
  jpg: { mime: 'image/jpeg', confere: (c) => comeca(c, 0xff, 0xd8, 0xff) },
  jpeg: { mime: 'image/jpeg', confere: (c) => comeca(c, 0xff, 0xd8, 0xff) },
};

export type Enviado = { nome: string; conteudo: Uint8Array; mime: string; ext: string };

/**
 * Valida um arquivo vindo de formulário: extensão em lista branca e
 * assinatura do conteúdo compatível. Lança ErroUpload com mensagem para o usuário.
 */
export async function lerArquivoEnviado(
  v: FormDataEntryValue | null,
  formatos: Record<string, Formato>,
  opcoes: { obrigatorio: boolean; rotulo?: string },
): Promise<Enviado | null> {
  if (!(v instanceof File) || v.size === 0) {
    // campo sem nada escolhido chega como um File vazio sem nome de arquivo de verdade ("", "undefined", "blob")
    if (v instanceof File && /\.[a-z0-9]{1,8}$/i.test(v.name) && v.size === 0) throw new ErroUpload('O arquivo está vazio.');
    if (opcoes.obrigatorio) throw new ErroUpload(`Selecione ${opcoes.rotulo ?? 'o arquivo'}.`);
    return null;
  }
  if (v.size > UPLOAD.maxBytes) throw new ErroUpload(`Arquivo maior que o limite de ${LIMITE_MB} MB.`);
  const nome = nomeSeguro(v.name);
  const ext = /\.([a-z0-9]{1,8})$/i.exec(nome)?.[1]?.toLowerCase() ?? '';
  const formato = Object.hasOwn(formatos, ext) ? formatos[ext]! : null;
  if (!formato) {
    const aceitos = Object.keys(formatos).map((e) => e.toUpperCase()).join(', ');
    throw new ErroUpload(aceitos === 'PDF' ? 'Envie um arquivo PDF (.pdf).' : `Tipo de arquivo não permitido. Aceitos: ${aceitos}.`);
  }
  const conteudo = new Uint8Array(await v.arrayBuffer());
  if (!formato.confere(conteudo)) {
    throw new ErroUpload(ext === 'pdf' ? 'O arquivo não é um PDF válido.' : `O conteúdo do arquivo não corresponde à extensão .${ext}.`);
  }
  return { nome, conteudo, mime: formato.mime, ext };
}

/** PDF de boletim. */
export function lerPdfEnviado(v: FormDataEntryValue | null, obrigatorio: boolean): Promise<Enviado | null> {
  return lerArquivoEnviado(v, FORMATOS_PDF, { obrigatorio, rotulo: 'o arquivo PDF do boletim' });
}

/**
 * Grava o arquivo no disco e registra em `arquivos` (na transação `c`, se houver).
 * Se o registro falhar, o arquivo gravado é apagado.
 */
export async function registrarArquivo(
  a: { nome: string; conteudo: Uint8Array; mime: string; ext: string },
  destino: {
    salaId: number | null;
    pasta: string;
    usuarioId: number;
    /** PDF de boletim: nome legível (<nomeBase>.pdf, na pasta do tipo) e cópia do conteúdo no banco. */
    nomeBase?: string;
  },
  c?: pg.PoolClient,
): Promise<{ id: number; caminho: string }> {
  let g;
  if (destino.nomeBase) {
    // o nome é único no banco: pula também os já registrados cujo arquivo não está mais na pasta
    const usados = await pool().query<{ nome_interno: string }>('SELECT nome_interno FROM arquivos WHERE nome_interno LIKE $1', [`${destino.nomeBase}%`]);
    g = await gravarComNome(a.conteudo, destino.pasta, destino.nomeBase, a.ext, new Set(usados.rows.map((r) => r.nome_interno)));
  } else {
    g = await gravar(a.conteudo, destino.pasta, a.ext);
  }
  try {
    const executor = c ?? pool();
    const r = await executor.query<{ id: string }>(
      `INSERT INTO arquivos (sala_id, origem, nome_original, nome_interno, caminho, mime, tamanho, sha256, enviado_por)
       VALUES ($1, 'upload', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [destino.salaId, a.nome, g.nomeInterno, g.caminho, a.mime, g.tamanho, g.sha256, destino.usuarioId],
    );
    if (destino.nomeBase) {
      await executor.query('INSERT INTO arquivos_conteudo (arquivo_id, dados) VALUES ($1, $2)', [r.rows[0]!.id, Buffer.from(a.conteudo)]);
    }
    return { id: Number(r.rows[0]!.id), caminho: g.caminho };
  } catch (e) {
    await remover(g.caminho).catch(() => {});
    throw e;
  }
}

export async function obterArquivo(id: number | string | null): Promise<Arquivo | null> {
  if (id == null) return null;
  return queryOne<Arquivo>(
    `SELECT id::text, sala_id, nome_original, caminho, mime, tamanho::text, sha256, criado_em
       FROM arquivos WHERE id = $1 AND excluido_em IS NULL`,
    [id],
  );
}

/** Onde o arquivo está guardado: na pasta (disco) e/ou com cópia no banco. */
export async function situacaoArquivo(a: Arquivo): Promise<{ naPasta: boolean; noBanco: boolean }> {
  const [naPasta, copia] = await Promise.all([existe(a.caminho), queryOne('SELECT 1 FROM arquivos_conteudo WHERE arquivo_id = $1', [a.id])]);
  return { naPasta, noBanco: !!copia };
}

/** Regrava na pasta um arquivo que sumiu, se houver cópia no banco e ela conferir com o SHA-256 registrado. */
export async function restaurarDoBanco(a: Arquivo): Promise<boolean> {
  const r = await queryOne<{ dados: Buffer }>('SELECT dados FROM arquivos_conteudo WHERE arquivo_id = $1', [a.id]);
  if (!r || createHash('sha256').update(r.dados).digest('hex') !== a.sha256) return false;
  await regravar(a.caminho, r.dados);
  return true;
}

const MIME_INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg']);

/**
 * Resposta HTTP com o arquivo. A permissão deve ter sido conferida ANTES.
 * Abre no navegador só PDF e imagens raster (nunca HTML/SVG).
 */
export async function respostaArquivo(
  a: Arquivo,
  opcoes: { inline?: boolean; publico?: boolean } = {},
): Promise<Response> {
  let aberto = await abrir(a.caminho);
  // sumiu da pasta: regrava a partir da cópia do banco (PDFs de boletim) e segue
  if (!aberto && (await restaurarDoBanco(a))) aberto = await abrir(a.caminho);
  if (!aberto) return new Response('Arquivo não encontrado.', { status: 404 });
  const inline = (opcoes.inline ?? true) && MIME_INLINE.has(a.mime);
  const ascii = a.nome_original.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/[^A-Za-z0-9._-]/g, '_') || 'arquivo';
  return new Response(aberto.stream, {
    headers: {
      'Content-Type': a.mime,
      'Content-Length': String(aberto.tamanho),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.nome_original)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': opcoes.publico ? 'public, max-age=300' : 'private, no-store',
      ETag: `"${a.sha256}"`,
    },
  });
}
