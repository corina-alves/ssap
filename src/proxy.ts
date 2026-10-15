import { NextResponse, type NextRequest } from 'next/server';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção CSRF das rotas /api de escrita: o Origin precisa ser o próprio
 * host. (As Server Actions já fazem essa checagem sozinhas; o cookie de sessão
 * é SameSite=Strict.) A autorização de verdade fica em cada rota.
 */
export function proxy(req: NextRequest) {
  if (METODOS_SEGUROS.has(req.method)) return NextResponse.next();

  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  let mesmaOrigem = false;
  try {
    mesmaOrigem = origin !== null && host !== null && new URL(origin).host === host;
  } catch {
    mesmaOrigem = false;
  }
  if (!mesmaOrigem) {
    return NextResponse.json({ erro: 'Origem da requisição não permitida.' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
