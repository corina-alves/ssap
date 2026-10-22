import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { dataValida, detalheSistema, PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

/** GET ?data=AAAA-MM-DD — reservatórios, módulos à parte e transferências de um sistema. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ chave: string }> }) {
  const acesso = await exigirApi(SALA_PAINEL, PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const { chave } = await params;
  const pedida = req.nextUrl.searchParams.get('data');
  const data = dataValida(pedida) && pedida <= hojeSp() ? pedida : hojeSp();
  const d = await detalheSistema(chave, data);
  if (!d) return NextResponse.json({ erro: 'Detalhamento ainda não disponível para este sistema.' }, { status: 404 });
  return NextResponse.json({ data, ...d }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
