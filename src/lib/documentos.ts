import 'server-only';
import { ErroUpload, FORMATOS_DOCUMENTO, lerArquivoEnviado, registrarArquivo, removerDoDisco } from './arquivos';
import { auditar } from './auditoria';
import { salasComModulo, type Acl, type SalaModulo } from './auth/acl';
import { query, queryOne, transacao } from './db';
import type { Origem } from './requisicao';

/**
 * Documentos da sala (notas técnicas, relatórios, atas...).
 * Categorias: as comuns a todas as salas (sala_id NULL) + as da própria sala.
 * Exclusão lógica; o arquivo continua no disco para rastreabilidade.
 * Permissões, sempre na sala do documento: visualizar_documentos,
 * enviar_documentos (enviar e editar) e excluir_documentos.
 */

export const FORMATOS_ACEITOS = Object.keys(FORMATOS_DOCUMENTO).map((e) => e.toUpperCase()).join(', ');

export type Autor = { id: number; nome: string };
type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erros: string[] };

export function salasDocumentos(a: Acl, permissao: string): Promise<SalaModulo[]> {
  return salasComModulo(a, 'documentos', permissao);
}

export type Categoria = { id: number; sala_id: number | null; nome: string };

/** Categorias comuns (sala_id NULL) + as das salas informadas. */
export async function categorias(salaIds: number[]): Promise<Categoria[]> {
  return query<Categoria>(
    `SELECT id, sala_id, nome FROM documento_categorias
      WHERE sala_id IS NULL OR sala_id = ANY($1::int[]) ORDER BY sala_id NULLS FIRST, ordem, nome`,
    [salaIds],
  );
}

export type FiltrosDocumentos = { salaId?: number; categoriaId?: number; busca?: string };

export type ItemDocumento = {
  id: string;
  titulo: string;
  descricao: string | null;
  data: string;
  publico: boolean;
  sala: string;
  categoria_nome: string | null;
  nome_original: string;
  mime: string;
  tamanho: string;
  enviado_por_nome: string | null;
};

