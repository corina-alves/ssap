import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { dadosDiario, PERMISSAO_DIARIO, SALA_DIARIO } from '@/lib/boletins-sala/diario';

export const maxDuration = 120;

/** GET [?atualizar=1] — dados do Boletim Diário da Sala de Situação Alfredo Pisani. */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_DIARIO, PERMISSAO_DIARIO);
  if (acesso instanceof NextResponse) return acesso;
  return NextResponse.json(await dadosDiario(req.nextUrl.searchParams.get('atualizar') === '1'));
}
