import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { dadosParaiba, PERMISSAO_PARAIBA, SALA_PARAIBA } from '@/lib/boletins-sala/paraiba';

export const maxDuration = 120;

/** GET [?atualizar=1] — dados do Boletim Diário Vale do Paraíba. */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_PARAIBA, PERMISSAO_PARAIBA);
  if (acesso instanceof NextResponse) return acesso;
  return NextResponse.json(await dadosParaiba(req.nextUrl.searchParams.get('atualizar') === '1'));
}
