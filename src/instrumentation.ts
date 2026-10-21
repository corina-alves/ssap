import type { Instrumentation } from 'next';

/**
 * Observabilidade do servidor (convenção do Next): início e encerramento da
 * aplicação, exceções sem tratamento e erros de páginas, rotas e ações — tudo
 * em JSON no stdout/stderr (src/lib/log.ts), que o Docker guarda e rotaciona.
 * Só no runtime Node e fora do `next build`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { iniciarLogs } = await import('./lib/log-servidor');
  iniciarLogs();
}

export const onRequestError: Instrumentation.onRequestError = async (erro, request, contexto) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registrarErroRequisicao } = await import('./lib/log-servidor');
  registrarErroRequisicao(erro, request, contexto);
};
