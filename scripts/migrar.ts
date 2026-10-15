/**
 * Aplica as migrações de db/migrations que ainda faltam, em ordem.
 *   npm run db:migrar
 * Cada arquivo abre e fecha a própria transação e grava a versão em
 * schema_migrations; se um falhar, nada dele fica aplicado e o script para.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { env } from '../src/lib/env';
import { carregarEnv } from './_comum';

carregarEnv();

const PASTA = join(process.cwd(), 'db', 'migrations');

async function principal(): Promise<void> {
  const cliente = new pg.Client({ connectionString: env().DATABASE_URL });
  await cliente.connect();
  try {
    await cliente.query("SET client_encoding = 'UTF8'");
    const existe = await cliente.query<{ t: string | null }>("SELECT to_regclass('schema_migrations')::text AS t");
    const aplicadas = new Set<string>();
    if (existe.rows[0]?.t) {
      const r = await cliente.query<{ versao: string }>('SELECT versao FROM schema_migrations');
      r.rows.forEach((l) => aplicadas.add(l.versao));
    }

    const arquivos = (await readdir(PASTA)).filter((a) => /^\d{4}_.+\.sql$/.test(a)).sort();
    let novas = 0;
    for (const arquivo of arquivos) {
      const versao = arquivo.replace(/\.sql$/, '');
      if (aplicadas.has(versao)) continue;
      process.stdout.write(`Aplicando ${arquivo}... `);
      try {
        await cliente.query(await readFile(join(PASTA, arquivo), 'utf8'));
      } catch (e) {
        await cliente.query('ROLLBACK').catch(() => {});
        console.log('FALHOU');
        throw e;
      }
      console.log('ok');
      novas++;
    }
    console.log(novas ? `${novas} migração(ões) aplicada(s).` : 'Banco já está atualizado.');
  } finally {
    await cliente.end();
  }
}

principal().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
