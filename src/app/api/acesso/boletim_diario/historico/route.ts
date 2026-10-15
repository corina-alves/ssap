import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { fimDaJanela, PERMISSAO_DIARIO, SALA_DIARIO } from '@/lib/boletins-sala/diario';
import { historicoMensal } from '@/lib/boletins-sala/diario-historico';

// A primeira consulta do mês percorre a série dos postos (alguns minutos).
export const maxDuration = 300;

/** GET ?cidade=A&cidade=B — média histórica de chuva do mês do boletim, dos municípios pedidos e das UGRHIs. */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_DIARIO, PERMISSAO_DIARIO);
  if (acesso instanceof NextResponse) return acesso;
  const cidades = req.nextUrl.searchParams.getAll('cidade').slice(0, 30);
  const d = new Date(fimDaJanela() - 3 * 3_600_000); // horário de São Paulo
  const h = await historicoMensal(d.getUTCFullYear(), d.getUTCMonth() + 1, cidades);
  return h ? NextResponse.json(h) : NextResponse.json({ erro: 'Postos do SIBH indisponíveis no momento; tente de novo em alguns minutos.' }, { status: 502 });
}
