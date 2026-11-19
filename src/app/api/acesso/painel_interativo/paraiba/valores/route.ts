import { NextResponse, type NextRequest } from 'next/server';
import { exigirApiEmAlguma } from '@/lib/acesso/api';
import { filtrarPostos, SALA_VALE_PARAIBA, valoresPostos, valoresPrincipais } from '@/lib/hidrologia/paraiba-do-sul';
import { dataValida, PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

const lista = (t: string | null) => (t ?? '').split(',').filter(Boolean).slice(0, 60);
const numeros = (t: string | null) => lista(t).map(Number).filter(Number.isInteger);

/**
 * GET ?data= — valores do diagrama unifilar da bacia do Paraíba do Sul.
 *   Sem postos: reservatórios e usinas do ONS e a transposição do SSD (o `p`
 *   que o diagrama manda é ignorado: o servidor sabe o que o diagrama usa).
 *   Com f= (postos do SIBH), a= (estações da ANA) ou c= (pluviômetros do SIBH):
 *   só esses, e só os que estão no diagrama.
 * Acesso: visualizar_dashboard na Sala Alfredo Pisani ou na Sala Vale do Paraíba.
 */
export async function GET(req: NextRequest) {
  const acesso = await exigirApiEmAlguma([SALA_PAINEL, SALA_VALE_PARAIBA], PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const busca = req.nextUrl.searchParams;
  const pedida = busca.get('data');
  const data = dataValida(pedida) && pedida <= hojeSp() ? pedida : hojeSp();
  const postos = filtrarPostos(numeros(busca.get('f')), lista(busca.get('a')), numeros(busca.get('c')));
  const comPostos = postos.sibh.length + postos.ana.length + postos.pluvio.length > 0;
  const valores = comPostos ? await valoresPostos(data, postos) : await valoresPrincipais(data);
  return NextResponse.json({ data, valores }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
