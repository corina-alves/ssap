import { NextResponse } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { diagrama, PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';

/** GET — diagrama oficial do SSD (SVG limpo), para ser embutido no painel. */
export async function GET(_req: Request, { params }: { params: Promise<{ nome: string }> }) {
  const acesso = await exigirApi(SALA_PAINEL, PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const svg = await diagrama((await params).nome);
  if (!svg) return NextResponse.json({ erro: 'Diagrama indisponível.' }, { status: 404 });
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'private, max-age=3600' } });
}
