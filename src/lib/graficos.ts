import 'server-only';
import { auditar } from './auditoria';
import { query, queryOne, transacao } from './db';
import { corValida, ErroValidacao, lerTabela, slug, TIPOS, type ConfigGrafico, type SerieGrafico } from './graficos-tabela';
import type { Origem } from './requisicao';

/** Gráficos da sala (porte de GraficoService.php). Os dados entram como tabela colada. */

export type Grafico = {
  id: number;
  sala_id: number;
  titulo: string;
  slug: string;
  tipo: string;
  fonte: string | null;
  config: ConfigGrafico | null;
  status: 'rascunho' | 'publicado';
  criado_em: Date;
  atualizado_em: Date | null;
  atualizado_por_nome?: string | null;
};

type Autor = { id: number; nome: string };

export async function listar(salaId: number): Promise<Grafico[]> {
  return query<Grafico>(
    `SELECT g.id::int, g.sala_id, g.titulo, g.slug, g.tipo, g.fonte, g.config, g.status, g.criado_em, g.atualizado_em,
            u.nome AS atualizado_por_nome
       FROM graficos g LEFT JOIN usuarios u ON u.id = coalesce(g.atualizado_por, g.criado_por)
      WHERE g.sala_id = $1 AND g.excluido_em IS NULL
      ORDER BY coalesce(g.atualizado_em, g.criado_em) DESC`,
    [salaId],
  );
}

export async function obter(id: number): Promise<Grafico | null> {
  return queryOne<Grafico>(
    `SELECT g.id::int, g.sala_id, g.titulo, g.slug, g.tipo, g.fonte, g.config, g.status, g.criado_em, g.atualizado_em
       FROM graficos g JOIN salas s ON s.id = g.sala_id AND s.excluido_em IS NULL
      WHERE g.id = $1 AND g.excluido_em IS NULL`,
    [id],
  );
}

export type DadosGrafico = {
  titulo: string;
  tipo: string;
  fonte: string;
  unidade: string;
  eixo_y: string;
  empilhado: boolean;
  /** Tabela colada (texto). */
  dados: string;
  /** Cor fixa por nome de série (opcional; na edição, sem isso, mantém as que já havia). */
  cores?: Record<string, string>;
};

/** Cria (id null) ou atualiza. Lança ErroValidacao com a lista de problemas. Devolve o id. */
export async function salvar(id: number | null, salaId: number, d: DadosGrafico, autor: Autor, origem: Origem): Promise<number> {
  const antes = id ? await obter(id) : null;
  if (id && (!antes || antes.sala_id !== salaId)) throw new ErroValidacao(['Gráfico não encontrado.']);

  const titulo = d.titulo.trim();
  const fonte = d.fonte.trim();
  const unidade = d.unidade.trim();
  const eixoY = d.eixo_y.trim();
  const erros: string[] = [];
  const n = (t: string) => [...t].length;
  if (n(titulo) < 3 || n(titulo) > 255) erros.push('Título: informe de 3 a 255 caracteres.');
  if (!Object.hasOwn(TIPOS, d.tipo)) erros.push('Tipo de gráfico inválido.');
  if (n(fonte) > 60) erros.push('Fonte: no máximo 60 caracteres.');
  if (n(unidade) > 20) erros.push('Unidade: no máximo 20 caracteres.');
  if (n(eixoY) > 60) erros.push('Título do eixo: no máximo 60 caracteres.');

  let rotulos: string[] = [];
  let series: SerieGrafico[] = [];
  try {
    ({ rotulos, series } = lerTabela(d.dados));
  } catch (e) {
    if (!(e instanceof ErroValidacao)) throw e;
    erros.push(...e.erros);
  }
  if (erros.length) throw new ErroValidacao(erros);

  // Cores fixas por série: as informadas ou, na edição, as que o gráfico já tinha.
  const nomes = new Set(series.map((s) => s.nome));
  const cores = Object.fromEntries(Object.entries(d.cores ?? antes?.config?.cores ?? {}).filter(([nome, c]) => nomes.has(nome) && corValida(c)));
  const config: ConfigGrafico = {
    fonte_dados: 'manual', rotulos, series, unidade, eixo_y: eixoY, empilhado: d.empilhado,
    ...(Object.keys(cores).length ? { cores } : {}),
  };

  return transacao(async (c) => {
    let novoId: number;
    if (antes) {
      await c.query('UPDATE graficos SET titulo = $2, tipo = $3, fonte = $4, config = $5::jsonb, atualizado_por = $6 WHERE id = $1', [
        antes.id, titulo, d.tipo, fonte || null, JSON.stringify(config), autor.id,
      ]);
      novoId = antes.id;
    } else {
      // slug único na sala: "titulo", "titulo-2", "titulo-3"...
      const base = slug(titulo);
      const usados = new Set((await c.query<{ slug: string }>('SELECT slug FROM graficos WHERE sala_id = $1 AND slug LIKE $2', [salaId, `${base}%`])).rows.map((r) => r.slug));
      let s = base;
      for (let i = 2; usados.has(s); i++) s = `${base}-${i}`;
      const r = await c.query<{ id: number }>(
        `INSERT INTO graficos (sala_id, titulo, slug, tipo, fonte, config, status, criado_por, atualizado_por)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'rascunho', $7, $7) RETURNING id::int`,
        [salaId, titulo, s, d.tipo, fonte || null, JSON.stringify(config), autor.id],
      );
      novoId = r.rows[0]!.id;
    }
    await auditar(
      { modulo: 'graficos', acao: antes ? 'editar' : 'criar', entidade: 'graficos', entidadeId: novoId, salaId,
        descricao: `${antes ? 'Gráfico alterado' : 'Gráfico criado'}: ${titulo}`,
        antes: antes ? { titulo: antes.titulo, tipo: antes.tipo } : undefined,
        depois: { titulo, tipo: d.tipo, series: series.length, pontos: rotulos.length }, usuario: autor, ...origem },
      c,
    );
    return novoId;
  });
}

export async function publicar(g: Grafico, publicarAgora: boolean, autor: Autor, origem: Origem): Promise<void> {
  const status = publicarAgora ? 'publicado' : 'rascunho';
  await query(
    `UPDATE graficos SET status = $2, publicado_em = CASE WHEN $3 THEN now() ELSE publicado_em END, atualizado_por = $4 WHERE id = $1`,
    [g.id, status, publicarAgora, autor.id],
  );
  await auditar({
    modulo: 'graficos', acao: publicarAgora ? 'publicar' : 'despublicar', entidade: 'graficos', entidadeId: g.id, salaId: g.sala_id,
    descricao: `${publicarAgora ? 'Gráfico publicado' : 'Gráfico despublicado'}: ${g.titulo}`,
    antes: { status: g.status }, depois: { status }, usuario: autor, ...origem,
  });
}

/** Exclusão lógica. Publicado precisa ser despublicado antes. */
export async function excluir(g: Grafico, autor: Autor, origem: Origem): Promise<string | null> {
  if (g.status === 'publicado') return 'Gráfico publicado não pode ser excluído. Despublique-o antes.';
  await query('UPDATE graficos SET excluido_em = now(), excluido_por = $2 WHERE id = $1', [g.id, autor.id]);
  await auditar({
    modulo: 'graficos', acao: 'excluir', entidade: 'graficos', entidadeId: g.id, salaId: g.sala_id,
    descricao: `Gráfico excluído: ${g.titulo}`, antes: { titulo: g.titulo }, usuario: autor, ...origem,
  });
  return null;
}
