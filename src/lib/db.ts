import pg from 'pg';
import { env } from './env';

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
    global_.__ssapPool.on('error', (e) => console.error('Conexão ociosa com o banco encerrada:', e.message));
  }
  return global_.__ssapPool;
}

/** Consulta parametrizada — nunca concatenar valores no SQL. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const r = await pool().query<T>(sql, params);
  return r.rows;
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
    throw e;
  } finally {
    c.release();
  }
}
