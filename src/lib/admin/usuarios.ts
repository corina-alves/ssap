import 'server-only';
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { auditar } from '../auditoria';
import { gerarToken, VALIDADE_HORAS } from '../auth/redefinicao';
import { hashSenha } from '../auth/senha';
import { revogarSessoes } from '../auth/sessao';
import { query, queryOne, transacao } from '../db';
import type { Origem } from '../requisicao';

/**
 * Cadastro de usuários e dos seus vínculos (perfis globais e perfil por sala).
 *
 * Regras (as mesmas da referência):
 *  - ninguém desativa, exclui ou tira o próprio perfil de administrador;
 *  - o sistema nunca fica sem pelo menos um Administrador do Sistema ativo;
 *  - usuário novo não recebe senha do administrador: recebe um link de uso
 *    único para definir a própria senha.
 */

export const STATUS = ['ativo', 'inativo', 'bloqueado'] as const;
export type Status = (typeof STATUS)[number];
export const ROTULO_STATUS: Record<Status, string> = { ativo: 'Ativo', inativo: 'Inativo', bloqueado: 'Bloqueado' };

export type Autor = { id: number; nome: string };

export type ItemLista = {
  id: number;
  nome: string;
  email: string;
  login: string;
  status: Status;
  ultimo_acesso: Date | null;
  bloqueado_temp: boolean;
  perfis_globais: string | null;
  salas: string | null;
};

export type Filtros = { busca?: string; status?: string; salaId?: number };

