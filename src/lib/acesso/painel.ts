import 'server-only';
import { notFound, redirect } from 'next/navigation';
import type { Acl } from '../auth/acl';
import { query } from '../db';

/**
 * Menu lateral e indicadores do painel da área /acesso (porte de Menu.php e
 * DashboardService.php da referência). O menu usa as MESMAS regras do Acl que
 * protegem as páginas: esconder um item é só conforto visual.
 */

/** `filhos`: subitens (submenu), mostrados quando a página atual está dentro do item. */
export type ItemMenu = { rotulo: string; href: string; icone: string; caminho: string; filhos?: ItemMenu[] };
/** Bloco do menu lateral; `titulo` null = sem título (o Início). */
export type SecaoMenu = { titulo: string | null; itens: ItemMenu[] };
/** Salas visíveis: não entram no menu (viram filtro nas listas), só no selo da sala na barra superior. */
export type SalaMenu = { id: number; slug: string; rotulo: string; cor: string | null };
export type Menu = { secoes: SecaoMenu[]; salas: SalaMenu[] };

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

// Mesmos valores de SALA_BOLETIM e PERMISSAO_BOLETIM em lib/boletins-sala/boletim-integrado.ts
// (repetidos aqui para o menu, que roda em toda página, não carregar aquele módulo).
const SALA_BOLETIM_INTEGRADO = 'cetesb';
const PERMISSAO_BOLETIM_INTEGRADO = 'criar_boletim';

/**
 * Salas visíveis onde o módulo está ligado e o usuário tem a permissão de ver
 * (ordem do painel). Mesma regra de exigirSalaModulo: são as salas que as
 * páginas de módulo (gráficos, previsões) aceitam em ?sala=.
 */
export async function salasDoModulo(a: Acl, modulo: keyof typeof MODULOS): Promise<SalaPainel[]> {
  const def = MODULOS[modulo]!;
  return (await salasPainel(a)).filter((s) => s.modulos.some((m) => m.slug === modulo) && a.pode(def.permissao, s.id));
}

/**
 * Menu lateral por assunto: Início, Boletins, Monitoramento, Cadastros,
 * Administração e Configurações. As salas não têm bloco próprio: cada lista
 * (boletins, gráficos, previsões) tem o seletor de sala.
 */
