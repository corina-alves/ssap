import 'server-only';
import { NextResponse } from 'next/server';
import { auditar } from '../auditoria';
import { acl, type Acl } from '../auth/acl';
import { usuarioAtual } from '../auth/sessao';
import { query, queryOne } from '../db';

/**
 * Apoio às rotas das páginas de produção de boletim (porte dos _gate.php do
 * PHP): login + permissão numa sala. Nas rotas JSON a recusa vem em JSON
 * (401/403), não como redirecionamento.
 */

export type SalaBasica = { id: number; slug: string; nome: string };

export async function salaPorSlug(slug: string): Promise<SalaBasica | null> {
  return queryOne<SalaBasica>(
    `SELECT id, slug, nome FROM salas WHERE slug = $1 AND status = 'ativa' AND excluido_em IS NULL`,
    [slug],
  );
}

/** Id do tipo de boletim ativo da sala (0 se não existir) — para o link "Cadastrar PDF como boletim". */
export async function idTipoBoletim(salaId: number, slug: string): Promise<number> {
  const [t] = await query<{ id: number }>('SELECT id FROM tipos_boletim WHERE sala_id = $1 AND slug = $2 AND ativo', [salaId, slug]);
  return t?.id ?? 0;
}

const json = (erro: string, status: number) => NextResponse.json({ erro }, { status });

/** Rotas JSON: devolve { a, sala } ou a resposta de recusa pronta. */
export async function exigirApi(salaSlug: string, permissao: string): Promise<{ a: Acl; sala: SalaBasica } | NextResponse> {
  const u = await usuarioAtual();
  if (!u || u.deveTrocarSenha) return json('Sessão expirada. Entre novamente no sistema.', 401);
  const a = await acl();
  const sala = await salaPorSlug(salaSlug);
  if (!sala || !a.pode(permissao, sala.id)) {
    await auditar({ modulo: 'seguranca', acao: 'acesso_negado', descricao: `Sem permissão (${permissao} em ${salaSlug})`, usuario: u, salaId: sala?.id });
    return json('Sem permissão.', 403);
  }
  return { a, sala };
}

// ---------------------------------------------------------------------------
// Configurações guardadas no banco (tabela configuracoes)
// ---------------------------------------------------------------------------

export async function lerConfig<T>(chave: string): Promise<T | null> {
  const r = await queryOne<{ valor: T }>('SELECT valor FROM configuracoes WHERE chave = $1', [chave]);
  return r?.valor ?? null;
}

/** Grava o valor e guarda o anterior em valor_anterior. */
export async function gravarConfig(chave: string, valor: unknown, usuarioId: number): Promise<void> {
  await query(
    `INSERT INTO configuracoes (chave, valor, atualizado_por) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (chave) DO UPDATE
        SET valor_anterior = configuracoes.valor, valor = EXCLUDED.valor,
            atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
    [chave, JSON.stringify(valor), usuarioId],
  );
}
