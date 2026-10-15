import 'server-only';
import { notFound, redirect } from 'next/navigation';
import type { Acl } from '../auth/acl';
import { query } from '../db';

/**
 * Menu lateral e indicadores do painel da área /acesso (porte de Menu.php e
 * DashboardService.php da referência). O menu usa as MESMAS regras do Acl que
 * protegem as páginas: esconder um item é só conforto visual.
 */

export type ItemMenu = { rotulo: string; href: string; icone: string; caminho: string };
export type SalaMenu = { id: number; slug: string; rotulo: string; cor: string | null; filhos: ItemMenu[] };
export type Menu = { geral: ItemMenu[]; salas: SalaMenu[]; admin: ItemMenu[] };

export type SalaPainel = {
  id: number;
  slug: string;
  nome: string;
  sigla: string | null;
  descricao: string | null;
  cor: string | null;
  perfilNome: string;
  modulos: { slug: string; nome: string; icone: string | null }[];
};

/** Módulo da sala → permissão para ver e página (null = ainda não migrado do PHP). */
export const MODULOS: Record<string, { permissao: string; caminho: string | null }> = {
  boletins: { permissao: 'visualizar_boletins', caminho: '/acesso/boletins' },
  graficos: { permissao: 'visualizar_graficos', caminho: '/acesso/graficos' },
  documentos: { permissao: 'visualizar_documentos', caminho: '/acesso/documentos' },
  previsoes: { permissao: 'visualizar_previsoes', caminho: '/acesso/previsoes' },
};

/** Endereço do módulo dentro de uma sala (as listas filtram por ?sala=<id>). */
export function hrefModulo(caminho: string, sala: { id: number }): string {
  return `${caminho}?sala=${sala.id}`;
}

/** Salas ativas que o usuário pode ver, com o perfil dele e os módulos habilitados. */
export async function salasPainel(a: Acl): Promise<SalaPainel[]> {
  const linhas = await query<Omit<SalaPainel, 'perfilNome' | 'modulos'> & { perfil_sala: string | null }>(
    `SELECT s.id, s.slug, s.nome, s.sigla, s.descricao, s.cor,
            (SELECT p.nome FROM usuario_salas us JOIN perfis p ON p.id = us.perfil_id
              WHERE us.sala_id = s.id AND us.usuario_id = $1) AS perfil_sala
       FROM salas s
      WHERE s.status = 'ativa' AND s.excluido_em IS NULL
      ORDER BY s.ordem, s.nome`,
    [a.usuario.id],
  );
  const visiveis = linhas.filter((s) => a.pode('visualizar_dashboard', s.id));
  if (!visiveis.length) return [];

  const [global] = await query<{ nome: string }>(
    `SELECT p.nome FROM usuario_perfis up JOIN perfis p ON p.id = up.perfil_id
      WHERE up.usuario_id = $1 ORDER BY p.id LIMIT 1`,
    [a.usuario.id],
  );
  const modulos = await query<{ sala_id: number; slug: string; nome: string; icone: string | null }>(
    `SELECT sm.sala_id, m.slug, m.nome, m.icone
       FROM sala_modulos sm JOIN modulos m ON m.id = sm.modulo_id
      WHERE sm.ativo AND sm.sala_id = ANY($1::int[])
      ORDER BY m.ordem`,
    [visiveis.map((s) => s.id)],
  );
  return visiveis.map(({ perfil_sala, ...s }) => ({
    ...s,
    perfilNome: perfil_sala ?? global?.nome ?? 'Acesso global',
    modulos: modulos.filter((m) => m.sala_id === s.id).map(({ slug, nome, icone }) => ({ slug, nome, icone })),
  }));
}

export async function montarMenu(a: Acl): Promise<Menu> {
  const item = (rotulo: string, caminho: string, icone: string, href = caminho): ItemMenu => ({ rotulo, href, icone, caminho });

  const geral = [item('Painel', '/acesso', 'bi-speedometer2')];
  // Situação dos rios por UGRHI (dados estaduais do SIBH): para quem vê alguma sala.
  if (a.podeEmAlguma('visualizar_dashboard')) geral.push(item('Defesa Civil', '/acesso/defesa_civil', 'bi-shield-exclamation'));

  const salas = (await salasPainel(a)).map((s) => {
    const filhos = [item('Visão geral', '/acesso/salas/sala', 'bi-grid', `/acesso/salas/sala?s=${s.slug}`)];
    for (const m of s.modulos) {
      const def = MODULOS[m.slug];
      if (!def?.caminho || !a.pode(def.permissao, s.id)) continue;
      filhos.push(item(m.nome, def.caminho, m.icone ?? 'bi-circle', hrefModulo(def.caminho, s)));
    }
    return { id: s.id, slug: s.slug, rotulo: s.nome, cor: s.cor, filhos };
  });

  const admin: ItemMenu[] = [];
  if (a.pode('gerenciar_usuarios')) admin.push(item('Usuários', '/acesso/usuarios', 'bi-people'));
  if (a.pode('gerenciar_salas')) {
    admin.push(item('Salas de Situação', '/acesso/salas', 'bi-buildings'));
    admin.push(item('Tipos de boletim', '/acesso/tipos-boletim', 'bi-journal-richtext'));
  }
  if (a.pode('gerenciar_permissoes')) admin.push(item('Perfis e permissões', '/acesso/perfis', 'bi-shield-lock'));
  if (a.podeEmAlguma('visualizar_logs')) admin.push(item('Auditoria', '/acesso/auditoria', 'bi-clock-history'));
  if (a.podeEmAlguma('visualizar_dashboard')) admin.push(item('Integrações', '/acesso/integracoes', 'bi-plug'));

  return { geral, salas, admin };
}

