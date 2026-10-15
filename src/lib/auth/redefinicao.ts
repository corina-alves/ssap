import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { headers } from 'next/headers';
import { auditar } from '../auditoria';
import { pool, queryOne, transacao } from '../db';
import { env } from '../env';
import type { Origem } from '../requisicao';
import { dadosPessoais, hashSenha, validarSenha } from './senha';
import { revogarSessoes } from './sessao';

export const VALIDADE_HORAS = { novo: 72, redefinicao: 24 } as const;

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * Gera um link de uso único para o usuário definir a senha (enquanto não há
 * SMTP, o administrador entrega o link). Invalida links anteriores.
 * Devolve o token em texto — só existe aqui; no banco fica o SHA-256.
 */
export async function gerarToken(
  usuarioId: number,
  criadoPor: number | null,
  horas: number,
  c?: pg.PoolClient,
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const executor = c ?? pool();
  await executor.query('UPDATE senha_tokens SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL', [usuarioId]);
  await executor.query(
    `INSERT INTO senha_tokens (usuario_id, token_hash, expira_em, criado_por)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4)`,
    [usuarioId, sha256(token), horas, criadoPor],
  );
  return token;
}

/** URL absoluta da página de redefinição (APP_URL, ou o host da requisição). */
export async function urlRedefinicao(token: string): Promise<string> {
  let base = env().APP_URL;
  if (!base) {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') ?? (env().NODE_ENV === 'production' ? 'https' : 'http');
    base = `${proto}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  }
  return `${base.replace(/\/$/, '')}/acesso/redefinir-senha?token=${token}`;
}

export type DonoToken = { id: number; nome: string; email: string; login: string };

/** Dono do token, se válido (formato, não usado, não expirado, conta ativa). */
export async function tokenValido(token: string): Promise<DonoToken | null> {
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;
  return queryOne<DonoToken>(
    `SELECT u.id, u.nome, u.email, u.login
       FROM senha_tokens t
       JOIN usuarios u ON u.id = t.usuario_id
      WHERE t.token_hash = $1 AND t.usado_em IS NULL AND t.expira_em > now()
        AND u.excluido_em IS NULL AND u.status = 'ativo'`,
    [sha256(token.toLowerCase())],
  );
}

/** Define a senha pelo link. Lista vazia = senha definida. */
export async function redefinirComToken(
  token: string,
  nova: string,
  confirmacao: string,
  origem: Origem,
): Promise<string[]> {
  const dono = await tokenValido(token);
  if (!dono) return ['Este link é inválido, já foi usado ou expirou. Peça um novo ao administrador.'];
  if (nova !== confirmacao) return ['A confirmação não confere com a nova senha.'];
  const erros = validarSenha(nova, dadosPessoais(dono));
  if (erros.length) return erros;

  const hash = await hashSenha(nova);
  const usado = await transacao(async (c) => {
    // Marca o token como usado primeiro: dois envios simultâneos não passam.
    const r = await c.query(
      'UPDATE senha_tokens SET usado_em = now() WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()',
      [sha256(token.toLowerCase())],
    );
    if (r.rowCount !== 1) return false;
    await c.query('UPDATE senha_tokens SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL', [dono.id]);
    await c.query(
      `UPDATE usuarios SET senha_hash = $2, senha_alterada_em = now(), deve_trocar_senha = false,
              tentativas_falhas = 0, bloqueado_ate = NULL
        WHERE id = $1`,
      [dono.id, hash],
    );
    await revogarSessoes(dono.id, 'senha_redefinida', null, c);
    await auditar(
      { modulo: 'auth', acao: 'senha_redefinida', entidade: 'usuarios', entidadeId: dono.id,
        descricao: 'Senha definida por link', usuario: dono, ...origem },
      c,
    );
    return true;
  });
  return usado ? [] : ['Este link é inválido, já foi usado ou expirou. Peça um novo ao administrador.'];
}
