import 'server-only';
import { query, queryOne } from '../db';

export type FiltrosAuditoria = {
  usuario?: string;
  salaId?: number;
  modulo?: string;
  acao?: string;
  de?: string; // AAAA-MM-DD
  ate?: string; // AAAA-MM-DD
};

export type LinhaAuditoria = {
  id: string;
  criado_em: Date;
  usuario_nome: string | null;
  sala_nome: string | null;
  modulo: string;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  descricao: string | null;
  ip: string | null;
  tem_dados: boolean;
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Consulta a auditoria. `escopo` null = tudo (permissão global);
 * senão só os registros dessas salas (gestor de sala).
 */
export async function listarAuditoria(
  escopo: number[] | null,
  f: FiltrosAuditoria,
  pagina: number,
  porPagina = 30,
): Promise<{ itens: LinhaAuditoria[]; total: number }> {
  const where: string[] = [];
  const p: unknown[] = [];
  const add = (sql: (n: string) => string, v: unknown) => {
    p.push(v);
    where.push(sql(`$${p.length}`));
  };

  if (escopo !== null) add((n) => `a.sala_id = ANY(${n}::int[])`, escopo);
  if (f.usuario) add((n) => `a.usuario_nome ILIKE ${n}`, `%${f.usuario.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  if (f.salaId) add((n) => `a.sala_id = ${n}`, f.salaId);
  if (f.modulo) add((n) => `a.modulo = ${n}`, f.modulo);
  if (f.acao) add((n) => `a.acao = ${n}`, f.acao);
  // Datas no fuso de São Paulo, dia inteiro.
  if (f.de && DATA.test(f.de)) add((n) => `a.criado_em >= (${n}::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'`, f.de);
  if (f.ate && DATA.test(f.ate)) {
    add((n) => `a.criado_em < (${n}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`, f.ate);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM auditoria a ${w}`, p))?.n ?? 0;
  const itens = await query<LinhaAuditoria>(
    `SELECT a.id::text, a.criado_em, a.usuario_nome, s.nome AS sala_nome, a.modulo, a.acao,
            a.entidade, a.entidade_id::text, a.descricao, host(a.ip) AS ip,
            (a.dados_antes IS NOT NULL OR a.dados_depois IS NOT NULL) AS tem_dados
       FROM auditoria a
       LEFT JOIN salas s ON s.id = a.sala_id
       ${w}
      ORDER BY a.criado_em DESC, a.id DESC
      LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
    [...p, porPagina, Math.max(0, (pagina - 1) * porPagina)],
  );
  return { itens, total };
}

/** Módulos e ações existentes, para os filtros. */
export async function opcoesFiltro(): Promise<{ modulos: string[]; acoes: string[] }> {
  const [modulos, acoes] = await Promise.all([
    query<{ v: string }>('SELECT DISTINCT modulo AS v FROM auditoria ORDER BY 1'),
    query<{ v: string }>('SELECT DISTINCT acao AS v FROM auditoria ORDER BY 1'),
  ]);
  return { modulos: modulos.map((r) => r.v), acoes: acoes.map((r) => r.v) };
}

/** Nomes de usuário que aparecem na auditoria (dentro do escopo), para o autocompletar da busca. */
export async function sugestoesUsuarios(escopo: number[] | null): Promise<string[]> {
  const r = await query<{ nome: string }>(
    `SELECT DISTINCT usuario_nome AS nome FROM auditoria
      WHERE usuario_nome IS NOT NULL AND ($1::int[] IS NULL OR sala_id = ANY($1::int[]))
      ORDER BY 1 LIMIT 300`,
    [escopo],
  );
  return r.map((x) => x.nome);
}
