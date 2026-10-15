/**
 * Gera um link de redefinição de senha pelo terminal, para quando não há outro
 * administrador que possa gerar pelo painel.
 *   npm run senha:link -- <login ou e-mail>
 * Uso único, vale 24 horas, invalida os links anteriores e fica na auditoria.
 */
import { createHash, randomBytes } from 'node:crypto';
import { auditar } from '../src/lib/auditoria';
import { pool, queryOne, transacao } from '../src/lib/db';
import { carregarEnv } from './_comum';

carregarEnv();

// Mesma validade de VALIDADE_HORAS.redefinicao (src/lib/auth/redefinicao.ts).
const HORAS = 24;

async function principal(): Promise<void> {
  const alvo = (process.argv[2] ?? '').trim().toLowerCase();
  if (!alvo) throw new Error('Uso: npm run senha:link -- <login ou e-mail>');

  const u = await queryOne<{ id: number; nome: string; login: string; status: string }>(
    `SELECT id, nome, login, status FROM usuarios
      WHERE excluido_em IS NULL AND (lower(login) = $1 OR lower(email) = $1)`,
    [alvo],
  );
  if (!u) throw new Error(`Usuário não encontrado: ${alvo}`);
  if (u.status !== 'ativo') throw new Error(`O usuário ${u.login} está ${u.status}. Reative-o antes de gerar o link.`);

  const token = randomBytes(32).toString('hex');
  await transacao(async (c) => {
    await c.query('UPDATE senha_tokens SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL', [u.id]);
    await c.query(
      `INSERT INTO senha_tokens (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, now() + make_interval(hours => $3))`,
      [u.id, createHash('sha256').update(token).digest('hex'), HORAS],
    );
    await auditar(
      { modulo: 'auth', acao: 'senha_link_gerado', entidade: 'usuarios', entidadeId: u.id,
        descricao: `Link de redefinição gerado pelo terminal para ${u.login} (validade ${HORAS} h)` },
      c,
    );
  });

  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  console.log(`Link para ${u.nome} (${u.login}), válido por ${HORAS} horas, uso único:\n`);
  console.log(`${base}/acesso/redefinir-senha?token=${token}`);
}

principal()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