export async function montarMenu(a: Acl): Promise<Menu> {
  const item = (rotulo: string, caminho: string, icone: string, href = caminho): ItemMenu => ({ rotulo, href, icone, caminho });
  const visiveis = await salasPainel(a);
  const temModulo = (modulo: string) => visiveis.some((s) => s.modulos.some((m) => m.slug === modulo) && a.pode(MODULOS[modulo]!.permissao, s.id));
  const alfredo = visiveis.find((s) => s.slug === 'alfredo-pisani');
  const cetesb = visiveis.find((s) => s.slug === SALA_BOLETIM_INTEGRADO);

  const boletins: ItemMenu[] = [];
  if (temModulo('boletins')) boletins.push(item('Boletins', '/acesso/boletins', 'bi-journal-text'));
  // Boletim mensal da Sala Alfredo Pisani (slides montados com as integrações + o que a equipe completa).
  if (alfredo && a.pode('visualizar_boletins', alfredo.id)) boletins.push(item('Boletim mensal', '/acesso/boletim_mensal', 'bi-journal-richtext'));
  if (temModulo('graficos')) boletins.push(item('Gráficos', '/acesso/graficos', 'bi-graph-up'));
  if (temModulo('documentos')) boletins.push(item('Documentos', '/acesso/documentos', 'bi-folder2-open'));

  const monitoramento: ItemMenu[] = [];
  if (a.podeEmAlguma('visualizar_dashboard')) {
    // Situação dos rios por UGRHI (dados estaduais do SIBH): para quem vê alguma sala.
    monitoramento.push({
      ...item('Defesa Civil', '/acesso/defesa_civil', 'bi-shield-exclamation'),
      filhos: [item('Painel de alerta', '/acesso/defesa_civil', 'bi-exclamation-triangle'), item('Gráficos de postos', '/acesso/defesa_civil/graficos', 'bi-graph-up')],
    });
    // Resumo dos Sumários Executivos de Cheias (Tietê-Pinheiros e Ribeira), para o acompanhamento.
    monitoramento.push(item('Painel de Monitoramento', '/acesso/painel_monitoramento', 'bi-activity'));
  }
  // Painel interativo dos sistemas produtores (SSD): visualizar_dashboard na Sala Alfredo Pisani.
  if (alfredo && a.pode('visualizar_dashboard', alfredo.id)) {
    monitoramento.push(item('Painel de Segurança Hídrica', '/acesso/painel_interativo', 'bi-water'));
    // Acompanhamentos dos sistemas (os próximos, como a transposição, entram como filhos).
    monitoramento.push({
      ...item('Acompanhamento', '/acesso/acompanhamento', 'bi-clipboard-data'),
      href: '/acesso/acompanhamento/volumes-espera',
      filhos: [
        item('Volumes de espera e operacional', '/acesso/acompanhamento/volumes-espera', 'bi-moisture'),
        item('Transposição Paraíba do Sul', '/acesso/acompanhamento/transposicao', 'bi-arrow-left-right'),
        item('Resumo dos sistemas', '/acesso/acompanhamento/resumo-sistemas', 'bi-card-list'),
      ],
    });
  }
  // Climatologia da chuva por UGRHI (acervo histórico do SIBH, já processado no banco).
  if (a.podeEmAlguma('visualizar_climatologia')) {
    monitoramento.push({
      ...item('Climatologia de precipitação', '/acesso/climatologia', 'bi-cloud-rain-heavy'),
      filhos: [item('Climatologia', '/acesso/climatologia', 'bi-cloud-rain-heavy'), item('Chuva do mês — UGRHIs e municípios', '/acesso/climatologia/mes', 'bi-table')],
    });
  }
  if (temModulo('previsoes')) monitoramento.push(item('Previsões', '/acesso/previsoes', 'bi-cloud-sun'));

  const cadastros: ItemMenu[] = [];
  // Dados sem fonte automática do Boletim Exutórios (Sala CETESB).
  if (cetesb && a.pode(PERMISSAO_BOLETIM_INTEGRADO, cetesb.id)) cadastros.push(item('Dados dos exutórios', '/acesso/boletim_integrado/exutorios', 'bi-pencil-square'));
  if (a.pode('gerenciar_salas')) {
    cadastros.push(item('Tipos de boletim', '/acesso/tipos-boletim', 'bi-journal-richtext'));
    cadastros.push(item('Salas de Situação', '/acesso/salas', 'bi-buildings'));
  }

  const admin: ItemMenu[] = [];
  if (a.pode('gerenciar_usuarios')) admin.push(item('Usuários', '/acesso/usuarios', 'bi-people'));
  if (a.pode('gerenciar_permissoes')) admin.push(item('Perfis e permissões', '/acesso/perfis', 'bi-shield-lock'));
  if (a.podeEmAlguma('visualizar_logs')) admin.push(item('Auditoria', '/acesso/auditoria', 'bi-clock-history'));

  const configuracoes: ItemMenu[] = [];
  if (a.podeEmAlguma('visualizar_dashboard')) configuracoes.push(item('Integrações', '/acesso/integracoes', 'bi-plug'));

  const secoes: SecaoMenu[] = [
    { titulo: null, itens: [item('Início', '/acesso', 'bi-house')] },
    { titulo: 'Boletins', itens: boletins },
    { titulo: 'Monitoramento', itens: monitoramento },
    { titulo: 'Cadastros', itens: cadastros },
    { titulo: 'Administração', itens: admin },
    { titulo: 'Configurações', itens: configuracoes },
  ];
  return {
    secoes: secoes.filter((s) => s.itens.length > 0),
    salas: visiveis.map((s) => ({ id: s.id, slug: s.slug, rotulo: s.nome, cor: s.cor })),
  };
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
