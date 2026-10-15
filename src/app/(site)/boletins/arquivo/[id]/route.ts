import { respostaArquivo } from '@/lib/arquivos';
import { arquivoPublico } from '@/lib/publico';

/** PDF de boletim publicado. Qualquer outro status responde 404. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const arquivo = /^\d{1,15}$/.test(id) ? await arquivoPublico(Number(id)) : null;
  if (!arquivo) return new Response('Boletim não encontrado.', { status: 404 });
  return respostaArquivo(arquivo, { publico: true });
}
