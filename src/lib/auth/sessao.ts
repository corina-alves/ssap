import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { SESSAO } from '../config';
import { pool, query, queryOne } from '../db';
import { env } from '../env';
import type { Origem } from '../requisicao';

export type UsuarioSessao = {
  id: number;
  nome: string;
  email: string;
  login: string;
  deveTrocarSenha: boolean;
  tokenHash: string;
};

function nomeCookie(): string {
  // O prefixo __Host- exige HTTPS; o navegador recusa o cookie sem ele.
  return seguro() ? `__Host-${SESSAO.cookie}` : SESSAO.cookie;
}

function seguro(): boolean {
  return env().NODE_ENV === 'production';
}

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Abre uma sessão e grava o cookie. Só pode ser chamada em Server Action ou
 * Route Handler. Recebe `c` para ficar na mesma transação do login.
 */
export async function criarSessao(usuarioId: number, origem: Origem, c?: pg.PoolClient): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await (c ?? pool()).query(
    `INSERT INTO sessoes (token_hash, usuario_id, expira_em, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(secs => $3), $4, $5)`,
    [sha256(token), usuarioId, SESSAO.absolutaSeg, origem.ip, origem.userAgent],
  );
  (await cookies()).set(nomeCookie(), token, {
    httpOnly: true,
    secure: seguro(),
    sameSite: 'strict',
    path: '/',
    maxAge: SESSAO.absolutaSeg,
  });
}

/**
 * Usuário da sessão atual, ou null. Confere a cada requisição no banco:
 * sessão não revogada, dentro do prazo absoluto e de inatividade, e usuário
 * ativo. Memorizado por requisição.
 */
export const usuarioAtual = cache(async (): Promise<UsuarioSessao | null> => {
  const token = (await cookies()).get(nomeCookie())?.value;
  if (!token || token.length > 100) return null;

  const tokenHash = sha256(token);
  const s = await queryOne<{
    id: number;
    nome: string;
    email: string;
    login: string;
    deve_trocar_senha: boolean;
    tocar: boolean;
  }>(
    `SELECT u.id, u.nome, u.email, u.login, u.deve_trocar_senha,
            s.ultimo_uso_em < now() - make_interval(secs => $3) AS tocar
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1
        AND s.revogada_em IS NULL
        AND s.expira_em > now()
        AND s.ultimo_uso_em > now() - make_interval(secs => $2)
        AND u.status = 'ativo'
        AND u.excluido_em IS NULL
        AND (u.bloqueado_ate IS NULL OR u.bloqueado_ate < now())`,
    [tokenHash, SESSAO.inatividadeSeg, SESSAO.toqueSeg],
  );
  if (!s) return null;

  if (s.tocar) {
    await query('UPDATE sessoes SET ultimo_uso_em = now() WHERE token_hash = $1', [tokenHash]);
  }
  return {
    id: s.id,
    nome: s.nome,
    email: s.email,
    login: s.login,
    deveTrocarSenha: s.deve_trocar_senha,
    tokenHash,
  };
});

/** Encerra a sessão atual (logout) e apaga o cookie. */
export async function encerrarSessaoAtual(motivo = 'logout'): Promise<void> {
  const jar = await cookies();
  const token = jar.get(nomeCookie())?.value;
  if (token) {
    await query(
      'UPDATE sessoes SET revogada_em = now(), motivo = $2 WHERE token_hash = $1 AND revogada_em IS NULL',
      [sha256(token), motivo],
    );
  }
  jar.delete(nomeCookie());
}

/** Revoga todas as sessões do usuário, menos `exceto` (ex.: após trocar a senha). */
export async function revogarSessoes(
  usuarioId: number,
  motivo: string,
  exceto: string | null,
  c?: pg.PoolClient,
): Promise<void> {
  await (c ?? pool()).query(
    `UPDATE sessoes SET revogada_em = now(), motivo = $2
      WHERE usuario_id = $1 AND revogada_em IS NULL AND ($3::text IS NULL OR token_hash <> $3)`,
    [usuarioId, motivo, exceto],
  );
}

/** Apaga sessões vencidas há mais de 30 dias (chamada de vez em quando no login). */
export async function limparSessoesAntigas(): Promise<void> {
  await query(`DELETE FROM sessoes WHERE expira_em < now() - interval '30 days'`);
}
