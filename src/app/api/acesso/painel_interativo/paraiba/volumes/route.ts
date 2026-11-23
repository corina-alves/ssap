import { NextResponse, type NextRequest } from 'next/server';
import { exigirApiEmAlguma } from '@/lib/acesso/api';
import { SALA_VALE_PARAIBA, volumesParaiba } from '@/lib/hidrologia/paraiba-do-sul';
import { dataValida, PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

/**
 * GET ?data= — gráficos de volume da página Paraíba do Sul: volume útil (%) de
 * cada dia dos reservatórios e do reservatório equivalente, de 1º/01 de 4 anos
 * atrás até a data (CSVs anuais do ONS; os anos fechados ficam guardados no cache).
 * Acesso: visualizar_dashboard na Sala Alfredo Pisani ou na Sala Vale do Paraíba.
 */
export async function GET(req: NextRequest) {
  const acesso = await exigirApiEmAlguma([SALA_PAINEL, SALA_VALE_PARAIBA], PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const pedida = req.nextUrl.searchParams.get('data');
  const data = dataValida(pedida) && pedida <= hojeSp() ? pedida : hojeSp();
  const v = await volumesParaiba(data).catch(() => null);
  if (!v) return NextResponse.json({ erro: 'ONS fora do ar e sem cópia guardada' }, { status: 503 });
  return NextResponse.json({ data, ...v }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