export async function listar(f: Filtros, pagina: number, porPagina = 20): Promise<{ itens: ItemLista[]; total: number }> {
  const where = ['u.excluido_em IS NULL'];
  const p: unknown[] = [];
  if (f.busca) {
    p.push(`%${f.busca.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    where.push(`(u.nome ILIKE $${p.length} OR u.email ILIKE $${p.length} OR u.login ILIKE $${p.length})`);
  }
  if (f.status && (STATUS as readonly string[]).includes(f.status)) {
    p.push(f.status);
    where.push(`u.status = $${p.length}`);
  }
  if (f.salaId) {
    p.push(f.salaId);
    where.push(`EXISTS (SELECT 1 FROM usuario_salas x WHERE x.usuario_id = u.id AND x.sala_id = $${p.length})`);
  }
  const w = where.join(' AND ');

  const total = (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM usuarios u WHERE ${w}`, p))?.n ?? 0;
  const itens = await query<ItemLista>(
    `SELECT u.id, u.nome, u.email, u.login, u.status, u.ultimo_acesso,
            coalesce(u.bloqueado_ate > now(), false) AS bloqueado_temp,
            (SELECT string_agg(pg.nome, ', ' ORDER BY pg.nome)
               FROM usuario_perfis up JOIN perfis pg ON pg.id = up.perfil_id
              WHERE up.usuario_id = u.id) AS perfis_globais,
            (SELECT string_agg(coalesce(s.sigla, s.nome) || ': ' || ps.nome, ' · ' ORDER BY s.ordem)
               FROM usuario_salas us JOIN salas s ON s.id = us.sala_id JOIN perfis ps ON ps.id = us.perfil_id
              WHERE us.usuario_id = u.id) AS salas
       FROM usuarios u
      WHERE ${w}
      ORDER BY u.nome
      LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
    [...p, porPagina, Math.max(0, (pagina - 1) * porPagina)],
  );
  return { itens, total };
}

export type Usuario = {
  id: number;
  nome: string;
  email: string;
  login: string;
  status: Status;
  deve_trocar_senha: boolean;
  ultimo_acesso: Date | null;
  bloqueado_ate: Date | null;
  bloqueado_temp: boolean;
  criado_em: Date;
  perfisGlobais: number[];
  /** sala_id → perfil_id */
  salas: Record<number, number>;
};

export async function obter(id: number, c?: pg.PoolClient): Promise<Usuario | null> {
  const q = c ? (sql: string, p: unknown[]) => c.query(sql, p).then((r) => r.rows) : query;
  const [u] = await q(
    `SELECT id, nome, email, login, status, deve_trocar_senha, ultimo_acesso, bloqueado_ate,
            coalesce(bloqueado_ate > now(), false) AS bloqueado_temp, criado_em
       FROM usuarios WHERE id = $1 AND excluido_em IS NULL`,
    [id],
  );
  if (!u) return null;
  const globais = await q('SELECT perfil_id FROM usuario_perfis WHERE usuario_id = $1 ORDER BY perfil_id', [id]);
  const salas = await q('SELECT sala_id, perfil_id FROM usuario_salas WHERE usuario_id = $1', [id]);
  return {
    ...(u as Omit<Usuario, 'perfisGlobais' | 'salas'>),
    perfisGlobais: globais.map((r) => r.perfil_id as number),
    salas: Object.fromEntries(salas.map((r) => [r.sala_id as number, r.perfil_id as number])),
  };
}

export type Perfil = { id: number; slug: string; nome: string; descricao: string | null; escopo: 'global' | 'sala' };
export type SalaResumo = { id: number; nome: string; sigla: string | null; status: string };

export async function perfis(): Promise<Perfil[]> {
  return query<Perfil>('SELECT id, slug, nome, descricao, escopo FROM perfis ORDER BY escopo, id');
}

export async function salas(): Promise<SalaResumo[]> {
  return query<SalaResumo>('SELECT id, nome, sigla, status FROM salas WHERE excluido_em IS NULL ORDER BY ordem, nome');
}

export type DadosUsuario = {
  nome: string;
  email: string;
  login: string;
  status: string;
  deveTrocarSenha: boolean;
  perfisGlobais: number[];
  /** sala_id → perfil_id (0 = sem acesso) */
  salas: Record<number, number>;
};

export type ResultadoSalvar = { ok: true; id: number; token: string | null } | { ok: false; erros: string[] };

/** Cria (id null) ou atualiza. Na criação, devolve o token do link para definir a senha. */
export async function salvar(id: number | null, d: DadosUsuario, autor: Autor, origem: Origem): Promise<ResultadoSalvar> {
  const nome = d.nome.trim();
  const email = d.email.trim().toLowerCase();
  const login = d.login.trim().toLowerCase();
  const status = id ? d.status : 'ativo';
  const erros: string[] = [];

  if ([...nome].length < 3 || [...nome].length > 150) erros.push('Nome: informe de 3 a 150 caracteres.');
  if (email.length > 190 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) erros.push('E-mail inválido.');
  if (!/^[a-z0-9._-]{3,60}$/.test(login)) {
    erros.push('Login: use 3 a 60 caracteres entre a-z, 0-9, ponto, hífen e sublinhado.');
  }
  if (!(STATUS as readonly string[]).includes(status)) erros.push('Situação inválida.');

  const todosPerfis = await perfis();
  const idsSala = new Set(todosPerfis.filter((p) => p.escopo === 'sala').map((p) => p.id));
  const idsGlobal = new Set(todosPerfis.filter((p) => p.escopo === 'global').map((p) => p.id));
  const idAdmin = todosPerfis.find((p) => p.slug === 'admin_sistema')?.id;
  const salasValidas = new Set((await salas()).map((s) => s.id));

  const vinculos = new Map<number, number>();
  for (const [salaId, perfilId] of Object.entries(d.salas).map(([s, p]) => [Number(s), Number(p)] as const)) {
    if (perfilId === 0) continue; // sem acesso
    if (!salasValidas.has(salaId) || !idsSala.has(perfilId)) {
      erros.push('Vínculo com sala inválido.');
      continue;
    }
    vinculos.set(salaId, perfilId);
  }
  const globais = [...new Set(d.perfisGlobais)];
  if (globais.some((g) => !idsGlobal.has(g))) erros.push('Perfil global inválido.');

  const repetido = await queryOne<{ email: string }>(
    `SELECT email FROM usuarios
      WHERE excluido_em IS NULL AND (lower(email) = $1 OR lower(login) = $2) AND id <> $3 LIMIT 1`,
    [email, login, id ?? 0],
  );
  if (repetido) {
    erros.push(repetido.email.toLowerCase() === email ? 'Já existe um usuário com este e-mail.' : 'Já existe um usuário com este login.');
  }
  if (erros.length) return { ok: false, erros };

  try {
    return await transacao(async (c) => {
      // Serializa alterações que podem mexer no número de administradores ativos.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['ssap:admins']);

      const antes = id ? await obter(id, c) : null;
      if (id && !antes) return { ok: false, erros: ['Usuário não encontrado.'] };

      const perdeAdmin = !!antes && idAdmin !== undefined && antes.perfisGlobais.includes(idAdmin) && !globais.includes(idAdmin);
      if (id === autor.id) {
        if (status !== 'ativo') erros.push('Você não pode desativar ou bloquear a sua própria conta.');
        if (perdeAdmin) erros.push('Você não pode remover o seu próprio perfil de Administrador do Sistema.');
      }
      if (id && (status !== 'ativo' || perdeAdmin) && (await ehAdminAtivo(c, id)) && (await totalAdminsAtivos(c)) <= 1) {
        erros.push('Este é o único Administrador do Sistema ativo: cadastre outro antes de alterar este.');
      }
      if (erros.length) return { ok: false, erros };

      let novoId: number;
      if (id) {
        await c.query(
          `UPDATE usuarios SET nome = $2, email = $3, login = $4, status = $5, deve_trocar_senha = $6, atualizado_por = $7
            WHERE id = $1`,
          [id, nome, email, login, status, d.deveTrocarSenha, autor.id],
        );
        if (status !== 'ativo' && antes?.status === 'ativo') {
          await revogarSessoes(id, `usuario_${status}`, null, c);
        }
        novoId = id;
      } else {
        // Senha inutilizável até o usuário usar o link de definição.
        const r = await c.query<{ id: number }>(
          `INSERT INTO usuarios (nome, email, login, senha_hash, status, criado_por)
           VALUES ($1, $2, $3, $4, 'ativo', $5) RETURNING id`,
          [nome, email, login, await hashSenha(randomBytes(32).toString('hex')), autor.id],
        );
        novoId = r.rows[0]!.id;
      }

      await c.query('DELETE FROM usuario_perfis WHERE usuario_id = $1', [novoId]);
      for (const g of globais) {
        await c.query('INSERT INTO usuario_perfis (usuario_id, perfil_id, criado_por) VALUES ($1, $2, $3)', [novoId, g, autor.id]);
      }
      await c.query('DELETE FROM usuario_salas WHERE usuario_id = $1', [novoId]);
      for (const [s, p] of vinculos) {
        await c.query('INSERT INTO usuario_salas (usuario_id, sala_id, perfil_id, criado_por) VALUES ($1, $2, $3, $4)', [
          novoId, s, p, autor.id,
        ]);
      }

      const depois = await obter(novoId, c);
      let token: string | null = null;
      if (antes) {
        await auditar(
          { modulo: 'usuarios', acao: 'editar', entidade: 'usuarios', entidadeId: novoId,
            descricao: `Usuário alterado: ${login}`, antes: paraAuditoria(antes), depois: paraAuditoria(depois),
            usuario: autor, ...origem },
          c,
        );
      } else {
        token = await gerarToken(novoId, autor.id, VALIDADE_HORAS.novo, c);
        await auditar(
          { modulo: 'usuarios', acao: 'criar', entidade: 'usuarios', entidadeId: novoId,
            descricao: `Usuário criado: ${login} (link de senha válido por ${VALIDADE_HORAS.novo} h)`,
            depois: paraAuditoria(depois), usuario: autor, ...origem },
          c,
        );
      }
      return { ok: true, id: novoId, token };
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { ok: false, erros: ['Já existe um usuário com este e-mail ou login.'] };
    throw e;
  }
}

/** Exclusão lógica: some das listas e não entra mais; histórico preservado. */
export async function excluir(id: number, autor: Autor, origem: Origem): Promise<string[]> {
  if (id === autor.id) return ['Você não pode excluir a sua própria conta.'];
  return transacao(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['ssap:admins']);
    const u = await obter(id, c);
    if (!u) return ['Usuário não encontrado.'];
    if ((await ehAdminAtivo(c, id)) && (await totalAdminsAtivos(c)) <= 1) {
      return ['Este é o único Administrador do Sistema ativo e não pode ser excluído.'];
    }
    await c.query(
      `UPDATE usuarios SET excluido_em = now(), excluido_por = $2, status = 'inativo' WHERE id = $1`,
      [id, autor.id],
    );
    await c.query('UPDATE senha_tokens SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL', [id]);
    await revogarSessoes(id, 'usuario_excluido', null, c);
    await auditar(
      { modulo: 'usuarios', acao: 'excluir', entidade: 'usuarios', entidadeId: id,
        descricao: `Usuário excluído: ${u.login}`, antes: paraAuditoria(u), usuario: autor, ...origem },
      c,
    );
    return [];
  });
}

export async function desbloquear(id: number, autor: Autor, origem: Origem): Promise<string[]> {
  const u = await obter(id);
  if (!u) return ['Usuário não encontrado.'];
  await query('UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = $1', [id]);
  await auditar({
    modulo: 'usuarios', acao: 'desbloquear', entidade: 'usuarios', entidadeId: id,
    descricao: `Bloqueio por tentativas removido: ${u.login}`, usuario: autor, ...origem,
  });
  return [];
}

/** Novo link de redefinição (invalida os anteriores). */
export async function novoLinkSenha(id: number, autor: Autor, origem: Origem): Promise<{ token: string } | { erros: string[] }> {
  const u = await obter(id);
  if (!u) return { erros: ['Usuário não encontrado.'] };
  if (u.status !== 'ativo') return { erros: ['Reative o usuário antes de gerar o link.'] };
  const token = await gerarToken(id, autor.id, VALIDADE_HORAS.redefinicao);
  await auditar({
    modulo: 'auth', acao: 'senha_link_gerado', entidade: 'usuarios', entidadeId: id,
    descricao: `Link de redefinição gerado para ${u.login} (validade ${VALIDADE_HORAS.redefinicao} h)`,
    usuario: autor, ...origem,
  });
  return { token };
}

async function ehAdminAtivo(c: pg.PoolClient, id: number): Promise<boolean> {
  const r = await c.query(
    `SELECT 1 FROM usuario_perfis up
       JOIN perfis p   ON p.id = up.perfil_id AND p.slug = 'admin_sistema'
       JOIN usuarios u ON u.id = up.usuario_id
      WHERE up.usuario_id = $1 AND u.status = 'ativo' AND u.excluido_em IS NULL`,
    [id],
  );
  return (r.rowCount ?? 0) > 0;
}

async function totalAdminsAtivos(c: pg.PoolClient): Promise<number> {
  const r = await c.query<{ n: number }>(
    `SELECT count(DISTINCT u.id)::int AS n FROM usuario_perfis up
       JOIN perfis p   ON p.id = up.perfil_id AND p.slug = 'admin_sistema'
       JOIN usuarios u ON u.id = up.usuario_id
      WHERE u.status = 'ativo' AND u.excluido_em IS NULL`,
  );
  return r.rows[0]?.n ?? 0;
}

function paraAuditoria(u: Usuario | null) {
  if (!u) return null;
  const { nome, email, login, status, deve_trocar_senha, perfisGlobais, salas } = u;
  return { nome, email, login, status, deve_trocar_senha, perfisGlobais, salas };
}

/** Nomes e logins dos usuários, para o autocompletar da busca. */
export async function sugestoesBusca(): Promise<string[]> {
  const r = await query<{ nome: string; login: string }>('SELECT nome, login FROM usuarios WHERE excluido_em IS NULL ORDER BY nome LIMIT 500');
  return r.flatMap((u) => [u.nome, u.login]);
}
