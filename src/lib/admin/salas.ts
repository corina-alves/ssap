import 'server-only';
import { auditar } from '../auditoria';
import { query, queryOne, transacao } from '../db';
import type { Origem } from '../requisicao';
import type { Autor } from './usuarios';
import { RE_SLUG, Validador } from './validacao';

/**
 * Cadastro de Salas de Situação e dos módulos habilitados em cada uma.
 * Sala nunca é apagada: é desativada (some das telas, dados preservados).
 * O slug é fixo depois de criado — ele aparece em URLs.
 */

export type SalaLista = {
  id: number;
  slug: string;
  nome: string;
  sigla: string | null;
  cor: string | null;
  status: 'ativa' | 'inativa';
  ordem: number;
  total_usuarios: number;
  total_tipos: number;
  modulos: string | null;
};

export type Sala = {
  id: number;
  slug: string;
  nome: string;
  sigla: string | null;
  descricao: string | null;
  cor: string | null;
  status: 'ativa' | 'inativa';
  ordem: number;
  modulos: number[];
};

export type Modulo = { id: number; slug: string; nome: string };

export async function listarSalas(): Promise<SalaLista[]> {
  return query<SalaLista>(
    `SELECT s.id, s.slug, s.nome, s.sigla, s.cor, s.status, s.ordem,
            (SELECT count(*)::int FROM usuario_salas us JOIN usuarios u ON u.id = us.usuario_id
              WHERE us.sala_id = s.id AND u.excluido_em IS NULL) AS total_usuarios,
            (SELECT count(*)::int FROM tipos_boletim t WHERE t.sala_id = s.id AND t.ativo) AS total_tipos,
            (SELECT string_agg(m.nome, ', ' ORDER BY m.ordem)
               FROM sala_modulos sm JOIN modulos m ON m.id = sm.modulo_id
              WHERE sm.sala_id = s.id AND sm.ativo) AS modulos
       FROM salas s
      WHERE s.excluido_em IS NULL
      ORDER BY s.ordem, s.nome`,
  );
}

export async function obterSala(id: number): Promise<Sala | null> {
  const s = await queryOne<Omit<Sala, 'modulos'>>(
    `SELECT id, slug, nome, sigla, descricao, cor, status, ordem FROM salas WHERE id = $1 AND excluido_em IS NULL`,
    [id],
  );
  if (!s) return null;
  const m = await query<{ modulo_id: number }>(
    'SELECT modulo_id FROM sala_modulos WHERE sala_id = $1 AND ativo ORDER BY modulo_id',
    [id],
  );
  return { ...s, modulos: m.map((r) => r.modulo_id) };
}

export async function listarModulos(): Promise<Modulo[]> {
  return query<Modulo>('SELECT id, slug, nome FROM modulos ORDER BY ordem');
}

export type DadosSala = {
  slug: string;
  nome: string;
  sigla: string;
  descricao: string;
  cor: string;
  status: string;
  ordem: string;
  modulos: number[];
};

export async function salvarSala(
  id: number | null,
  d: DadosSala,
  autor: Autor,
  origem: Origem,
): Promise<{ ok: true; id: number } | { ok: false; erros: string[] }> {
  const antes = id ? await obterSala(id) : null;
  if (id && !antes) return { ok: false, erros: ['Sala não encontrada.'] };

  const slug = antes ? antes.slug : d.slug.toLowerCase();
  const v = new Validador()
    .tamanho(d.nome, 'Nome', 3, 150)
    .formato(slug, RE_SLUG, 'Identificador: só letras minúsculas sem acento, números e hífen (ex.: baixada-santista).')
    .tamanho(slug, 'Identificador', 2, 60)
    .tamanho(d.sigla, 'Sigla', 0, 30)
    .tamanho(d.descricao, 'Descrição', 0, 500)
    .se(d.cor !== '' && !/^#[0-9a-fA-F]{6}$/.test(d.cor), 'Cor: use o formato #RRGGBB.')
    .emLista(d.status, ['ativa', 'inativa'], 'Situação')
    .formato(d.ordem, /^\d{1,4}$/, 'Ordem: número inteiro de 0 a 9999.');
  if (!antes && (await queryOne('SELECT 1 FROM salas WHERE slug = $1', [slug]))) {
    v.se(true, 'Já existe uma sala com este identificador.');
  }
  const idsModulos = new Set((await listarModulos()).map((m) => m.id));
  const modulos = [...new Set(d.modulos)];
  v.se(modulos.some((m) => !idsModulos.has(m)), 'Módulo inválido.');
  if (!v.ok) return { ok: false, erros: v.erros };

  const valores = [d.nome, d.sigla || null, d.descricao || null, d.cor || null, d.status, Number(d.ordem)];
  let novoId: number;
  try {
    novoId = await transacao(async (c) => {
      let sid: number;
      if (id) {
        await c.query(
          `UPDATE salas SET nome = $2, sigla = $3, descricao = $4, cor = $5, status = $6, ordem = $7 WHERE id = $1`,
          [id, ...valores],
        );
        sid = id;
      } else {
        const r = await c.query<{ id: number }>(
          `INSERT INTO salas (slug, nome, sigla, descricao, cor, status, ordem)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [slug, ...valores],
        );
        sid = r.rows[0]!.id;
      }
      await c.query('DELETE FROM sala_modulos WHERE sala_id = $1', [sid]);
      if (modulos.length) {
        await c.query('INSERT INTO sala_modulos (sala_id, modulo_id) SELECT $1, unnest($2::int[])', [sid, modulos]);
      }
      return sid;
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { ok: false, erros: ['Já existe uma sala com este identificador.'] };
    throw e;
  }

  await auditar({
    modulo: 'salas', acao: antes ? 'editar' : 'criar', entidade: 'salas', entidadeId: novoId, salaId: novoId,
    descricao: `${antes ? 'Sala alterada' : 'Sala criada'}: ${d.nome}`,
    antes: antes ?? undefined, depois: await obterSala(novoId), usuario: autor, ...origem,
  });
  return { ok: true, id: novoId };
}
