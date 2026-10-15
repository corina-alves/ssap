import 'server-only';
import type pg from 'pg';
import { salasComModulo, type Acl, type SalaModulo } from './auth/acl';
import { auditar } from './auditoria';
import { ErroUpload, lerPdfEnviado, registrarArquivo, removerDoDisco } from './arquivos';
import { query, queryOne, transacao } from './db';
import { tituloFixo } from './formato';
import type { Origem } from './requisicao';

/**
 * Módulo central de boletins — o mesmo para todas as salas e tipos.
 *
 * Fluxo de status (cada passo exige uma permissão NA SALA do boletim):
 *
 *   rascunho ──enviar_revisao──▶ em_revisao ──aprovar──▶ aprovado ──publicar──▶ publicado
 *      ▲  │                          │                     │  ▲                      │
 *      │  └──publicar (tipo sem revisão obrigatória)───────┼──┼──────────────────────┘
 *      └────────────── devolver ◀────┴─────────────────────┘  └──── despublicar ◀────┘
 *   rascunho/aprovado/publicado ──arquivar──▶ arquivado ──reabrir──▶ rascunho
 *
 * Toda mudança gera uma versão (fotografia em boletim_versoes) e entra na
 * auditoria. Publicado não pode ser editado nem excluído: despublique antes.
 */

export const STATUS = ['rascunho', 'em_revisao', 'aprovado', 'publicado', 'arquivado'] as const;
export type Status = (typeof STATUS)[number];
export const ROTULO_STATUS: Record<Status, string> = {
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  aprovado: 'Aprovado',
  publicado: 'Publicado',
  arquivado: 'Arquivado',
};
/** Situações em que o boletim ainda pode ser editado por quem tem editar_boletim. */
export const EDITAVEIS: Status[] = ['rascunho', 'em_revisao'];

export const TRANSICOES = {
  enviar_revisao: { de: ['rascunho'], para: 'em_revisao', permissao: 'editar_boletim', rotulo: 'Enviar para revisão' },
  aprovar: { de: ['em_revisao'], para: 'aprovado', permissao: 'aprovar_boletim', rotulo: 'Aprovar' },
  devolver: { de: ['em_revisao', 'aprovado'], para: 'rascunho', permissao: 'aprovar_boletim', rotulo: 'Devolver para ajustes' },
  publicar: { de: ['aprovado', 'rascunho'], para: 'publicado', permissao: 'publicar_boletim', rotulo: 'Publicar no site' },
  despublicar: { de: ['publicado'], para: 'aprovado', permissao: 'publicar_boletim', rotulo: 'Despublicar' },
  arquivar: { de: ['rascunho', 'aprovado', 'publicado'], para: 'arquivado', permissao: 'publicar_boletim', rotulo: 'Arquivar' },
  reabrir: { de: ['arquivado'], para: 'rascunho', permissao: 'editar_boletim', rotulo: 'Reabrir como rascunho' },
} as const satisfies Record<string, { de: readonly Status[]; para: Status; permissao: string; rotulo: string }>;
export type Acao = keyof typeof TRANSICOES;

export type Autor = { id: number; nome: string };
type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erros: string[] };

// ---------------------------------------------------------------------------
// Salas e tipos disponíveis
// ---------------------------------------------------------------------------

export type SalaBoletins = SalaModulo;

/** Salas ativas, com o módulo de boletins habilitado, em que o usuário tem a permissão. */
export function salasComPermissao(a: Acl, permissao: string): Promise<SalaBoletins[]> {
  return salasComModulo(a, 'boletins', permissao);
}

export type TipoDisponivel = {
  id: number;
  sala_id: number;
  nome: string;
  periodicidade: string;
  exige_revisao: boolean;
  /** Preenchido: o título do boletim não é digitado, é "<titulo_fixo> — <data de referência>". */
  titulo_fixo: string | null;
};

