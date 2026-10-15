import { obterArquivo, respostaArquivo } from '@/lib/arquivos';
import { acl } from '@/lib/auth/acl';
import { usuarioAtual } from '@/lib/auth/sessao';
import { arquivoDaVersao, obter, salasComPermissao } from '@/lib/boletins';

/** PDF do boletim (atual ou de uma versão), só para quem pode ver boletins da sala. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await usuarioAtual())) return new Response('Faça login.', { status: 401 });
  const a = await acl();
  const { id } = await params;
  const b = /^\d{1,15}$/.test(id) ? await obter(Number(id)) : null;
  if (!b) return new Response('Boletim não encontrado.', { status: 404 });
  if (!(await salasComPermissao(a, 'visualizar_boletins')).some((s) => s.id === b.sala_id)) {
    return new Response('Sem acesso.', { status: 403 });
  }

  const v = new URL(req.url).searchParams.get('v');
  const arquivoId = v && /^\d{1,6}$/.test(v) ? await arquivoDaVersao(Number(b.id), Number(v)) : b.pdf_arquivo_id;
  const arquivo = await obterArquivo(arquivoId);
  if (!arquivo) return new Response('Este boletim (ou versão) não tem PDF.', { status: 404 });
  return respostaArquivo(arquivo);
}
