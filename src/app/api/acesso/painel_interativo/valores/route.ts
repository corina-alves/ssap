import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { dataValida, localPermitido, PERMISSAO_PAINEL, SALA_PAINEL, valoresDiagrama, VAR } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

const VARIAVEIS = new Set<number>(Object.values(VAR));

/** GET ?p=local:variável,local:variável… &data= — valores para os campos de um diagrama do SSD. */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_PAINEL, PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const pedida = req.nextUrl.searchParams.get('data');
  const data = dataValida(pedida) && pedida <= hojeSp() ? pedida : hojeSp();
  const pares = [...new Set((req.nextUrl.searchParams.get('p') ?? '').split(','))]
    .slice(0, 80)
    .map((s) => s.split(':').map(Number) as [number, number])
    .filter(([space, v]) => Number.isInteger(space) && VARIAVEIS.has(v));
  const permitidos: [number, number][] = [];
  for (const par of pares) if (await localPermitido(par[0])) permitidos.push(par);
  return NextResponse.json({ data, valores: await valoresDiagrama(permitidos, data) }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
