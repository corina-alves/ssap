import 'server-only';
import { obterArquivo, type Arquivo } from './arquivos';
import { query, queryOne } from './db';

/**
 * Consultas do site público. Só leem a camada de publicação
 * (vw_boletins_publicados): boletim publicado, tipo público, sala ativa.
 */

export type BoletimPublico = {
  id: string;
  sala_slug: string;
  sala_nome: string;
  tipo_slug: string;
  tipo_nome: string;
  periodicidade: string;
  titulo: string;
  data_referencia: string;
  competencia: string | null;
  publicado_em: Date;
  pdf_tamanho: string;
  pdf_sha256: string;
};

export type FiltrosPublicos = { sala?: string; tipo?: string; tipos?: string[]; busca?: string; de?: string; ate?: string };

const SLUG = /^[a-z0-9-]{1,60}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function listarPublicados(
  f: FiltrosPublicos,
  limite: number,
  offset = 0,
): Promise<{ itens: BoletimPublico[]; total: number }> {
  const w: string[] = [];
  const p: unknown[] = [];
  const add = (sql: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(sql(`$${p.length}`));
  };
  if (f.sala && SLUG.test(f.sala)) add((n) => `sala_slug = ${n}`, f.sala);
  if (f.tipo && SLUG.test(f.tipo)) add((n) => `tipo_slug = ${n}`, f.tipo);
  if (f.tipos?.length) add((n) => `tipo_slug = ANY(${n}::text[])`, f.tipos.filter((t) => SLUG.test(t)));
  // Busca no título, na data (dd/mm/aaaa) e no período (AAAA-MM ou MM/AAAA), como no PHP.
  if (f.busca) {
    add(
      (n) =>
        `(titulo ILIKE ${n} OR to_char(data_referencia, 'DD/MM/YYYY') ILIKE ${n} OR coalesce(competencia, '') ILIKE ${n}
          OR coalesce(substr(competencia, 6, 2) || '/' || substr(competencia, 1, 4), '') ILIKE ${n})`,
      `%${f.busca.replace(/[\\%_]/g, (m) => `\\${m}`)}%`,
    );
  }
  if (f.de && DATA.test(f.de)) add((n) => `data_referencia >= ${n}::date`, f.de);
  if (f.ate && DATA.test(f.ate)) add((n) => `data_referencia <= ${n}::date`, f.ate);
  const where = w.length ? `WHERE ${w.join(' AND ')}` : '';

  const total = (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM vw_boletins_publicados ${where}`, p))?.n ?? 0;
  const itens = await query<BoletimPublico>(
    `SELECT id::text, sala_slug, sala_nome, tipo_slug, tipo_nome, periodicidade, titulo,
            to_char(data_referencia, 'YYYY-MM-DD') AS data_referencia, competencia, publicado_em,
            pdf_tamanho::text, pdf_sha256
       FROM vw_boletins_publicados ${where}
      ORDER BY data_referencia DESC, publicado_em DESC
      LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
    [...p, limite, offset],
  );
  return { itens, total };
}

/** Salas e tipos que têm boletins publicados (para os filtros). */
export async function opcoesPublicas(): Promise<{ salas: { slug: string; nome: string }[]; tipos: { slug: string; nome: string; sala_slug: string }[] }> {
  const [salas, tipos] = await Promise.all([
    query<{ slug: string; nome: string }>(
      'SELECT DISTINCT sala_slug AS slug, sala_nome AS nome FROM vw_boletins_publicados ORDER BY nome',
    ),
    query<{ slug: string; nome: string; sala_slug: string }>(
      'SELECT DISTINCT tipo_slug AS slug, tipo_nome AS nome, sala_slug FROM vw_boletins_publicados ORDER BY nome',
    ),
  ]);
  return { salas, tipos };
}

/** Arquivo do boletim, somente se ele estiver publicado. */
export async function arquivoPublico(boletimId: number): Promise<Arquivo | null> {
  const r = await queryOne<{ pdf_arquivo_id: string }>(
    'SELECT pdf_arquivo_id::text FROM vw_boletins_publicados WHERE id = $1',
    [boletimId],
  );
  return r ? obterArquivo(r.pdf_arquivo_id) : null;
}

/** Quantidade de boletins publicados por tipo (para o filtro "Tipo de boletim"). */
export async function contagemPorTipo(sala?: string): Promise<{ slug: string; nome: string; total: number }[]> {
  return query<{ slug: string; nome: string; total: number }>(
    `SELECT tipo_slug AS slug, min(tipo_nome) AS nome, count(*)::int AS total
       FROM vw_boletins_publicados WHERE ($1::text IS NULL OR sala_slug = $1)
      GROUP BY tipo_slug ORDER BY min(tipo_nome)`,
    [sala ?? null],
  );
}

/** Títulos dos boletins publicados (os mais recentes primeiro), para o autocompletar da busca. */
export async function sugestoesBoletins(tipos?: string[]): Promise<string[]> {
  const filtro = tipos?.length ? tipos.filter((t) => SLUG.test(t)) : null;
  const r = await query<{ titulo: string }>(
    `SELECT titulo FROM vw_boletins_publicados
      WHERE $1::text[] IS NULL OR tipo_slug = ANY($1::text[])
      GROUP BY titulo ORDER BY max(data_referencia) DESC LIMIT 300`,
    [filtro],
  );
  return r.map((x) => x.titulo);
}
