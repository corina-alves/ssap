import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi, lerConfig } from '@/lib/acesso/api';
import { CHAVE_MEDIAS, dadosPcj, MEDIAS_INICIAIS, PERMISSAO_PCJ, SALA_PCJ, type Medias } from '@/lib/boletins-sala/pcj';

// A primeira consulta do dia ao SIBH pode levar perto de 1 minuto.
export const maxDuration = 180;

/** GET ?data=AAAA-MM-DD (padrão: hoje) — dados do Boletim Diário PCJ. */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_PCJ, PERMISSAO_PCJ);
  if (acesso instanceof NextResponse) return acesso;
  const medias = (await lerConfig<Medias>(CHAVE_MEDIAS)) ?? MEDIAS_INICIAIS;
  return NextResponse.json(await dadosPcj(req.nextUrl.searchParams.get('data') ?? '', medias));
}