// ---------------------------------------------------------------------------
// Indicadores (sempre filtrados pelas salas permitidas)
// ---------------------------------------------------------------------------

export type Contagem = Record<'rascunho' | 'em_revisao' | 'aprovado' | 'publicado', number>;

export async function boletinsPorStatus(salas: number[]): Promise<Contagem> {
  const r: Contagem = { rascunho: 0, em_revisao: 0, aprovado: 0, publicado: 0 };
  if (!salas.length) return r;
  const linhas = await query<{ status: string; n: number }>(
    `SELECT status, count(*)::int AS n FROM boletins
      WHERE excluido_em IS NULL AND sala_id = ANY($1::int[]) GROUP BY status`,
    [salas],
  );
  for (const l of linhas) if (l.status in r) r[l.status as keyof Contagem] = l.n;
  return r;
}

export type BoletimRecente = { id: string; titulo: string; tipo: string; sala: string; status: string; data_referencia: string };

export async function ultimosBoletins(salas: number[], limite = 6): Promise<BoletimRecente[]> {
  if (!salas.length) return [];
  return query<BoletimRecente>(
    `SELECT b.id, b.titulo, t.nome AS tipo, coalesce(s.sigla, s.nome) AS sala, b.status,
            to_char(b.data_referencia, 'DD/MM/YYYY') AS data_referencia
       FROM boletins b
       JOIN tipos_boletim t ON t.id = b.tipo_id
       JOIN salas s         ON s.id = b.sala_id
      WHERE b.excluido_em IS NULL AND b.sala_id = ANY($1::int[])
      ORDER BY coalesce(b.atualizado_em, b.criado_em) DESC
      LIMIT $2`,
    [salas, limite],
  );
}

export type DocumentoRecente = { id: string; titulo: string; sala: string; criado_em: Date };

export async function documentosRecentes(salas: number[], limite = 5): Promise<DocumentoRecente[]> {
  if (!salas.length) return [];
  return query<DocumentoRecente>(
    `SELECT d.id, d.titulo, coalesce(s.sigla, s.nome) AS sala, d.criado_em
       FROM documentos d JOIN salas s ON s.id = d.sala_id
      WHERE d.excluido_em IS NULL AND d.sala_id = ANY($1::int[])
      ORDER BY d.criado_em DESC LIMIT $2`,
    [salas, limite],
  );
}

export type AtalhoTipo = { id: number; nome: string; sala: string; sala_id: number };

/** Tipos de boletim ativos que o usuário pode cadastrar (atalhos "Gerar boletim"). */
export async function atalhosGeracao(salas: number[]): Promise<AtalhoTipo[]> {
  if (!salas.length) return [];
  return query<AtalhoTipo>(
    `SELECT t.id, t.nome, coalesce(s.sigla, s.nome) AS sala, s.id AS sala_id
       FROM tipos_boletim t JOIN salas s ON s.id = t.sala_id
      WHERE t.ativo AND s.status = 'ativa' AND s.excluido_em IS NULL AND t.sala_id = ANY($1::int[])
      ORDER BY s.ordem, t.ordem`,
    [salas],
  );
}

export type Atividade = { id: string; usuario_nome: string | null; modulo: string; acao: string; descricao: string | null; criado_em: Date; sala: string | null };

/**
 * Últimas atividades: com visualizar_logs global vê tudo; senão, as das salas
 * onde tem visualizar_logs mais as próprias ações. O ruído de autenticação
 * fica só na tela de auditoria.
 */
export async function atividades(a: Acl, salaId: number | null, limite = 8): Promise<Atividade[]> {
  const where = ["a.modulo <> 'auth'"];
  const p: unknown[] = [];
  if (!a.pode('visualizar_logs')) {
    p.push(a.usuario.id, a.salasCom('visualizar_logs'));
    where.push('(a.usuario_id = $1 OR a.sala_id = ANY($2::int[]))');
  }
  if (salaId !== null) {
    p.push(salaId);
    where.push(`a.sala_id = $${p.length}`);
  }
  p.push(limite);
  return query<Atividade>(
    `SELECT a.id, a.usuario_nome, a.modulo, a.acao, a.descricao, a.criado_em, coalesce(s.sigla, s.nome) AS sala
       FROM auditoria a LEFT JOIN salas s ON s.id = a.sala_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.id DESC LIMIT $${p.length}`,
    p,
  );
}

/**
 * Sala (pelo id que vem em ?sala=) para uma página de módulo: 404 se a sala
 * não existe, o usuário não a vê ou o módulo está desligado nela; "sem acesso"
 * se falta a permissão.
 */
export async function exigirSalaModulo(a: Acl, salaId: number, modulo: string, permissao: string): Promise<SalaPainel> {
  const sala = (await salasPainel(a)).find((s) => s.id === salaId);
  if (!sala || !sala.modulos.some((m) => m.slug === modulo)) notFound();
  if (!a.pode(permissao, sala.id)) redirect('/acesso/sem-acesso');
  return sala;
}