export async function tiposAtivos(salaIds: number[]): Promise<TipoDisponivel[]> {
  if (!salaIds.length) return [];
  return query<TipoDisponivel>(
    `SELECT id, sala_id, nome, periodicidade, exige_revisao, titulo_fixo FROM tipos_boletim
      WHERE ativo AND sala_id = ANY($1::int[]) ORDER BY ordem, nome`,
    [salaIds],
  );
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export type FiltrosBoletins = { salaId?: number; tipoId?: number; status?: string; busca?: string; de?: string; ate?: string; criadoPor?: number };

export type ItemBoletim = {
  id: string;
  titulo: string;
  status: Status;
  data_referencia: string;
  competencia: string | null;
  versao_atual: number;
  tem_pdf: boolean;
  atualizado_em: Date | null;
  criado_em: Date;
  tipo_nome: string;
  sala: string;
  sala_id: number;
  atualizado_por_nome: string | null;
  criado_por: number | null;
  criado_por_nome: string | null;
  criado_por_email: string | null;
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Lista só das salas informadas (nunca "tudo" sem filtro). */
export async function listar(
  salas: number[],
  f: FiltrosBoletins,
  pagina: number,
  porPagina = 20,
): Promise<{ itens: ItemBoletim[]; total: number }> {
  if (!salas.length) return { itens: [], total: 0 };
  const w = ['b.excluido_em IS NULL', 'b.sala_id = ANY($1::int[])'];
  const p: unknown[] = [salas];
  const add = (sql: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(sql(`$${p.length}`));
  };
  if (f.salaId) add((n) => `b.sala_id = ${n}`, f.salaId);
  if (f.tipoId) add((n) => `b.tipo_id = ${n}`, f.tipoId);
  if (f.criadoPor) add((n) => `b.criado_por = ${n}`, f.criadoPor);
  if (f.status && (STATUS as readonly string[]).includes(f.status)) add((n) => `b.status = ${n}`, f.status);
  if (f.busca) add((n) => `b.titulo ILIKE ${n}`, `%${f.busca.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  if (f.de && DATA.test(f.de)) add((n) => `b.data_referencia >= ${n}::date`, f.de);
  if (f.ate && DATA.test(f.ate)) add((n) => `b.data_referencia <= ${n}::date`, f.ate);
  const where = w.join(' AND ');

  const total = (await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM boletins b WHERE ${where}`, p))?.n ?? 0;
  const itens = await query<ItemBoletim>(
    `SELECT b.id::text, b.titulo, b.status, to_char(b.data_referencia, 'YYYY-MM-DD') AS data_referencia, b.competencia,
            b.versao_atual, b.pdf_arquivo_id IS NOT NULL AS tem_pdf, b.atualizado_em, b.criado_em,
            t.nome AS tipo_nome, coalesce(s.sigla, s.nome) AS sala, b.sala_id, ua.nome AS atualizado_por_nome,
            b.criado_por, uc.nome AS criado_por_nome, uc.email AS criado_por_email
       FROM boletins b
       JOIN tipos_boletim t ON t.id = b.tipo_id
       JOIN salas s ON s.id = b.sala_id
       LEFT JOIN usuarios ua ON ua.id = coalesce(b.atualizado_por, b.criado_por)
       LEFT JOIN usuarios uc ON uc.id = b.criado_por
      WHERE ${where}
      ORDER BY b.data_referencia DESC, b.id DESC
      LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
    [...p, porPagina, Math.max(0, (pagina - 1) * porPagina)],
  );
  return { itens, total };
}

/** Quem já inseriu boletim nas salas informadas (filtro "Inserido por"). */
export async function autores(salas: number[]): Promise<{ id: number; nome: string }[]> {
  if (!salas.length) return [];
  return query<{ id: number; nome: string }>(
    `SELECT DISTINCT u.id, u.nome FROM boletins b JOIN usuarios u ON u.id = b.criado_por
      WHERE b.excluido_em IS NULL AND b.sala_id = ANY($1::int[]) ORDER BY u.nome`,
    [salas],
  );
}

export type Boletim = {
  id: string;
  sala_id: number;
  tipo_id: number;
  titulo: string;
  data_referencia: string;
  competencia: string | null;
  status: Status;
  versao_atual: number;
  pdf_arquivo_id: string | null;
  criado_em: Date;
  atualizado_em: Date | null;
  publicado_em: Date | null;
  tipo_nome: string;
  periodicidade: string;
  exige_revisao: boolean;
  tipo_publico: boolean;
  /** Título fixo do tipo (o título do boletim é ele + a data de referência), ou null se o título é livre. */
  tipo_titulo_fixo: string | null;
  /** Pasta dos PDFs deste tipo de boletim (dentro de boletins/). */
  tipo_pasta: string;
  sala_slug: string;
  sala_nome: string;
  criado_por_nome: string | null;
  atualizado_por_nome: string | null;
  publicado_por_nome: string | null;
  pdf_nome: string | null;
  pdf_tamanho: string | null;
  /** Quando o PDF atual foi enviado. */
  pdf_em: Date | null;
};

export async function obter(id: number): Promise<Boletim | null> {
  return queryOne<Boletim>(
    `SELECT b.id::text, b.sala_id, b.tipo_id, b.titulo, to_char(b.data_referencia, 'YYYY-MM-DD') AS data_referencia,
            b.competencia, b.status, b.versao_atual, b.pdf_arquivo_id::text, b.criado_em, b.atualizado_em, b.publicado_em,
            t.nome AS tipo_nome, t.periodicidade, t.exige_revisao, t.publico AS tipo_publico, t.titulo_fixo AS tipo_titulo_fixo,
            coalesce(t.pasta, 'boletim_' || replace(t.slug, '-', '_')) AS tipo_pasta,
            s.slug AS sala_slug, s.nome AS sala_nome,
            uc.nome AS criado_por_nome, ua.nome AS atualizado_por_nome, up.nome AS publicado_por_nome,
            a.nome_original AS pdf_nome, a.tamanho::text AS pdf_tamanho, a.criado_em AS pdf_em
       FROM boletins b
       JOIN tipos_boletim t ON t.id = b.tipo_id
       JOIN salas s ON s.id = b.sala_id
       LEFT JOIN usuarios uc ON uc.id = b.criado_por
       LEFT JOIN usuarios ua ON ua.id = b.atualizado_por
       LEFT JOIN usuarios up ON up.id = b.publicado_por
       LEFT JOIN arquivos a ON a.id = b.pdf_arquivo_id
      WHERE b.id = $1 AND b.excluido_em IS NULL`,
    [id],
  );
}

export type Versao = { versao: number; status: Status; comentario: string | null; criado_em: Date; autor: string | null; tem_pdf: boolean };
export type Historico = { status_de: Status | null; status_para: Status; comentario: string | null; criado_em: Date; autor: string | null };

export async function versoes(id: number): Promise<Versao[]> {
  return query<Versao>(
    `SELECT v.versao, v.status, v.comentario, v.criado_em, u.nome AS autor, v.pdf_arquivo_id IS NOT NULL AS tem_pdf
       FROM boletim_versoes v LEFT JOIN usuarios u ON u.id = v.criado_por
      WHERE v.boletim_id = $1 ORDER BY v.versao DESC`,
    [id],
  );
}

export async function historico(id: number): Promise<Historico[]> {
  return query<Historico>(
    `SELECT l.status_de, l.status_para, l.comentario, l.criado_em, u.nome AS autor
       FROM boletim_status_log l LEFT JOIN usuarios u ON u.id = l.usuario_id
      WHERE l.boletim_id = $1 ORDER BY l.criado_em DESC, l.id DESC`,
    [id],
  );
}

/** PDF de uma versão específica (para baixar versões anteriores). */
export async function arquivoDaVersao(boletimId: number, versao: number): Promise<string | null> {
  const r = await queryOne<{ id: string | null }>(
    'SELECT pdf_arquivo_id::text AS id FROM boletim_versoes WHERE boletim_id = $1 AND versao = $2',
    [boletimId, versao],
  );
  return r?.id ?? null;
}

// ---------------------------------------------------------------------------
// Ações disponíveis
// ---------------------------------------------------------------------------

export type AcaoDisponivel = { acao: Acao; rotulo: string; bloqueio: string | null };

export function acoesDisponiveis(b: Boletim, a: Acl): AcaoDisponivel[] {
  const r: AcaoDisponivel[] = [];
  for (const [acao, t] of Object.entries(TRANSICOES) as [Acao, (typeof TRANSICOES)[Acao]][]) {
    if (!(t.de as readonly Status[]).includes(b.status) || !a.pode(t.permissao, b.sala_id)) continue;
    // Tipo que exige revisão: rascunho não publica direto.
    if (acao === 'publicar' && b.status === 'rascunho' && b.exige_revisao) continue;
    r.push({ acao, rotulo: t.rotulo, bloqueio: bloqueio(acao, b) });
  }
  return r;
}

function bloqueio(acao: Acao, b: Boletim): string | null {
  if (acao === 'publicar' && !b.pdf_arquivo_id) return 'O boletim precisa ter um PDF antes de ser publicado.';
  if (acao === 'publicar' && !b.tipo_publico) return 'Este tipo de boletim é interno e não é publicado no site.';
  return null;
}

/** "Administrar boletins": edita e exclui qualquer boletim da sala, inclusive aprovado ou publicado. */
type SalaStatus = Pick<Boletim, 'sala_id' | 'status'>;
const administra = (b: SalaStatus, a: Acl) => a.pode('administrar_boletins', b.sala_id);

export const podeEditar = (b: SalaStatus, a: Acl) =>
  administra(b, a) || (EDITAVEIS.includes(b.status) && a.pode('editar_boletim', b.sala_id));
export const podeExcluir = (b: SalaStatus, a: Acl) =>
  administra(b, a) || (b.status !== 'publicado' && a.pode('excluir_boletim', b.sala_id));

// ---------------------------------------------------------------------------
// Criação, edição, exclusão
// ---------------------------------------------------------------------------

export type DadosBoletim = { tipoId: number; titulo: string; dataReferencia: string; competencia: string };

function validarMetadados(d: DadosBoletim, periodicidade: string): { erros: string[]; competencia: string | null } {
  const erros: string[] = [];
  const titulo = d.titulo.trim();
  if ([...titulo].length < 3 || [...titulo].length > 255) erros.push('Título: informe de 3 a 255 caracteres.');
  const dt = DATA.test(d.dataReferencia) ? new Date(`${d.dataReferencia}T12:00:00Z`) : null;
  if (!dt || Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== d.dataReferencia) {
    erros.push('Data de referência inválida.');
  } else if (dt.getTime() > Date.now() + 366 * 86_400_000) {
    erros.push('Data de referência muito distante no futuro.');
  }
  let competencia = d.competencia.trim();
  if (!competencia && periodicidade === 'mensal' && DATA.test(d.dataReferencia)) competencia = d.dataReferencia.slice(0, 7);
  if (competencia && !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) erros.push('Competência: use o formato AAAA-MM.');
  return { erros, competencia: competencia || null };
}

/**
 * Onde o PDF de um boletim é guardado: uma pasta por tipo de boletim, com o
 * nome <pasta>_<AAAAMMDD>.pdf (data de referência) — e cópia no banco.
 */
function destinoPdf(pastaTipo: string, dataReferencia: string): { pasta: string; nomeBase: string } {
  return { pasta: `boletins/${pastaTipo}`, nomeBase: `${pastaTipo}_${dataReferencia.replace(/-/g, '')}` };
}

/** Cria um boletim em rascunho, com o PDF (obrigatório). */
export async function criar(
  a: Acl,
  d: DadosBoletim,
  pdf: FormDataEntryValue | null,
  autor: Autor,
  origem: Origem,
): Promise<Resultado<{ id: number }>> {
  const tipo = await queryOne<{ id: number; sala_id: number; periodicidade: string; pasta: string; titulo_fixo: string | null }>(
    `SELECT t.id, t.sala_id, t.periodicidade, t.titulo_fixo, coalesce(t.pasta, 'boletim_' || replace(t.slug, '-', '_')) AS pasta
       FROM tipos_boletim t JOIN salas s ON s.id = t.sala_id
      WHERE t.id = $1 AND t.ativo AND s.status = 'ativa' AND s.excluido_em IS NULL`,
    [d.tipoId],
  );
  // A sala precisa estar entre as permitidas (com o módulo de boletins).
  const permitidas = (await salasComPermissao(a, 'criar_boletim')).map((s) => s.id);
  if (!tipo || !permitidas.includes(tipo.sala_id)) return { ok: false, erros: ['Selecione um tipo de boletim válido.'] };

  if (tipo.titulo_fixo) d = { ...d, titulo: tituloFixo(tipo.titulo_fixo, d.dataReferencia) };
  const { erros, competencia } = validarMetadados(d, tipo.periodicidade);
  let arquivo: Awaited<ReturnType<typeof lerPdfEnviado>> = null;
  try {
    arquivo = await lerPdfEnviado(pdf, true);
  } catch (e) {
    if (!(e instanceof ErroUpload)) throw e;
    erros.push(e.message);
  }
  if (erros.length || !arquivo) return { ok: false, erros };

  const gravados: string[] = [];
  const id = await comLimpeza(gravados, () => transacao(async (c) => {
    const pdf = await registrarArquivo(
      arquivo,
      { salaId: tipo.sala_id, ...destinoPdf(tipo.pasta, d.dataReferencia), usuarioId: autor.id },
      c,
    );
    gravados.push(pdf.caminho);
    const pdfId = pdf.id;
    const r = await c.query<{ id: string }>(
      `INSERT INTO boletins (sala_id, tipo_id, titulo, data_referencia, competencia, status, pdf_arquivo_id, criado_por, atualizado_por)
       VALUES ($1, $2, $3, $4, $5, 'rascunho', $6, $7, $7) RETURNING id`,
      [tipo.sala_id, tipo.id, d.titulo.trim(), d.dataReferencia, competencia, pdfId, autor.id],
    );
    const id = Number(r.rows[0]!.id);
    await c.query(
      `INSERT INTO boletim_status_log (boletim_id, status_de, status_para, usuario_id, comentario)
       VALUES ($1, NULL, 'rascunho', $2, 'Boletim criado')`,
      [id, autor.id],
    );
    await versionar(c, id, autor.id, 'Criação');
    await auditar(
      { modulo: 'boletins', acao: 'criar', entidade: 'boletins', entidadeId: id, salaId: tipo.sala_id,
        descricao: `Boletim criado: ${d.titulo.trim()}`, depois: await resumo(c, id), usuario: autor, ...origem },
      c,
    );
    return id;
  }));
  return { ok: true, id };
}

/** Altera título/data/competência e, opcionalmente, substitui o PDF. Só em rascunho ou revisão. */
export async function atualizar(
  a: Acl,
  id: number,
  d: Omit<DadosBoletim, 'tipoId'>,
  pdf: FormDataEntryValue | null,
  autor: Autor,
  origem: Origem,
): Promise<Resultado<{ mudou: boolean }>> {
  const b = await obter(id);
  if (!b) return { ok: false, erros: ['Boletim não encontrado.'] };
  if (!administra(b, a)) {
    if (!a.pode('editar_boletim', b.sala_id)) return { ok: false, erros: ['Sem permissão para editar boletins desta sala.'] };
    if (!EDITAVEIS.includes(b.status)) return { ok: false, erros: [msgNaoEditavel(b.status)] };
  }

  if (b.tipo_titulo_fixo) d = { ...d, titulo: tituloFixo(b.tipo_titulo_fixo, d.dataReferencia) };
  const { erros, competencia } = validarMetadados({ ...d, tipoId: b.tipo_id }, b.periodicidade);
  let arquivo: Awaited<ReturnType<typeof lerPdfEnviado>> = null;
  try {
    arquivo = await lerPdfEnviado(pdf, false);
  } catch (e) {
    if (!(e instanceof ErroUpload)) throw e;
    erros.push(e.message);
  }
  if (erros.length) return { ok: false, erros };

  const titulo = d.titulo.trim();
  const mudouDados = titulo !== b.titulo || d.dataReferencia !== b.data_referencia || competencia !== b.competencia;
  if (!mudouDados && !arquivo) return { ok: true, mudou: false };

  const gravados: string[] = [];
  return comLimpeza(gravados, () => transacao(async (c) => {
    const antes = await resumo(c, id);
    let pdfId: number | null = null;
    if (arquivo) {
      const pdf = await registrarArquivo(
        arquivo,
        { salaId: b.sala_id, ...destinoPdf(b.tipo_pasta, d.dataReferencia), usuarioId: autor.id },
        c,
      );
      gravados.push(pdf.caminho);
      pdfId = pdf.id;
    }
    // Só grava se o status não mudou desde a leitura (edição concorrente).
    const r = await c.query(
      `UPDATE boletins SET titulo = $2, data_referencia = $3, competencia = $4, atualizado_por = $5,
              pdf_arquivo_id = coalesce($6, pdf_arquivo_id)
        WHERE id = $1 AND status = $7 AND excluido_em IS NULL`,
      [id, titulo, d.dataReferencia, competencia, autor.id, pdfId, b.status],
    );
    if (!r.rowCount) throw new Concorrencia();
    await versionar(c, id, autor.id, pdfId ? 'PDF substituído' : 'Dados alterados');
    await auditar(
      { modulo: 'boletins', acao: pdfId ? 'substituir_pdf' : 'editar', entidade: 'boletins', entidadeId: id, salaId: b.sala_id,
        descricao: `${pdfId ? 'PDF substituído' : 'Boletim alterado'}: ${titulo}`,
        antes, depois: await resumo(c, id), usuario: autor, ...origem },
      c,
    );
    return { ok: true as const, mudou: true };
  })).catch((e: unknown) => {
    if (e instanceof Concorrencia) return { ok: false as const, erros: [MSG_CONCORRENCIA] };
    throw e;
  });
}

/** Exclusão lógica. Publicado precisa ser despublicado antes. */
export async function excluir(a: Acl, id: number, autor: Autor, origem: Origem): Promise<string[]> {
  const b = await obter(id);
  if (!b) return ['Boletim não encontrado.'];
  const admin = administra(b, a);
  if (!admin) {
    if (!a.pode('excluir_boletim', b.sala_id)) return ['Sem permissão para excluir boletins desta sala.'];
    if (b.status === 'publicado') return ['Boletim publicado não pode ser excluído. Despublique-o antes.'];
  }
  return transacao(async (c) => {
    const r = await c.query(
      `UPDATE boletins SET excluido_em = now(), excluido_por = $2
        WHERE id = $1 AND ($3 OR status <> 'publicado') AND excluido_em IS NULL`,
      [id, autor.id, admin],
    );
    if (!r.rowCount) return [MSG_CONCORRENCIA];
    await auditar(
      { modulo: 'boletins', acao: 'excluir', entidade: 'boletins', entidadeId: id, salaId: b.sala_id,
        descricao: `Boletim excluído: ${b.titulo}`, antes: await resumo(c, id), usuario: autor, ...origem },
      c,
    );
    return [];
  });
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function transicionar(
  a: Acl,
  id: number,
  acao: string,
  comentario: string,
  autor: Autor,
  origem: Origem,
): Promise<Resultado<{ para: Status }>> {
  const b = await obter(id);
  if (!b) return { ok: false, erros: ['Boletim não encontrado.'] };
  if (!(acao in TRANSICOES)) return { ok: false, erros: ['Ação inválida.'] };
  const t = TRANSICOES[acao as Acao];
  const disponivel = acoesDisponiveis(b, a).find((x) => x.acao === acao);
  if (!disponivel) {
    return {
      ok: false,
      erros: [
        a.pode(t.permissao, b.sala_id)
          ? `"${t.rotulo}" não é possível com o boletim em "${ROTULO_STATUS[b.status]}".`
          : `Sem permissão para "${t.rotulo}" nesta sala.`,
      ],
    };
  }
  if (disponivel.bloqueio) return { ok: false, erros: [disponivel.bloqueio] };
  const texto = [...comentario.trim()].slice(0, 500).join('');
  if (acao === 'devolver' && !texto) {
    return { ok: false, erros: ['Informe o motivo da devolução para quem vai ajustar o boletim.'] };
  }

  return transacao(async (c) => {
    const publicar = acao === 'publicar';
    const r = await c.query(
      `UPDATE boletins SET status = $2, atualizado_por = $3
              ${publicar ? ', publicado_em = now(), publicado_por = $3' : ''}
        WHERE id = $1 AND status = $4 AND excluido_em IS NULL`,
      [id, t.para, autor.id, b.status],
    );
    if (!r.rowCount) {
      return { ok: false as const, erros: [MSG_CONCORRENCIA] };
    }
    await c.query(
      `INSERT INTO boletim_status_log (boletim_id, status_de, status_para, usuario_id, comentario)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, b.status, t.para, autor.id, texto || null],
    );
    await versionar(c, id, autor.id, t.rotulo + (texto ? `: ${texto}` : ''));
    await auditar(
      { modulo: 'boletins', acao, entidade: 'boletins', entidadeId: id, salaId: b.sala_id,
        descricao: `${t.rotulo}: ${b.titulo}`, antes: { status: b.status },
        depois: { status: t.para, comentario: texto || null }, usuario: autor, ...origem },
      c,
    );
    return { ok: true as const, para: t.para as Status };
  });
}

