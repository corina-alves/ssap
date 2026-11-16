import { NextResponse, type NextRequest } from 'next/server';
import { IDS_RADAR, POSTOS_SIBH } from '@/conteudo/diagramas-unifilares';
import { exigirApi } from '@/lib/acesso/api';
import { leiturasPostos } from '@/lib/hidrologia/cantareira-operacao';
import { chuvaRadarDia, dataValida, localPermitido, PERMISSAO_PAINEL, SALA_PAINEL, valoresDiagrama, VAR } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

const VARIAVEIS = new Set<number>(Object.values(VAR));

const ids = (texto: string | null, permitido: (id: number) => boolean) => [...new Set((texto ?? '').split(',').map(Number))].filter(permitido);

/**
 * GET ?p=local:variável,local:variável… &r=posto,posto… &f=posto,posto… &data=
 * — valores para os campos de um diagrama do SSD; com `r`, a chuva do dia por
 * radar (chave radar:<posto>); com `f`, o nível e a vazão dos postos
 * fluviométricos (sibh-nivel:<posto>, sibh-vazao:<posto>). Postos do SIBH: só
 * os dos diagramas.
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
  const radares = ids(busca.get('r'), (id) => IDS_RADAR.has(id));
  const postos = ids(busca.get('f'), (id) => POSTOS_SIBH.has(id));
  const permitidos: [number, number][] = [];
  for (const par of pares) if (await localPermitido(par[0])) permitidos.push(par);
  // SIBH fora do ar não derruba os valores do SSD: os postos ficam sem valor ("—")
  const [valores, radar, fluviometricos] = await Promise.all([
    valoresDiagrama(permitidos, data),
    chuvaRadarDia(radares, data).catch(() => ({})),
    leiturasPostos(postos, data).catch(() => ({})),
  ]);
  return NextResponse.json({ data, valores: { ...valores, ...radar, ...fluviometricos } }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
