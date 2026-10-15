/**
 * Põe os PDFs de boletim já cadastrados no padrão atual:
 *   - na pasta do tipo de boletim: storage/boletins/<pasta>/<pasta>_<AAAAMMDD>.pdf;
 *   - com cópia do conteúdo no banco (tabela arquivos_conteudo).
 *   npm run arquivos:banco
 * Pode rodar de novo: só mexe no que ainda não está no padrão. PDF que sumiu
 * da pasta e tem cópia no banco é regravado.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pool, query } from '../src/lib/db';
import { carregarEnv } from './_comum';

carregarEnv();

const RAIZ = resolve(process.env.STORAGE_DIR || join(process.cwd(), 'storage'));

type Linha = { id: string; caminho: string; sha256: string; pasta: string; referencia: string; tem_copia: boolean };

async function principal(): Promise<void> {
  // PDF atual de cada boletim e os PDFs das versões anteriores
  const arquivos = await query<Linha>(
    `SELECT DISTINCT ON (a.id) a.id::text, a.caminho, a.sha256,
            coalesce(t.pasta, 'boletim_' || replace(t.slug, '-', '_')) AS pasta,
            to_char(b.data_referencia, 'YYYYMMDD') AS referencia,
            EXISTS (SELECT 1 FROM arquivos_conteudo c WHERE c.arquivo_id = a.id) AS tem_copia
       FROM arquivos a
       JOIN (SELECT id AS boletim_id, pdf_arquivo_id FROM boletins
             UNION SELECT boletim_id, pdf_arquivo_id FROM boletim_versoes) x ON x.pdf_arquivo_id = a.id
       JOIN boletins b ON b.id = x.boletim_id
       JOIN tipos_boletim t ON t.id = b.tipo_id
      WHERE a.excluido_em IS NULL
      ORDER BY a.id`,
  );
  let movidos = 0, copiados = 0, regravados = 0, perdidos = 0;
  for (const a of arquivos) {
    let abs = join(RAIZ, a.caminho);
    if (!existsSync(abs)) {
      const copia = a.tem_copia ? (await query<{ dados: Buffer }>('SELECT dados FROM arquivos_conteudo WHERE arquivo_id = $1', [a.id]))[0] : undefined;
      if (!copia) {
        console.log(`  SEM ARQUIVO e sem cópia no banco: ${a.caminho}`);
        perdidos++;
        continue;
      }
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, copia.dados);
      regravados++;
    }
    if (!a.tem_copia) {
      const dados = await readFile(abs);
      if (createHash('sha256').update(dados).digest('hex') !== a.sha256) {
        console.log(`  conteúdo diferente do registrado (não copiado): ${a.caminho}`);
        continue;
      }
      await query('INSERT INTO arquivos_conteudo (arquivo_id, dados) VALUES ($1, $2) ON CONFLICT DO NOTHING', [a.id, dados]);
      copiados++;
    }
    const pasta = `boletins/${a.pasta}`;
    if (dirname(a.caminho) !== pasta) {
      let nome = '';
      for (let i = 1; !nome || existsSync(join(RAIZ, pasta, nome)); i++) nome = `${a.pasta}_${a.referencia}${i > 1 ? `_${i}` : ''}.pdf`;
      await mkdir(join(RAIZ, pasta), { recursive: true });
      await rename(abs, join(RAIZ, pasta, nome));
      abs = join(RAIZ, pasta, nome);
      await query('UPDATE arquivos SET caminho = $2, nome_interno = $3 WHERE id = $1', [a.id, `${pasta}/${nome}`, nome]);
      console.log(`  ${a.caminho}  →  ${pasta}/${nome}`);
      movidos++;
    }
  }
  console.log(`${arquivos.length} PDF(s) de boletim: ${movidos} movido(s) para a pasta do tipo, ${copiados} copiado(s) para o banco, ${regravados} regravado(s), ${perdidos} sem arquivo.`);
}

principal()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
