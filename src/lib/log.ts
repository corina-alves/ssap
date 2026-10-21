/**
 * Logs estruturados da aplicação: uma linha JSON por evento, em stdout (debug e
 * info) ou stderr (warn e error) — o Docker guarda e rotaciona (compose.yaml).
 *
 *   {"ts":"2026-10-20T14:03:12.481Z","nivel":"warn","evento":"api_falha","req":"…","fonte":"sibh",…}
 *
 * Regras:
 *  - nível mínimo em LOG_NIVEL (debug, info, warn, error; padrão info);
 *  - nunca registra senha, token, cookie, autorização, credencial de proxy nem
 *    conteúdo de resposta: chaves sensíveis viram "[oculto]" e URLs perdem
 *    usuário/senha e parâmetros sensíveis;
 *  - nunca lança: uma falha ao registrar não pode derrubar a aplicação.
 */

export type Nivel = 'debug' | 'info' | 'warn' | 'error';
type Campos = Record<string, unknown>;

const ORDEM: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const CHAVE_SENSIVEL = /senha|password|passwd|token|secret|segredo|cookie|authorization|autoriza|credencia|api[-_]?key|chave/i;
const MAX_TEXTO = 500;

function nivelMinimo(): number {
  const n = String(process.env.LOG_NIVEL ?? '').toLowerCase() as Nivel;
  return ORDEM[n] ?? ORDEM.info;
}

/** Tira usuário e senha de URLs e mascara parâmetros sensíveis (token=, senha=…). */
export function textoSeguro(t: string): string {
  return t
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s@]*@/gi, '$1***@')
    .replace(/([?&;](?:[^=&\s]*(?:senha|password|token|secret|key|chave|auth)[^=&\s]*)=)[^&\s]*/gi, '$1***')
    .slice(0, MAX_TEXTO);
}

/** Endereço para log: origem + caminho + parâmetros, sem credenciais. */
export function endpointSeguro(url: string): string {
  try {
    const u = new URL(url);
    u.username = '';
    u.password = '';
    for (const k of [...u.searchParams.keys()]) if (CHAVE_SENSIVEL.test(k) || /key|auth/i.test(k)) u.searchParams.set(k, '***');
    return textoSeguro(u.toString());
  } catch {
    return textoSeguro(url);
  }
}

/** Erro → campos seguros (nome, mensagem, código e causa), sem pilha de chamadas. */
export function erroSeguro(e: unknown): Campos {
  if (!(e instanceof Error)) return { mensagem: textoSeguro(String(e)) };
  const causa = (e as { cause?: { code?: unknown; message?: unknown } }).cause;
  return {
    nome: e.name,
    mensagem: textoSeguro(e.message),
    ...((e as { code?: unknown }).code !== undefined ? { codigo: String((e as { code?: unknown }).code) } : {}),
    ...((e as { digest?: unknown }).digest !== undefined ? { digest: String((e as { digest?: unknown }).digest) } : {}),
    ...(causa ? { causa: textoSeguro(`${causa.code ?? ''} ${causa.message ?? ''}`.trim()) } : {}),
  };
}

function limpar(v: unknown, prof = 0): unknown {
  if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return textoSeguro(v);
  if (typeof v === 'bigint') return String(v);
  if (v instanceof Error) return erroSeguro(v);
  if (v instanceof Date) return v.toISOString();
  if (prof >= 4) return '[…]';
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => limpar(x, prof + 1));
  if (typeof v === 'object') {
    const r: Campos = {};
    for (const [k, x] of Object.entries(v as Campos)) r[k] = CHAVE_SENSIVEL.test(k) ? '[oculto]' : limpar(x, prof + 1);
    return r;
  }
  return String(v);
}

type Saida = (nivel: Nivel, linha: string) => void;
const saidaPadrao: Saida = (nivel, linha) => (nivel === 'warn' || nivel === 'error' ? process.stderr : process.stdout).write(`${linha}\n`);
let saida: Saida = saidaPadrao;

/** Troca o destino das linhas (testes). Sem argumento, volta ao stdout/stderr. */
export function definirSaida(s?: Saida) {
  saida = s ?? saidaPadrao;
}

function registrar(nivel: Nivel, evento: string, campos: Campos = {}) {
  try {
    if (ORDEM[nivel] < nivelMinimo()) return;
    const linha = JSON.stringify({ ts: new Date().toISOString(), nivel, evento, ...(limpar(campos) as Campos) });
    saida(nivel, linha);
  } catch {
    // registrar nunca pode interromper a aplicação
  }
}

export const log = {
  debug: (evento: string, campos?: Campos) => registrar('debug', evento, campos),
  info: (evento: string, campos?: Campos) => registrar('info', evento, campos),
  warn: (evento: string, campos?: Campos) => registrar('warn', evento, campos),
  error: (evento: string, campos?: Campos) => registrar('error', evento, campos),
  /** O nível está ligado? (para não montar campos caros à toa) */
  ativo: (nivel: Nivel) => ORDEM[nivel] >= nivelMinimo(),
};

/**
 * Identificador da requisição atual (X-Request-Id, definido no proxy.ts), ou
 * undefined fora de uma requisição (scripts, inicialização).
 */
export async function idRequisicao(): Promise<string | undefined> {
  try {
    const { headers } = await import('next/headers');
    return (await headers()).get('x-request-id') ?? undefined;
  } catch {
    return undefined;
  }
}

/** Número de uma variável de ambiente (ms), com padrão. */
export function limiteMs(nome: string, padrao: number): number {
  const n = Number(process.env[nome]);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}