export async function listar(
  salas: number[],
  f: FiltrosDocumentos,
  pagina: number,
  porPagina = 20,
): Promise<{ itens: ItemDocumento[]; total: number }> {
  if (!salas.length) return { itens: [], total: 0 };
  const w = ['d.excluido_em IS NULL', 'd.sala_id = ANY($1::int[])'];
  const p: unknown[] = [salas];
  const add = (sql: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(sql(`$${p.length}`));
  };
  if (f.salaId) add((n) => `d.sala_id = ${n}`, f.salaId);
  if (f.categoriaId) add((n) => `d.categoria_id = ${n}`, f.categoriaId);
  if (f.busca) {
    add((n) => `(d.titulo ILIKE ${n} OR d.descricao ILIKE ${n})`, `%${f.busca.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  }
  const where = w.join(' AND ');
  const total = (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM documentos d WHERE ${where}`, p))?.n ?? 0;
  const itens = await query<ItemDocumento>(
    `SELECT d.id::text, d.titulo, d.descricao,
            to_char(coalesce(d.data_documento, (d.criado_em AT TIME ZONE 'America/Sao_Paulo')::date), 'YYYY-MM-DD') AS data,
            d.publico, coalesce(s.sigla, s.nome) AS sala, c.nome AS categoria_nome,
            a.nome_original, a.mime, a.tamanho::text, u.nome AS enviado_por_nome
       FROM documentos d
       JOIN salas s ON s.id = d.sala_id
       JOIN arquivos a ON a.id = d.arquivo_id
       LEFT JOIN documento_categorias c ON c.id = d.categoria_id
       LEFT JOIN usuarios u ON u.id = d.criado_por
      WHERE ${where}
      ORDER BY coalesce(d.data_documento, d.criado_em::date) DESC, d.id DESC
      LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
    [...p, porPagina, Math.max(0, (pagina - 1) * porPagina)],
  );
  return { itens, total };
}

export type Documento = {
  id: string;
  sala_id: number;
  sala_slug: string;
  sala_nome: string;
  categoria_id: number | null;
  categoria_nome: string | null;
  titulo: string;
  descricao: string | null;
  data_documento: string | null;
  publico: boolean;
  arquivo_id: string;
  nome_original: string;
  mime: string;
  tamanho: string;
  criado_em: Date;
  atualizado_em: Date | null;
  criado_por_nome: string | null;
  atualizado_por_nome: string | null;
};

export async function obter(id: number): Promise<Documento | null> {
  return queryOne<Documento>(
    `SELECT d.id::text, d.sala_id, s.slug AS sala_slug, s.nome AS sala_nome, d.categoria_id, c.nome AS categoria_nome,
            d.titulo, d.descricao, to_char(d.data_documento, 'YYYY-MM-DD') AS data_documento, d.publico,
            d.arquivo_id::text, a.nome_original, a.mime, a.tamanho::text, d.criado_em, d.atualizado_em,
            uc.nome AS criado_por_nome, ua.nome AS atualizado_por_nome
       FROM documentos d
       JOIN salas s ON s.id = d.sala_id
       JOIN arquivos a ON a.id = d.arquivo_id
       LEFT JOIN documento_categorias c ON c.id = d.categoria_id
       LEFT JOIN usuarios uc ON uc.id = d.criado_por
       LEFT JOIN usuarios ua ON ua.id = d.atualizado_por
      WHERE d.id = $1 AND d.excluido_em IS NULL`,
    [id],
  );
}

export type DadosDocumento = {
  salaId: number;
  categoriaId: number;
  titulo: string;
  descricao: string;
  dataDocumento: string;
  publico: boolean;
};

/** Cria (id null, arquivo obrigatório) ou edita (arquivo opcional: substitui). */
export async function salvar(
  a: Acl,
  id: number | null,
  d: DadosDocumento,
  arquivoForm: FormDataEntryValue | null,
  autor: Autor,
  origem: Origem,
): Promise<Resultado<{ id: number; mudou: boolean }>> {
  const antes = id ? await obter(id) : null;
  if (id && !antes) return { ok: false, erros: ['Documento não encontrado.'] };
  const salaId = antes ? antes.sala_id : d.salaId; // a sala não muda na edição

  const permitidas = await salasDocumentos(a, 'enviar_documentos');
  const sala = permitidas.find((s) => s.id === salaId);
  if (!sala) return { ok: false, erros: [antes ? 'Sem permissão para editar documentos desta sala.' : 'Selecione uma sala válida.'] };

  const erros: string[] = [];
  const titulo = d.titulo.trim();
  const descricao = d.descricao.trim();
  if ([...titulo].length < 3 || [...titulo].length > 255) erros.push('Título: informe de 3 a 255 caracteres.');
  if ([...descricao].length > 2000) erros.push('Descrição: no máximo 2000 caracteres.');
  if (d.dataDocumento && !/^\d{4}-\d{2}-\d{2}$/.test(d.dataDocumento)) erros.push('Data do documento inválida.');
  if (d.categoriaId && !(await categorias([salaId])).some((c) => c.id === d.categoriaId)) erros.push('Categoria inválida para esta sala.');
  let arquivo: Awaited<ReturnType<typeof lerArquivoEnviado>> = null;
  try {
    arquivo = await lerArquivoEnviado(arquivoForm, FORMATOS_DOCUMENTO, { obrigatorio: !antes });
  } catch (e) {
    if (!(e instanceof ErroUpload)) throw e;
    erros.push(e.message);
  }
  if (erros.length) return { ok: false, erros };

  const valores = [titulo, descricao || null, d.categoriaId || null, d.dataDocumento || null, d.publico];
  if (antes) {
    const igual =
      titulo === antes.titulo &&
      (descricao || null) === antes.descricao &&
      (d.categoriaId || null) === antes.categoria_id &&
      (d.dataDocumento || null) === antes.data_documento &&
      d.publico === antes.publico;
    if (igual && !arquivo) return { ok: true, id: Number(antes.id), mudou: false };
  }

  const gravados: string[] = [];
  try {
    const novoId = await transacao(async (c) => {
      let arquivoId: number | null = null;
      if (arquivo) {
        const r = await registrarArquivo(arquivo, { salaId, pasta: `documentos/${sala.slug}`, usuarioId: autor.id }, c);
        gravados.push(r.caminho);
        arquivoId = r.id;
      }
      let docId: number;
      if (antes) {
        await c.query(
          `UPDATE documentos SET titulo = $2, descricao = $3, categoria_id = $4, data_documento = $5, publico = $6,
                  atualizado_por = $7, arquivo_id = coalesce($8, arquivo_id)
            WHERE id = $1 AND excluido_em IS NULL`,
          [antes.id, ...valores, autor.id, arquivoId],
        );
        docId = Number(antes.id);
      } else {
        const r = await c.query<{ id: string }>(
          `INSERT INTO documentos (sala_id, titulo, descricao, categoria_id, data_documento, publico, arquivo_id, criado_por, atualizado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
          [salaId, ...valores, arquivoId, autor.id],
        );
        docId = Number(r.rows[0]!.id);
      }
      const resumo = async () =>
        (
          await c.query(
            `SELECT d.titulo, c.nome AS categoria, to_char(d.data_documento, 'YYYY-MM-DD') AS data, d.publico,
                    a.nome_original AS arquivo, a.sha256
               FROM documentos d JOIN arquivos a ON a.id = d.arquivo_id
               LEFT JOIN documento_categorias c ON c.id = d.categoria_id WHERE d.id = $1`,
            [docId],
          )
        ).rows[0];
      await auditar(
        {
          modulo: 'documentos',
          acao: antes ? (arquivoId ? 'substituir_arquivo' : 'editar') : 'enviar',
          entidade: 'documentos', entidadeId: docId, salaId,
          descricao: `${antes ? 'Documento alterado' : 'Documento enviado'}: ${titulo}`,
          antes: antes ? { titulo: antes.titulo, categoria: antes.categoria_nome, data: antes.data_documento, publico: antes.publico, arquivo: antes.nome_original } : undefined,
          depois: await resumo(), usuario: autor, ...origem,
        },
        c,
      );
      return docId;
    });
    return { ok: true, id: novoId, mudou: true };
  } catch (e) {
    await Promise.all(gravados.map((g) => removerDoDisco(g).catch(() => {})));
    throw e;
  }
}

