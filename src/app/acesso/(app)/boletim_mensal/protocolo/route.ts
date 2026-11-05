import { acl } from '@/lib/auth/acl';
import { PERMISSAO_VER } from '@/lib/boletins-sala/boletim-mensal';
import { mapaPng } from '@/lib/integracoes/protocolo-escassez';

/** Mapa oficial do Protocolo de Escassez Hídrica no mês (PNG do GeoServer da SP Águas, guardado no cache). */
export async function GET(req: Request): Promise<Response> {
  const a = await acl();
  if (!a.podeEmAlguma(PERMISSAO_VER)) return new Response('Sem acesso.', { status: 403 });
  const p = new URL(req.url).searchParams;
  const ano = Number(p.get('ano'));
  const mes = Number(p.get('mes'));
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) return new Response('Mês inválido.', { status: 400 });
  const png = await mapaPng(ano, mes).catch(() => null);
  if (!png) return new Response('Mapa indisponível.', { status: 502 });
  return new Response(png as unknown as BodyInit, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}
