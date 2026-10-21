import { endpointSeguro, erroSeguro, idRequisicao, limiteMs, log } from '../log';

/**
 * Registro de cada chamada real a uma fonte externa (o que vem do cache não
 * passa por aqui): fonte, endereço sem credenciais, duração, código HTTP,
 * sucesso ou falha e o tipo da falha. Sucesso só em DEBUG (ou WARN se lento),
 * para não encher o log; falha sempre em WARN.
 */

const FONTES: [RegExp, string][] = [
  [/(^|\.)mananciais\.sabesp\.com\.br$/, 'sabesp'],
  [/(^|\.)ana\.gov\.br$/, 'ana'],
  [/^apps\.spaguas\.sp\.gov\.br$/, 'sibh'],
  [/^sssp\.spaguas\.sp\.gov\.br$/, 'ssd'],
  [/open-meteo\.com$/, 'openmeteo'],
  [/(^|\.)ibge\.gov\.br$/, 'ibge'],
  [/(^|\.)cetesb\.sp\.gov\.br$/, 'cetesb'],
  [/saisp/, 'saisp'],
  [/ipmetradar\.com\.br$/, 'ipmet'],
];

/** Nome curto da fonte pelo host (ou o próprio host). */
export function fonteDe(url: string): string {
  try {
    const h = new URL(url).hostname;
    return FONTES.find(([re]) => re.test(h))?.[1] ?? h;
  } catch {
    return 'desconhecida';
  }
}

/** O pedido a este host passa pelo proxy (NODE_USE_ENV_PROXY + HTTPS_PROXY, menos o NO_PROXY)? */
export function viaProxy(url: string, env: Record<string, string | undefined> = process.env): boolean {
  const proxy = env.HTTPS_PROXY || env.https_proxy;
  if (!proxy || !env.NODE_USE_ENV_PROXY) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const sem = (env.NO_PROXY || env.no_proxy || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !sem.some((r) => r === '*' || host === r.replace(/^\*?\./, '') || host.endsWith(`.${r.replace(/^\*?\./, '')}`));
}

export type TipoFalha = 'timeout' | 'dns' | 'conexao' | 'proxy' | 'certificado' | 'autenticacao' | 'http' | 'resposta_invalida';

const CERTIFICADO = /CERT|SELF_SIGNED|UNABLE_TO_|DEPTH_ZERO|ERR_TLS|ERR_SSL|HOSTNAME_MISMATCH|ALTNAME/;

/**
 * Tipo da falha de um fetch que lançou erro. Medido no Node 24: proxy que
 * recusa (403) ou pede senha (407) aparece só como "Request was cancelled."
 * (código 0); conexão recusada atrás de proxy é o próprio proxy fora do ar.
 */
export function classificarErro(e: unknown, comProxy: boolean): TipoFalha {
  const nome = (e as { name?: string })?.name;
  const causa = (e as { cause?: { code?: unknown; message?: unknown } })?.cause;
  const codigo = String(causa?.code ?? '');
  const msg = String(causa?.message ?? (e as Error)?.message ?? '');
  if (nome === 'TimeoutError' || codigo === 'UND_ERR_CONNECT_TIMEOUT' || codigo === 'ETIMEDOUT' || /timeout/i.test(codigo)) return 'timeout';
  if (codigo === 'ENOTFOUND' || codigo === 'EAI_AGAIN') return 'dns';
  if (CERTIFICADO.test(codigo)) return 'certificado';
  if (comProxy && (codigo === '0' || /Request was cancelled|proxy/i.test(msg) || ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(codigo))) return 'proxy';
  return 'conexao';
}

/** Tipo da falha por código HTTP: 401/403 da fonte → autenticação; 407 → proxy; demais → http. */
export const classificarStatus = (status: number): TipoFalha => (status === 407 ? 'proxy' : status === 401 || status === 403 ? 'autenticacao' : 'http');

export type Chamada = { url: string; inicio: number; status?: number | null; falha?: TipoFalha | null; erro?: unknown };

/** Registra uma chamada concluída (com ou sem falha). Nunca lança. */
export async function registrarChamada(c: Chamada): Promise<void> {
  try {
    const ms = Math.round(performance.now() - c.inicio);
    const comProxy = viaProxy(c.url);
    const campos = {
      req: await idRequisicao(),
      fonte: fonteDe(c.url),
      endpoint: endpointSeguro(c.url),
      ms,
      http: c.status ?? null,
      proxy: comProxy,
      sucesso: !c.falha,
    };
    if (c.falha) {
      log.warn('api_falha', { ...campos, tipo: c.falha, ...(c.erro !== undefined ? { erro: erroSeguro(c.erro) } : {}) });
    } else if (ms >= limiteMs('LOG_API_LENTA_MS', 8000)) {
      log.warn('api_lenta', campos);
    } else {
      log.debug('api_ok', campos);
    }
  } catch {
    // o registro nunca interrompe a integração
  }
}
