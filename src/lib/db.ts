import pg from 'pg';
import { env } from './env';
import { erroSeguro, idRequisicao, limiteMs, log } from './log';

// Um pool por processo; em desenvolvimento o hot reload reaproveita o mesmo.
const global_ = globalThis as unknown as { __ssapPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!global_.__ssapPool) {
    global_.__ssapPool = new pg.Pool({
      connectionString: env().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    // Conexão ociosa derrubada (banco reiniciado, rede): o pool descarta e abre outra
    // na próxima consulta. Sem este tratador, o erro viraria exceção não capturada.
    global_.__ssapPool.on('error', (e) => log.warn('banco_conexao_encerrada', { erro: erroSeguro(e) }));
  }
  return global_.__ssapPool;
}

/** Começo do SQL para o log (sem valores: eles vão nos parâmetros $1, $2…). */
const resumoSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().slice(0, 160);

/** Consulta parametrizada — nunca concatenar valores no SQL. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const inicio = performance.now();
  try {
    const r = await pool().query<T>(sql, params);
    const ms = Math.round(performance.now() - inicio);
    if (ms >= limiteMs('LOG_DB_LENTO_MS', 1000)) log.warn('banco_lento', { req: await idRequisicao(), ms, linhas: r.rowCount, sql: resumoSql(sql) });
    return r.rows;
  } catch (e) {
    log.error('banco_erro', { req: await idRequisicao(), ms: Math.round(performance.now() - inicio), sql: resumoSql(sql), erro: erroSeguro(e) });
    throw e;
  }
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Executa `fn` numa transação; desfaz tudo se lançar erro. */
export async function transacao<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    log.warn('banco_transacao_desfeita', { req: await idRequisicao(), erro: erroSeguro(e) });
    throw e;
  } finally {
    c.release();
  }
}
