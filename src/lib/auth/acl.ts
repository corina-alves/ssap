import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { query } from '../db';
import { usuarioAtual, type UsuarioSessao } from './sessao';

export type Sala = {
  id: number;
  slug: string;
  nome: string;
  sigla: string | null;
  descricao: string | null;
  cor: string | null;
};

export type Acl = {
  usuario: UsuarioSessao;
  /** Permissões de perfis globais — valem em todas as salas. */
  globais: Set<string>;
  /** Permissões por sala (perfil que o usuário tem em cada sala). */
  porSala: Map<number, { perfil: string; permissoes: Set<string> }>;
  pode(permissao: string, salaId?: number): boolean;
  podeEmAlguma(permissao: string): boolean;
  /** Salas em que o usuário tem a permissão pelo perfil da sala (sem contar as globais). */
  salasCom(permissao: string): number[];
};

/**
 * Exige login. Sem sessão → /acesso/login. Com troca de senha pendente →
 * /acesso/trocar-senha (a não ser que a própria página seja a de troca).
 */
export async function exigirUsuario(opcoes: { permitirTrocaPendente?: boolean } = {}): Promise<UsuarioSessao> {
  const u = await usuarioAtual();
  if (!u) redirect('/acesso/login');
  if (u.deveTrocarSenha && !opcoes.permitirTrocaPendente) redirect('/acesso/trocar-senha');
  return u;
}

/** Permissões do usuário logado. Memorizado por requisição. */
export const acl = cache(async (): Promise<Acl> => {
  const usuario = await exigirUsuario();

  const globais = new Set(
    (
      await query<{ slug: string }>(
        `SELECT DISTINCT x.slug
           FROM usuario_perfis up
           JOIN perfil_permissoes pp ON pp.perfil_id = up.perfil_id
           JOIN permissoes x         ON x.id = pp.permissao_id
          WHERE up.usuario_id = $1`,
        [usuario.id],
      )
    ).map((r) => r.slug),
  );

  const porSala = new Map<number, { perfil: string; permissoes: Set<string> }>();
  const linhas = await query<{ sala_id: number; perfil: string; permissao: string | null }>(
    `SELECT us.sala_id, p.slug AS perfil, x.slug AS permissao
       FROM usuario_salas us
       JOIN salas s                  ON s.id = us.sala_id AND s.status = 'ativa' AND s.excluido_em IS NULL
       JOIN perfis p                 ON p.id = us.perfil_id
       LEFT JOIN perfil_permissoes pp ON pp.perfil_id = p.id
       LEFT JOIN permissoes x         ON x.id = pp.permissao_id
      WHERE us.usuario_id = $1`,
    [usuario.id],
  );
  for (const l of linhas) {
    const item = porSala.get(l.sala_id) ?? { perfil: l.perfil, permissoes: new Set<string>() };
    if (l.permissao) item.permissoes.add(l.permissao);
    porSala.set(l.sala_id, item);
  }

  return {
    usuario,
    globais,
    porSala,
    pode(permissao, salaId) {
      if (globais.has(permissao)) return true;
      return salaId !== undefined && (porSala.get(salaId)?.permissoes.has(permissao) ?? false);
    },
    podeEmAlguma(permissao) {
      if (globais.has(permissao)) return true;
      return [...porSala.values()].some((s) => s.permissoes.has(permissao));
    },
    salasCom(permissao) {
      return [...porSala].filter(([, s]) => s.permissoes.has(permissao)).map(([id]) => id);
    },
  };
});

/** Salas ativas em que o usuário pode ver o painel. */
export async function salasDoUsuario(): Promise<Sala[]> {
  const a = await acl();
  const salas = await query<Sala>(
    `SELECT id, slug, nome, sigla, descricao, cor
       FROM salas WHERE status = 'ativa' AND excluido_em IS NULL
      ORDER BY ordem, nome`,
  );
  return salas.filter((s) => a.pode('visualizar_dashboard', s.id));
}

export type SalaModulo = { id: number; slug: string; nome: string; sigla: string | null };

/** Salas ativas, com o módulo habilitado, em que o usuário tem a permissão. */
export async function salasComModulo(a: Acl, modulo: string, permissao: string): Promise<SalaModulo[]> {
  const salas = await query<SalaModulo>(
    `SELECT s.id, s.slug, s.nome, s.sigla
       FROM salas s
       JOIN sala_modulos sm ON sm.sala_id = s.id AND sm.ativo
       JOIN modulos m ON m.id = sm.modulo_id AND m.slug = $1
      WHERE s.status = 'ativa' AND s.excluido_em IS NULL
      ORDER BY s.ordem, s.nome`,
    [modulo],
  );
  return salas.filter((s) => a.pode(permissao, s.id));
}

/** Sem a permissão (na sala, quando informada) → página "sem acesso". */
export async function exigirPermissao(permissao: string, salaId?: number): Promise<Acl> {
  const a = await acl();
  if (!a.pode(permissao, salaId)) redirect('/acesso/sem-acesso');
  return a;
}

/** Sala pelo slug: 404 se não existe, "sem acesso" se o usuário não pode vê-la. */
export async function exigirSala(slug: string, permissao = 'visualizar_dashboard'): Promise<Sala> {
  const [sala] = await query<Sala>(
    `SELECT id, slug, nome, sigla, descricao, cor
       FROM salas WHERE slug = $1 AND status = 'ativa' AND excluido_em IS NULL`,
    [slug],
  );
  if (!sala) notFound();
  await exigirPermissao(permissao, sala.id);
  return sala;
}
