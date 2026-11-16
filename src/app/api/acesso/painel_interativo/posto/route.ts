import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { graficosPosto } from '@/lib/hidrologia/cantareira-operacao';
import { dataValida, PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

/**
 * GET ?id=<station_prefix_id>&data=AAAA-MM-DD — gráficos de um posto do SIBH
 * de um diagrama unifilar (só esses): vazão e nível médios por dia nos 30 dias
 * até a data e a chuva por radar da bacia dele.
 */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_PAINEL, PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const p = req.nextUrl.searchParams;
  const pedida = p.get('data');
  const data = dataValida(pedida) && pedida <= hojeSp() ? pedida : hojeSp();
  try {
    const g = await graficosPosto(Number(p.get('id')), data);
    if (!g) return NextResponse.json({ erro: 'Posto fora dos diagramas.' }, { status: 404 });
    return NextResponse.json(g, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    return NextResponse.json({ erro: `SIBH indisponível: ${(e as Error).message}` }, { status: 502 });
  }
}
