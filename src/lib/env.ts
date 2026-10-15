import { z } from 'zod';

/**
 * Configuração lida do ambiente (.env.local em desenvolvimento).
 * Sem DATABASE_URL a aplicação não inicia — nunca há padrão "root sem senha".
 */
const esquema = z.object({
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL não definida (veja .env.example)' })
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL deve começar com postgres://'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Endereço público (ex.: https://salasituacao.sp.gov.br), usado nos links de senha.
  APP_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url({ protocol: /^https?$/ }).optional()),
  // Pasta dos arquivos enviados (PDFs, documentos), FORA da pasta pública.
  STORAGE_DIR: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof esquema>;

let cache: Env | undefined;

export function env(): Env {
  if (!cache) {
    const r = esquema.safeParse(process.env);
    if (!r.success) {
      const erros = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Configuração inválida:\n${erros}`);
    }
    cache = r.data;
  }
  return cache;
}