export async function excluir(a: Acl, id: number, autor: Autor, origem: Origem): Promise<string[]> {
  const d = await obter(id);
  if (!d) return ['Documento não encontrado.'];
  if (!(await salasDocumentos(a, 'excluir_documentos')).some((s) => s.id === d.sala_id)) {
    return ['Sem permissão para excluir documentos desta sala.'];
  }
  await transacao(async (c) => {
    await c.query('UPDATE documentos SET excluido_em = now(), excluido_por = $2 WHERE id = $1 AND excluido_em IS NULL', [id, autor.id]);
    await auditar(
      { modulo: 'documentos', acao: 'excluir', entidade: 'documentos', entidadeId: id, salaId: d.sala_id,
        descricao: `Documento excluído: ${d.titulo}`, antes: { titulo: d.titulo, arquivo: d.nome_original },
        usuario: autor, ...origem },
      c,
    );
  });
  return [];
}

// ---------------------------------------------------------------------------
// Site público (só vw_documentos_publicos)
// ---------------------------------------------------------------------------

export type DocumentoPublico = {
  id: string;
  sala_slug: string;
  sala_nome: string;
  categoria_slug: string | null;
  categoria_nome: string | null;
  titulo: string;
  descricao: string | null;
  data: string;
  mime: string;
  tamanho: string;
  sha256: string;
};

export async function listarPublicos(
  f: { sala?: string; categoria?: string; busca?: string },
  limite: number,
  offset = 0,
): Promise<{ itens: DocumentoPublico[]; total: number }> {
  const w: string[] = [];
  const p: unknown[] = [];
  const add = (sql: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(sql(`$${p.length}`));
  };
  if (f.sala && /^[a-z0-9-]{1,60}$/.test(f.sala)) add((n) => `sala_slug = ${n}`, f.sala);
  if (f.categoria && /^[a-z0-9-]{1,60}$/.test(f.categoria)) add((n) => `categoria_slug = ${n}`, f.categoria);
  if (f.busca) add((n) => `(titulo ILIKE ${n} OR descricao ILIKE ${n})`, `%${f.busca.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const total = (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM vw_documentos_publicos ${where}`, p))?.n ?? 0;
  const itens = await query<DocumentoPublico>(
    `SELECT id::text, sala_slug, sala_nome, categoria_slug, categoria_nome, titulo, descricao,
            to_char(coalesce(data_documento, (criado_em AT TIME ZONE 'America/Sao_Paulo')::date), 'YYYY-MM-DD') AS data,
            mime, tamanho::text, sha256
       FROM vw_documentos_publicos ${where}
      ORDER BY coalesce(data_documento, criado_em::date) DESC, id DESC
      LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
    [...p, limite, offset],
  );
  return { itens, total };
}

export async function opcoesPublicas() {
  const [salas, cats] = await Promise.all([
    query<{ slug: string; nome: string }>('SELECT DISTINCT sala_slug AS slug, sala_nome AS nome FROM vw_documentos_publicos ORDER BY nome'),
    query<{ slug: string; nome: string }>(
      'SELECT DISTINCT categoria_slug AS slug, categoria_nome AS nome FROM vw_documentos_publicos WHERE categoria_slug IS NOT NULL ORDER BY nome',
    ),
  ]);
  return { salas, categorias: cats };
}

/** id do arquivo do documento, somente se ele for público. */
export async function arquivoPublicoId(documentoId: number): Promise<string | null> {
  const r = await queryOne<{ arquivo_id: string }>('SELECT arquivo_id::text FROM vw_documentos_publicos WHERE id = $1', [documentoId]);
  return r?.arquivo_id ?? null;
}

/** Títulos dos documentos das salas (os mais recentes primeiro), para o autocompletar da busca. */
export async function sugestoesTitulos(salas: number[]): Promise<string[]> {
  if (!salas.length) return [];
  const r = await query<{ titulo: string }>(
    `SELECT titulo FROM documentos WHERE excluido_em IS NULL AND sala_id = ANY($1::int[])
      GROUP BY titulo ORDER BY max(id) DESC LIMIT 300`,
    [salas],
  );
  return r.map((x) => x.titulo);
}

/** Títulos dos documentos publicados, para o autocompletar da busca do site. */
export async function sugestoesPublicas(): Promise<string[]> {
  const r = await query<{ titulo: string }>('SELECT titulo FROM vw_documentos_publicos GROUP BY titulo ORDER BY max(id) DESC LIMIT 300');
  return r.map((x) => x.titulo);
}
