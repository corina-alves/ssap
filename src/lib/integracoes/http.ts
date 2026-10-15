/**
 * Cliente HTTP das integrações externas. Toda fonte passa por aqui.
 *
 * Diferente do PHP de referência, o certificado TLS é SEMPRE verificado (todas
 * as fontes atuais respondem com certificado válido). Atrás de proxy
 * corporativo, rode com NODE_USE_ENV_PROXY=1 e HTTPS_PROXY definidos.
 */

const USER_AGENT = 'SalaSituacaoSP/3.0 (+https://www.spaguas.sp.gov.br)';

export class ErroFonte extends Error {
  constructor(
    mensagem: string,
    readonly status: number | null = null,
  ) {
    super(mensagem);
  }
}

export type OpcoesHttp = { timeoutMs?: number; headers?: Record<string, string> };

/** GET que devolve o JSON decodificado; lança ErroFonte em timeout, HTTP >= 400 ou JSON inválido. */
export async function buscarJson(url: string, opcoes: OpcoesHttp = {}): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...opcoes.headers },
      signal: AbortSignal.timeout(opcoes.timeoutMs ?? 12_000),
      cache: 'no-store', // o cache é nosso (cache.ts), não o do fetch do Next
    });
  } catch (e) {
    const causa = (e as { cause?: { code?: string } }).cause?.code;
    const nome = (e as Error).name;
    throw new ErroFonte(nome === 'TimeoutError' ? 'tempo esgotado' : `falha de conexão${causa ? ` (${causa})` : ''}`);
  }
  if (!r.ok) {
    await r.body?.cancel();
    throw new ErroFonte(`HTTP ${r.status}`, r.status);
  }
  try {
    return await r.json();
  } catch {
    throw new ErroFonte('resposta não é JSON válido', r.status);
  }
}

/** Converte "12,3" / "12.3" / " 45 % " / 12.3 em número, ou null. */
export function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let t = v.replace(/[%\s]|mm/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replaceAll('.', '');
  t = t.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Arredonda para `casas` decimais. */
export const arred = (v: number, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas;
