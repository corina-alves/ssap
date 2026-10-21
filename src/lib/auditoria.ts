import type pg from 'pg';
import { pool } from './db';
import { idRequisicao, log } from './log';

export type RegistroAuditoria = {
  modulo: string;
  acao: string;
  descricao?: string;
  usuario?: { id: number; nome: string } | null;
  salaId?: number | null;
  entidade?: string;
  entidadeId?: number | bigint | null;
  antes?: unknown;
  depois?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Grava um evento na auditoria (tabela somente-inserção).
 * Passe `c` para gravar dentro da mesma transação da operação.
 */
export async function auditar(r: RegistroAuditoria, c?: pg.PoolClient): Promise<void> {
  const executor = c ?? pool();
  await executor.query(
    `INSERT INTO auditoria (usuario_id, usuario_nome, sala_id, modulo, acao, entidade, entidade_id,
                            descricao, dados_antes, dados_depois, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      r.usuario?.id ?? null,
      r.usuario?.nome ?? null,
      r.salaId ?? null,
      r.modulo,
      r.acao,
      r.entidade ?? null,
      r.entidadeId != null ? String(r.entidadeId) : null,
      r.descricao?.slice(0, 500) ?? null,
      r.antes === undefined ? null : JSON.stringify(r.antes),
      r.depois === undefined ? null : JSON.stringify(r.depois),
      r.ip ?? null,
      r.userAgent ?? null,
    ],
  );
  // O mesmo evento no log da aplicação, sem dados pessoais: nem nome, login
  // digitado (vai na descrição), IP ou navegador — só o id do usuário.
  const nivel = /falha|bloque|negad|recusad|inativ|invalid/i.test(r.acao) ? 'warn' : 'info';
  log[nivel]('auditoria', {
    req: await idRequisicao(),
    modulo: r.modulo,
    acao: r.acao,
    usuarioId: r.usuario?.id ?? null,
    salaId: r.salaId ?? null,
    entidade: r.entidade ?? null,
    entidadeId: r.entidadeId != null ? String(r.entidadeId) : null,
  });
}
