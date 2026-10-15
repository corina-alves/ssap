import { listarPublicados } from '@/lib/publico';
import { enderecoPublico } from '@/lib/requisicao';

/**
 * Boletins publicados, em JSON (para outros sites e painéis).
 *
 *   GET /api/publico/boletins?sala=pcj&tipo=boletim-diario&limite=20&pagina=1&de=2026-01-01&ate=2026-12-31
 *
 * Todos os parâmetros são opcionais.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const texto = (k: string) => (q.get(k) ?? '').trim();
  const sala = texto('sala');
  const tipo = texto('tipo');
  const de = texto('de');
  const ate = texto('ate');
  const limite = /^\d{1,3}$/.test(texto('limite')) ? Math.min(100, Math.max(1, Number(texto('limite')))) : 20;
  const pagina = /^\d{1,6}$/.test(texto('pagina')) ? Math.max(1, Number(texto('pagina'))) : 1;

  const erros: string[] = [];
  if (sala && !/^[a-z0-9-]{1,60}$/.test(sala)) erros.push('sala inválida');
  if (tipo && !/^[a-z0-9-]{1,60}$/.test(tipo)) erros.push('tipo inválido');
  for (const [k, v] of [['de', de], ['ate', ate]] as const) {
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) erros.push(`${k} deve estar no formato AAAA-MM-DD`);
  }
  if (erros.length) return Response.json({ ok: false, erro: erros.join('; ') }, { status: 400 });

  const { itens, total } = await listarPublicados({ sala, tipo, de, ate }, limite, (pagina - 1) * limite);
  const base = new URL('/boletins/arquivo/', enderecoPublico(req));
  return Response.json(
    {
      ok: true,
      total,
      pagina,
      limite,
      boletins: itens.map((b) => ({
        id: Number(b.id),
        sala: { slug: b.sala_slug, nome: b.sala_nome },
        tipo: { slug: b.tipo_slug, nome: b.tipo_nome, periodicidade: b.periodicidade },
        titulo: b.titulo,
        data_referencia: b.data_referencia,
        competencia: b.competencia,
        publicado_em: b.publicado_em,
        pdf: { url: new URL(b.id, base).toString(), tamanho: Number(b.pdf_tamanho), sha256: b.pdf_sha256 },
      })),
    },
    { headers: { 'Cache-Control': 'public, max-age=120', 'Access-Control-Allow-Origin': '*' } },
  );
}
