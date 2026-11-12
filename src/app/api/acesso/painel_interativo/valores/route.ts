import { NextResponse, type NextRequest } from 'next/server';
import { IDS_RADAR } from '@/conteudo/diagramas-unifilares';
import { exigirApi } from '@/lib/acesso/api';
import { chuvaRadarDia, dataValida, localPermitido, PERMISSAO_PAINEL, SALA_PAINEL, valoresDiagrama, VAR } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

const VARIAVEIS = new Set<number>(Object.values(VAR));

/**
 * GET ?p=local:variável,local:variável… &r=posto,posto… &data= — valores para os
 * campos de um diagrama do SSD e, com `r`, a chuva do dia por radar dos postos
 * do SIBH (só os dos diagramas; chave radar:<posto>).
 */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_PAINEL, PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const busca = req.nextUrl.searchParams;
  const pedida = busca.get('data');
  const data = dataValida(pedida) && pedida <= hojeSp() ? pedida : hojeSp();
  const pares = [...new Set((busca.get('p') ?? '').split(','))]
    .slice(0, 80)
    .map((s) => s.split(':').map(Number) as [number, number])
    .filter(([space, v]) => Number.isInteger(space) && VARIAVEIS.has(v));
  const radares = [...new Set((busca.get('r') ?? '').split(',').map(Number))].filter((id) => IDS_RADAR.has(id));
  const permitidos: [number, number][] = [];
  for (const par of pares) if (await localPermitido(par[0])) permitidos.push(par);
  // radar fora do ar não derruba os valores do SSD: os postos ficam sem valor ("—")
  const [valores, radar] = await Promise.all([valoresDiagrama(permitidos, data), chuvaRadarDia(radares, data).catch(() => ({}))]);
  return NextResponse.json({ data, valores: { ...valores, ...radar } }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
