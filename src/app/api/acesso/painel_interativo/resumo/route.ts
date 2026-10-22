import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { dataValida, PERMISSAO_PAINEL, resumoSistemas, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

/** GET ?data=AAAA-MM-DD — indicadores do SIM e dos sistemas produtores (SSD). */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_PAINEL, PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const pedida = req.nextUrl.searchParams.get('data');
  const data = dataValida(pedida) && pedida <= hojeSp() ? pedida : hojeSp();
  return NextResponse.json({ data, sistemas: await resumoSistemas(data) }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
