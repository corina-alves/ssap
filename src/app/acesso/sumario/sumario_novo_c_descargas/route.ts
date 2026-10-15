import { NextResponse, type NextRequest } from 'next/server';
import pagina from '@/conteudo/legado/sumario_hidrico';
import { exigirApi } from '@/lib/acesso/api';
import { acl, exigirSala } from '@/lib/auth/acl';
import { dataSumario, PERMISSAO_SUMARIO, SALA_SUMARIO, sumarioHidrico } from '@/lib/boletins-sala/sumario-hidrico';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

// A página usa script/estilo inline e html2canvas/jsPDF do cdnjs.
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
  "img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/**
 * Sumário Executivo — Situação Hídrica (Sala Alfredo Pisani), no endereço do
 * PHP: a página original, e com ?ajax=1&data=AAAA-MM-DD os dados que ela
 * desenha. Exige login e a permissão de fazer boletim na sala.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.has('ajax')) {
    const acesso = await exigirApi(SALA_SUMARIO, PERMISSAO_SUMARIO);
    if (acesso instanceof NextResponse) return acesso;
    return NextResponse.json(await sumarioHidrico(dataSumario(req.nextUrl.searchParams.get('data'))), { headers: { 'Cache-Control': 'private, no-store' } });
  }
  await acl(); // login primeiro (redireciona para /acesso/login)
  await exigirSala(SALA_SUMARIO, PERMISSAO_SUMARIO); // 404 ou "sem acesso"
  return new Response(pagina.replace('__HOJE__', hojeSp()), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP, 'Cache-Control': 'private, no-store' },
  });
}
