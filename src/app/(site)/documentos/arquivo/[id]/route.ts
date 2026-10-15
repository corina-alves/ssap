import { obterArquivo, respostaArquivo } from '@/lib/arquivos';
import { arquivoPublicoId } from '@/lib/documentos';

/** Arquivo de documento público. Documento interno ou excluído responde 404. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const arquivoId = /^\d{1,15}$/.test(id) ? await arquivoPublicoId(Number(id)) : null;
  const arquivo = await obterArquivo(arquivoId);
  if (!arquivo) return new Response('Documento não encontrado.', { status: 404 });
  return respostaArquivo(arquivo, { publico: true });
}
