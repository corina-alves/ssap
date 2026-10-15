import { listarPublicos } from '@/lib/documentos';
import { enderecoPublico } from '@/lib/requisicao';

/**
 * Documentos públicos, em JSON.
 *
 *   GET /api/publico/documentos?sala=alfredo-pisani&categoria=notas-tecnicas&limite=50
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const sala = (q.get('sala') ?? '').trim();
  const categoria = (q.get('categoria') ?? '').trim();
  const lim = (q.get('limite') ?? '').trim();
  const limite = /^\d{1,3}$/.test(lim) ? Math.min(200, Math.max(1, Number(lim))) : 50;
  if ((sala && !/^[a-z0-9-]{1,60}$/.test(sala)) || (categoria && !/^[a-z0-9-]{1,60}$/.test(categoria))) {
    return Response.json({ ok: false, erro: 'Parâmetro inválido.' }, { status: 400 });
  }

  const { itens, total } = await listarPublicos({ sala, categoria }, limite);
  const base = new URL('/documentos/arquivo/', enderecoPublico(req));
  return Response.json(
    {
      ok: true,
      total,
      documentos: itens.map((d) => ({
        id: Number(d.id),
        sala: { slug: d.sala_slug, nome: d.sala_nome },
        categoria: d.categoria_slug ? { slug: d.categoria_slug, nome: d.categoria_nome } : null,
        titulo: d.titulo,
        descricao: d.descricao,
        data: d.data,
        arquivo: { url: new URL(d.id, base).toString(), tipo: d.mime, tamanho: Number(d.tamanho), sha256: d.sha256 },
      })),
    },
    { headers: { 'Cache-Control': 'public, max-age=120', 'Access-Control-Allow-Origin': '*' } },
  );
}
