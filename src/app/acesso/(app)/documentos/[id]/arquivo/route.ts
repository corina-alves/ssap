import { obterArquivo, respostaArquivo } from '@/lib/arquivos';
import { acl } from '@/lib/auth/acl';
import { usuarioAtual } from '@/lib/auth/sessao';
import { obter, salasDocumentos } from '@/lib/documentos';

/** Arquivo do documento, só para quem pode ver documentos da sala. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await usuarioAtual())) return new Response('Faça login.', { status: 401 });
  const a = await acl();
  const { id } = await params;
  const d = /^\d{1,15}$/.test(id) ? await obter(Number(id)) : null;
  if (!d) return new Response('Documento não encontrado.', { status: 404 });
  if (!(await salasDocumentos(a, 'visualizar_documentos')).some((s) => s.id === d.sala_id)) {
    return new Response('Sem acesso.', { status: 403 });
  }
  const arquivo = await obterArquivo(d.arquivo_id);
  if (!arquivo) return new Response('Arquivo não encontrado.', { status: 404 });
  return respostaArquivo(arquivo);
}
