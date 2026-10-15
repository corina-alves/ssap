import { query } from '@/lib/db';

/**
 * Verificação de saúde (Docker, proxy reverso, monitoramento).
 * 200 = aplicação e banco respondendo; 503 = banco fora. Não expõe detalhes.
 */
export async function GET() {
  try {
    await query('SELECT 1');
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
