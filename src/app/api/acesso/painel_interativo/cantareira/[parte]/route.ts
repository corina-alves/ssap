import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { chuvaCantareira, operacaoCantareira, postosControle } from '@/lib/hidrologia/cantareira-operacao';
import { dataValida, PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

/**
 * GET ?data=AAAA-MM-DD — uma parte do painel de operação do Cantareira (abaixo
 * do diagrama unifilar), cada uma com a sua fonte, para a lentidão de uma não
 * segurar as outras:
 *   operacao  faixa da Res. ANA/DAEE 925, Santa Inês e vazão despachada para o PCJ (SSD)
 *   chuva     chuva por radar nas bacias dos reservatórios e a média climatológica (SIBH e SSD)
 *   controle  postos de controle de Valinhos, Atibaia e Buenópolis (SIBH)
 */
const PARTES = { operacao: operacaoCantareira, chuva: chuvaCantareira, controle: postosControle } as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ parte: string }> }) {
  const acesso = await exigirApi(SALA_PAINEL, PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const { parte } = await params;
  const montar = PARTES[parte as keyof typeof PARTES];
  if (!montar) return NextResponse.json({ erro: 'Parte desconhecida.' }, { status: 404 });
  const pedida = req.nextUrl.searchParams.get('data');
  const data = dataValida(pedida) && pedida <= hojeSp() ? pedida : hojeSp();
  try {
    return NextResponse.json(await montar(data), { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    return NextResponse.json({ erro: `${parte === 'operacao' ? 'SSD' : 'SIBH'} indisponível: ${(e as Error).message}` }, { status: 502 });
  }
}
