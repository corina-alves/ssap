import { NextResponse, type NextRequest } from 'next/server';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Identificador aceito de fora (ex.: $request_id do nginx); senão, gera um. */
const ID_VALIDO = /^[A-Za-z0-9_.:-]{8,64}$/;

/**
 * 1. Identificador da requisição (X-Request-Id): vem do proxy reverso ou é
 *    gerado aqui; segue para as páginas e rotas (o log o registra em cada
 *    evento) e volta na resposta, para achar no log a requisição de um erro.
 * 2. Proteção CSRF das rotas /api de escrita: o Origin precisa ser o próprio
 *    host. (As Server Actions já fazem essa checagem sozinhas; o cookie de
 *    sessão é SameSite=Strict.) A autorização de verdade fica em cada rota.
 */
export function proxy(req: NextRequest) {
  const recebido = req.headers.get('x-request-id');
  const id = recebido && ID_VALIDO.test(recebido) ? recebido : crypto.randomUUID();

  if (req.nextUrl.pathname.startsWith('/api/') && !METODOS_SEGUROS.has(req.method)) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    let mesmaOrigem = false;
    try {
      mesmaOrigem = origin !== null && host !== null && new URL(origin).host === host;
    } catch {
      mesmaOrigem = false;
    }
    if (!mesmaOrigem) {
      return NextResponse.json({ erro: 'Origem da requisição não permitida.' }, { status: 403, headers: { 'X-Request-Id': id } });
    }
  }

  const cabecalhos = new Headers(req.headers);
  cabecalhos.set('x-request-id', id);
  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  resposta.headers.set('X-Request-Id', id);
  return resposta;
}

export const config = {
  // /api inteiro (proteção CSRF, como antes) e as páginas, menos arquivos
  // estáticos do Next e da pasta public (têm extensão).
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]{2,5}$).*)'],
};
