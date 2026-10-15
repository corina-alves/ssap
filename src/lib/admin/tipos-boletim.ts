import 'server-only';
import { auditar } from '../auditoria';
import { query, queryOne } from '../db';
import type { Origem } from '../requisicao';
import type { Autor } from './usuarios';
import { RE_SLUG, Validador } from './validacao';

/**
 * Tipos de boletim de cada sala. Todos por upload do PDF pronto (os
 * geradores automáticos saíram da referência). Sala e identificador são
 * fixos depois de criados.
 */

export const PERIODICIDADES = { diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal', eventual: 'Eventual' } as const;

export type TipoBoletim = {
  id: number;
  sala_id: number;
  slug: string;
  nome: string;
  descricao: string | null;
  periodicidade: keyof typeof PERIODICIDADES;
  exige_revisao: boolean;
  publico: boolean;
  ativo: boolean;
  ordem: number;
};

export type TipoLista = TipoBoletim & { sala_nome: string; sala_sigla: string | null; total_boletins: number };

export async function listarTipos(salaId?: number): Promise<TipoLista[]> {
  return query<TipoLista>(
    `SELECT t.id, t.sala_id, t.slug, t.nome, t.descricao, t.periodicidade, t.exige_revisao, t.publico, t.ativo, t.ordem,
            s.nome AS sala_nome, s.sigla AS sala_sigla,
            (SELECT count(*)::int FROM boletins b WHERE b.tipo_id = t.id AND b.excluido_em IS NULL) AS total_boletins
       FROM tipos_boletim t JOIN salas s ON s.id = t.sala_id
      WHERE s.excluido_em IS NULL AND ($1::int IS NULL OR t.sala_id = $1)
      ORDER BY s.ordem, t.ordem, t.nome`,
    [salaId ?? null],
  );
}

export async function obterTipo(id: number): Promise<TipoBoletim | null> {
  return queryOne<TipoBoletim>(
    `SELECT id, sala_id, slug, nome, descricao, periodicidade, exige_revisao, publico, ativo, ordem
       FROM tipos_boletim WHERE id = $1`,
    [id],
  );
}

export type DadosTipo = {
  salaId: number;
  slug: string;
  nome: string;
  descricao: string;
  periodicidade: string;
  exigeRevisao: boolean;
  publico: boolean;
  ativo: boolean;
  ordem: string;
};

export async function salvarTipo(
  id: number | null,
  d: DadosTipo,
  autor: Autor,
  origem: Origem,
): Promise<{ ok: true; id: number } | { ok: false; erros: string[] }> {
  const antes = id ? await obterTipo(id) : null;
  if (id && !antes) return { ok: false, erros: ['Tipo de boletim não encontrado.'] };

  const salaId = antes ? antes.sala_id : d.salaId;
  const slug = antes ? antes.slug : d.slug.toLowerCase();
  const v = new Validador()
    .se(!(await queryOne('SELECT 1 FROM salas WHERE id = $1 AND excluido_em IS NULL', [salaId])), 'Sala: selecione uma sala válida.')
    .tamanho(d.nome, 'Nome', 3, 150)
    .formato(slug, RE_SLUG, 'Identificador: só letras minúsculas sem acento, números e hífen.')
    .tamanho(slug, 'Identificador', 2, 60)
    .tamanho(d.descricao, 'Descrição', 0, 500)
    .emLista(d.periodicidade, Object.keys(PERIODICIDADES), 'Periodicidade')
    .formato(d.ordem, /^\d{1,4}$/, 'Ordem: número inteiro de 0 a 9999.');
  if (!antes && (await queryOne('SELECT 1 FROM tipos_boletim WHERE sala_id = $1 AND slug = $2', [salaId, slug]))) {
    v.se(true, 'Esta sala já tem um tipo de boletim com este identificador.');
  }
  if (!v.ok) return { ok: false, erros: v.erros };

  const valores = [d.nome, d.descricao || null, d.periodicidade, d.exigeRevisao, d.publico, d.ativo, Number(d.ordem)];
  let novoId: number;
  if (antes) {
    await query(
      `UPDATE tipos_boletim SET nome = $2, descricao = $3, periodicidade = $4, exige_revisao = $5,
              publico = $6, ativo = $7, ordem = $8
        WHERE id = $1`,
      [antes.id, ...valores],
    );
    novoId = antes.id;
  } else {
    const r = await queryOne<{ id: number }>(
      `INSERT INTO tipos_boletim (sala_id, slug, nome, descricao, periodicidade, exige_revisao, publico, ativo, ordem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [salaId, slug, ...valores],
    ).catch((e: { code?: string }) => {
      if (e.code === '23505') return null;
      throw e;
    });
    if (!r) return { ok: false, erros: ['Esta sala já tem um tipo de boletim com este identificador.'] };
    novoId = r.id;
  }

  await auditar({
    modulo: 'tipos_boletim', acao: antes ? 'editar' : 'criar', entidade: 'tipos_boletim', entidadeId: novoId, salaId,
    descricao: `${antes ? 'Tipo de boletim alterado' : 'Tipo de boletim criado'}: ${d.nome}`,
    antes: antes ?? undefined, depois: await obterTipo(novoId), usuario: autor, ...origem,
  });
  return { ok: true, id: novoId };
}
