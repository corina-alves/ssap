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

  // Sumário Executivo Automático (Alto Tietê/Pinheiros): busca as fontes a cada 10 min e
  // grava as leituras das 07h mesmo sem visitas. SUMARIO_TP_COLETA=off desliga.
  const global_ = globalThis as { __ssapColetaTp?: ReturnType<typeof setInterval> };
  if (process.env.SUMARIO_TP_COLETA !== 'off' && !global_.__ssapColetaTp) {
    const { coletar } = await import('./lib/boletins-sala/sumario-automatico-tp');
    const rodar = () => void coletar();
    setTimeout(rodar, 30_000).unref(); // não atrasa a subida do servidor
    global_.__ssapColetaTp = setInterval(rodar, 10 * 60_000);
    global_.__ssapColetaTp.unref();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (erro, request, contexto) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registrarErroRequisicao } = await import('./lib/log-servidor');
  registrarErroRequisicao(erro, request, contexto);
};
