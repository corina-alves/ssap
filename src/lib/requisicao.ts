import 'server-only';
import { isIP } from 'node:net';
import { headers } from 'next/headers';
import { env } from './env';

export type Origem = { ip: string; userAgent: string | null };

/**
 * IP e navegador da requisição atual.
 *
 * O Next preenche X-Forwarded-For com o IP da conexão só quando o cliente não
 * envia o cabeçalho. Por isso:
 *  - TRUST_PROXY=true (atrás de IIS/nginx que acrescenta o IP real): usa a
 *    última entrada, que é a do proxy confiável;
 *  - TRUST_PROXY=false: usa a primeira entrada, que pode ter sido forjada
 *    pelo cliente. O bloqueio por IP vira "melhor esforço"; o bloqueio por
 *    conta continua valendo.
 */
export async function origemRequisicao(): Promise<Origem> {
  const h = await headers();
  const partes = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const bruto = (env().TRUST_PROXY ? partes.at(-1) : partes[0]) ?? '';
  const ip = normalizarIp(bruto);
  const ua = h.get('user-agent');
  return { ip, userAgent: ua ? ua.slice(0, 255) : null };
}

/**
 * Endereço público da aplicação, para montar links absolutos: APP_URL ou, sem
 * ela, o endereço por onde a requisição chegou (cabeçalhos do proxy reverso).
 * Não usa `req.url`: no contêiner ela traz o endereço interno (0.0.0.0:3000).
 */
export function enderecoPublico(req: Request): string {
  const fixo = env().APP_URL;
  if (fixo) return fixo.replace(/\/$/, '');
  const h = req.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return new URL(req.url).origin;
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || new URL(req.url).protocol.replace(':', '');
  return `${proto}://${host}`;
}

function normalizarIp(v: string): string {
  const semPrefixo = v.startsWith('::ffff:') ? v.slice(7) : v;
  return isIP(semPrefixo) ? semPrefixo : '0.0.0.0';
}
