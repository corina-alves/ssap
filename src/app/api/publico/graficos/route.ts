import { query } from '@/lib/db';
import { comCores, type ConfigGrafico } from '@/lib/graficos-tabela';

type Linha = {
  id: number;
  sala_slug: string;
  sala_nome: string;
  slug: string;
  titulo: string;
  tipo: string;
  fonte: string | null;
  config: ConfigGrafico | null;
  publicado_em: Date | null;
  atualizado_em: Date | null;
};

/**
 * Gráficos publicados, em JSON — para o site público desenhar (Chart.js).
 * Lê somente vw_graficos_publicados (publicado, não excluído, sala ativa).
 *
 *   GET /api/publico/graficos?sala=alfredo-pisani&slug=chuva-mensal
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const sala = (q.get('sala') ?? '').trim();
  const slug = (q.get('slug') ?? '').trim();
  if ((sala && !/^[a-z0-9-]{1,60}$/.test(sala)) || (slug && !/^[a-z0-9-]{1,120}$/.test(slug))) {
    return Response.json({ ok: false, erro: 'Parâmetro inválido.' }, { status: 400 });
  }

  const linhas = await query<Linha>(
    `SELECT id::int, sala_slug, sala_nome, slug, titulo, tipo, fonte, config, publicado_em, atualizado_em
       FROM vw_graficos_publicados
      WHERE ($1 = '' OR sala_slug = $1) AND ($2 = '' OR slug = $2)
      ORDER BY publicado_em DESC LIMIT 100`,
    [sala, slug],
  );
  return Response.json(
    {
      ok: true,
      total: linhas.length,
      graficos: linhas.map((g) => {
        const c = g.config ?? {};
        return {
          id: g.id,
          sala: { slug: g.sala_slug, nome: g.sala_nome },
          slug: g.slug,
          titulo: g.titulo,
          tipo: g.tipo,
          fonte: g.fonte,
          unidade: c.unidade ?? '',
          eixo_y: c.eixo_y ?? '',
          empilhado: !!c.empilhado,
          rotulos: c.rotulos ?? [],
          series: comCores(c.series ?? [], c.cores),
          atualizado_em: g.atualizado_em ?? g.publicado_em,
        };
      }),
    },
    { headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' } },
  );
}
