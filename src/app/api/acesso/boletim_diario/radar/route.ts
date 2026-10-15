import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { fimDaJanela, PERMISSAO_DIARIO, SALA_DIARIO } from '@/lib/boletins-sala/diario';
import { escalaIpmet, radarIpmet, radarSaisp, saispConfigurado } from '@/lib/boletins-sala/radares';

export const maxDuration = 120;

/** GET ?fonte=ipmet|ipmet-escala|saisp — imagem de radar (acumulado de 24 h) para o Boletim Diário. */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_DIARIO, PERMISSAO_DIARIO);
  if (acesso instanceof NextResponse) return acesso;

  const fonte = req.nextUrl.searchParams.get('fonte');
  const fim = fimDaJanela();
  if (fonte === 'saisp' && !saispConfigurado()) return NextResponse.json({ erro: 'Login do SAISP não configurado (SAISP_USUARIO e SAISP_SENHA).' }, { status: 503 });
  const imagem = fonte === 'ipmet' ? await radarIpmet() : fonte === 'ipmet-escala' ? await escalaIpmet() : fonte === 'saisp' ? await radarSaisp(fim - 86_400_000, fim) : undefined;
  if (imagem === undefined) return NextResponse.json({ erro: 'Fonte desconhecida.' }, { status: 400 });
  if (!imagem) return NextResponse.json({ erro: 'Imagem indisponível no momento.' }, { status: 502 });
  return new NextResponse(Buffer.from(imagem.base64, 'base64'), { headers: { 'Content-Type': imagem.tipo, 'Cache-Control': 'private, max-age=300' } });
}