/** "Salvar uma versão agora": fotografia do boletim em rascunho ou revisão, com um comentário. Devolve o número da versão. */
export async function salvarVersao(a: Acl, id: number, comentario: string, autor: Autor, origem: Origem): Promise<Resultado<{ versao: number }>> {
  const b = await obter(id);
  if (!b) return { ok: false, erros: ['Boletim não encontrado.'] };
  if (!a.pode('editar_boletim', b.sala_id)) return { ok: false, erros: ['Sem permissão para editar boletins desta sala.'] };
  if (!EDITAVEIS.includes(b.status)) return { ok: false, erros: [msgNaoEditavel(b.status)] };
  const texto = [...comentario.trim()].slice(0, 500).join('');
  const versao = await transacao(async (c) => {
    const v = await versionar(c, id, autor.id, texto || 'Versão salva manualmente');
    await auditar(
      { modulo: 'boletins', acao: 'salvar_versao', entidade: 'boletins', entidadeId: id, salaId: b.sala_id,
        descricao: `Versão v${v} salva: ${b.titulo}`, depois: { versao: v, comentario: texto || null }, usuario: autor, ...origem },
      c,
    );
    return v;
  });
  return { ok: true, versao };
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

const MSG_CONCORRENCIA = 'O boletim foi alterado por outra pessoa. Atualize a página e tente de novo.';
class Concorrencia extends Error {}

/** Se a operação falhar, apaga do disco os arquivos gravados nela (a transação já foi desfeita). */
async function comLimpeza<T>(gravados: string[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    await Promise.all(gravados.map((g) => removerDoDisco(g).catch(() => {})));
    throw e;
  }
}

function msgNaoEditavel(s: Status): string {
  return `Boletim com status "${ROTULO_STATUS[s]}" não pode ser editado. ${
    s === 'publicado' ? 'Despublique-o antes.' : s === 'arquivado' ? 'Reabra-o antes.' : 'Devolva-o para ajustes antes.'
  }`;
}

async function resumo(c: pg.PoolClient, id: number) {
  const r = await c.query(
    `SELECT titulo, to_char(data_referencia, 'YYYY-MM-DD') AS data_referencia, competencia, status, pdf_arquivo_id::text
       FROM boletins WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

/** Fotografia do boletim → nova versão (na mesma transação). */
async function versionar(c: pg.PoolClient, id: number, autorId: number, comentario: string): Promise<number> {
  const r = await c.query<{ versao_atual: number; status: string; pdf_arquivo_id: string | null }>(
    'SELECT versao_atual, status, pdf_arquivo_id::text FROM boletins WHERE id = $1 FOR UPDATE',
    [id],
  );
  const b = r.rows[0]!;
  const versao = b.versao_atual + 1;
  await c.query(
    `INSERT INTO boletim_versoes (boletim_id, versao, status, dados, pdf_arquivo_id, comentario, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, versao, b.status, JSON.stringify(await resumo(c, id)), b.pdf_arquivo_id, [...comentario].slice(0, 500).join(''), autorId],
  );
  await c.query('UPDATE boletins SET versao_atual = $2 WHERE id = $1', [id, versao]);
  return versao;
}

/** Títulos dos boletins das salas (os mais recentes primeiro), para o autocompletar da busca. */
export async function sugestoesTitulos(salas: number[]): Promise<string[]> {
  if (!salas.length) return [];
  const r = await query<{ titulo: string }>(
    `SELECT titulo FROM boletins WHERE excluido_em IS NULL AND sala_id = ANY($1::int[])
      GROUP BY titulo ORDER BY max(data_referencia) DESC LIMIT 300`,
    [salas],
  );
  return r.map((x) => x.titulo);
}
