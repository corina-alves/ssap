import 'server-only';
import { auditar } from '../auditoria';
import { query, queryOne, transacao } from '../db';
import type { Origem } from '../requisicao';
import type { Autor } from './usuarios';
import { Validador } from './validacao';

/**
 * Perfis e matriz perfil × permissão.
 * O Administrador do Sistema tem sempre todas as permissões (não editável),
 * para ninguém trancar o próprio sistema por engano.
 */
export const ADMIN = 'admin_sistema';

export type PerfilLista = {
  id: number;
  slug: string;
  nome: string;
  descricao: string | null;
  escopo: 'global' | 'sala';
  sistema: boolean;
  em_uso: number;
};

export type Permissao = { id: number; slug: string; modulo: string; descricao: string | null };

export const ROTULO_MODULO: Record<string, string> = {
  painel: 'Painel',
  boletins: 'Boletins',
  graficos: 'Gráficos',
  documentos: 'Documentos',
  previsoes: 'Previsões',
  sistema: 'Sistema',
};

export async function listarPerfis(): Promise<PerfilLista[]> {
  return query<PerfilLista>(
    `SELECT p.id, p.slug, p.nome, p.descricao, p.escopo, p.sistema,
            (SELECT count(*) FROM usuario_perfis up WHERE up.perfil_id = p.id)::int
          + (SELECT count(*) FROM usuario_salas us WHERE us.perfil_id = p.id)::int AS em_uso
       FROM perfis p
      ORDER BY p.escopo = 'global' DESC, p.id`,
  );
}

export async function permissoesPorModulo(): Promise<[string, Permissao[]][]> {
  const grupos = new Map<string, Permissao[]>();
  for (const p of await query<Permissao>('SELECT id, slug, modulo, descricao FROM permissoes ORDER BY ordem, slug')) {
    grupos.set(p.modulo, [...(grupos.get(p.modulo) ?? []), p]);
  }
  return [...grupos];
}

/** perfil_id → ids das permissões */
export async function matriz(): Promise<Record<number, number[]>> {
  const m: Record<number, number[]> = {};
  for (const l of await query<{ perfil_id: number; permissao_id: number }>(
    'SELECT perfil_id, permissao_id FROM perfil_permissoes ORDER BY permissao_id',
  )) {
    (m[l.perfil_id] ??= []).push(l.permissao_id);
  }
  return m;
}

/** Grava a matriz inteira. `marcados`: perfil_id → ids marcados no formulário. */
export async function salvarMatriz(marcados: Record<number, number[]>, autor: Autor, origem: Origem): Promise<boolean> {
  const perfis = await listarPerfis();
  const validas = new Set((await query<{ id: number }>('SELECT id FROM permissoes')).map((r) => r.id));
  const antes = await legivel();

  await transacao(async (c) => {
    for (const p of perfis) {
      const lista = p.slug === ADMIN ? [...validas] : [...new Set(marcados[p.id] ?? [])].filter((x) => validas.has(x));
      await c.query('DELETE FROM perfil_permissoes WHERE perfil_id = $1', [p.id]);
      if (lista.length) {
        await c.query(
          'INSERT INTO perfil_permissoes (perfil_id, permissao_id) SELECT $1, unnest($2::int[])',
          [p.id, lista],
        );
      }
    }
  });

  const depois = await legivel();
  const mudou = JSON.stringify(antes) !== JSON.stringify(depois);
  if (mudou) {
    await auditar({
      modulo: 'permissoes', acao: 'editar_matriz', entidade: 'perfil_permissoes',
      descricao: 'Matriz de permissões alterada', antes, depois, usuario: autor, ...origem,
    });
  }
  return mudou;
}

export type DadosPerfil = { slug: string; nome: string; descricao: string; escopo: string };

export async function criarPerfil(
  d: DadosPerfil,
  autor: Autor,
  origem: Origem,
): Promise<{ ok: true; id: number } | { ok: false; erros: string[] }> {
  const slug = d.slug.toLowerCase();
  const v = new Validador()
    .tamanho(d.nome, 'Nome', 3, 80)
    .formato(slug, /^[a-z][a-z0-9_]{1,39}$/, 'Identificador: letras minúsculas, números e sublinhado, começando por letra (ex.: tecnico_campo).')
    .tamanho(d.descricao, 'Descrição', 0, 255)
    .emLista(d.escopo, ['sala', 'global'], 'Escopo');
  if (await queryOne('SELECT 1 FROM perfis WHERE slug = $1', [slug])) v.se(true, 'Já existe um perfil com este identificador.');
  if (!v.ok) return { ok: false, erros: v.erros };

  const r = await queryOne<{ id: number }>(
    `INSERT INTO perfis (slug, nome, descricao, escopo, sistema) VALUES ($1, $2, $3, $4, false) RETURNING id`,
    [slug, d.nome, d.descricao || null, d.escopo],
  );
  await auditar({
    modulo: 'permissoes', acao: 'criar_perfil', entidade: 'perfis', entidadeId: r!.id,
    descricao: `Perfil criado: ${d.nome} (${d.escopo})`, usuario: autor, ...origem,
  });
  return { ok: true, id: r!.id };
}

export async function excluirPerfil(id: number, autor: Autor, origem: Origem): Promise<string[]> {
  const p = (await listarPerfis()).find((x) => x.id === id);
  if (!p) return ['Perfil não encontrado.'];
  if (p.sistema) return ['Perfis de fábrica não podem ser excluídos.'];
  if (p.em_uso > 0) {
    return [`O perfil está atribuído a ${p.em_uso} vínculo(s) de usuário. Troque o perfil desses usuários antes de excluir.`];
  }
  try {
    await query('DELETE FROM perfis WHERE id = $1', [id]);
  } catch (e) {
    // Atribuído por outra pessoa entre a conferência e a exclusão (FK RESTRICT).
    if ((e as { code?: string }).code === '23503') return ['O perfil acabou de ser atribuído a um usuário.'];
    throw e;
  }
  await auditar({
    modulo: 'permissoes', acao: 'excluir_perfil', entidade: 'perfis', entidadeId: id,
    descricao: `Perfil excluído: ${p.nome}`, antes: p, usuario: autor, ...origem,
  });
  return [];
}

/** Matriz com slugs, para a auditoria ser legível. */
async function legivel(): Promise<Record<string, string[]>> {
  const linhas = await query<{ perfil: string; permissoes: string[] }>(
    `SELECT p.slug AS perfil, coalesce(array_agg(x.slug ORDER BY x.slug) FILTER (WHERE x.slug IS NOT NULL), '{}') AS permissoes
       FROM perfis p
       LEFT JOIN perfil_permissoes pp ON pp.perfil_id = p.id
       LEFT JOIN permissoes x ON x.id = pp.permissao_id
      GROUP BY p.slug ORDER BY p.slug`,
  );
  return Object.fromEntries(linhas.map((l) => [l.perfil, l.permissoes]));
}
