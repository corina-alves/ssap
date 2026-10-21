import { endpointSeguro, erroSeguro, log, textoSeguro } from './log';

/**
 * Eventos do ciclo de vida do servidor (chamado por src/instrumentation.ts).
 * Só acrescenta registros: o Next continua tratando os sinais (SIGTERM do
 * Docker encerra com código 143) e as exceções como antes.
 */

const estado = globalThis as unknown as { __ssapLogsIniciados?: boolean };

export function iniciarLogs() {
  if (estado.__ssapLogsIniciados) return; // recarga em desenvolvimento
  estado.__ssapLogsIniciados = true;
  const e = process.env;
  const proxy = e.HTTPS_PROXY || e.https_proxy;

  log.info('app_iniciada', {
    pid: process.pid,
    node: process.version,
    ambiente: e.NODE_ENV,
    nivelLog: (e.LOG_NIVEL || 'info').toLowerCase(),
    proxy: proxy && e.NODE_USE_ENV_PROXY ? endpointSeguro(proxy) : 'direto',
    semProxy: textoSeguro(e.NO_PROXY || e.no_proxy || ''),
    storage: e.STORAGE_DIR ?? './storage',
    cache: e.CACHE_DIR ?? './.cache/integracoes',
  });

  // Teste do banco sem atrasar a subida (register precisa terminar antes de atender).
  void import('./db')
    .then(async ({ query }) => {
      const t = performance.now();
      await query('SELECT 1');
      log.info('banco_ok', { ms: Math.round(performance.now() - t) });
    })
    .catch((erro) => log.error('banco_falha', { erro: erroSeguro(erro) }));

  // Só observam: o Next já trata SIGINT/SIGTERM, exceções e rejeições.
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) process.once(sinal, () => log.info('app_encerrando', { sinal }));
  process.once('exit', (codigo) => log.info('app_encerrada', { codigo }));
  process.on('uncaughtExceptionMonitor', (erro, origem) => log.error('excecao_nao_tratada', { origem, erro: erroSeguro(erro) }));
  process.on('unhandledRejection', (motivo) => log.error('promessa_rejeitada_sem_tratamento', { erro: erroSeguro(motivo) }));
}

type Requisicao = { path: string; method: string; headers: Record<string, string | string[] | undefined> };
type Contexto = { routePath: string; routeType: string; renderSource?: string };

/** Erro de página, rota, ação ou proxy capturado pelo Next (onRequestError). */
export function registrarErroRequisicao(erro: unknown, req: Requisicao, ctx: Contexto) {
  const id = req.headers['x-request-id'];
  log.error('requisicao_erro', {
    req: Array.isArray(id) ? id[0] : id,
    metodo: req.method,
    caminho: endpointSeguro(`http://x${req.path}`).replace(/^http:\/\/x/, ''),
    rota: ctx.routePath,
    tipo: ctx.routeType,
    origem: ctx.renderSource,
    erro: erroSeguro(erro),
  });
}
