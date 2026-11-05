import { obterArquivo, respostaArquivo } from '@/lib/arquivos';
import { acl } from '@/lib/auth/acl';
import { imagemDoBoletim, PERMISSAO_VER } from '@/lib/boletins-sala/boletim-mensal';

/** Imagem anexada ao boletim mensal: só para quem vê os boletins da sala, e só se a imagem é mesmo do boletim. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const a = await acl();
  const id = Number((await params).id);
  const arq = Number.isInteger(id) && id > 0 ? await obterArquivo(id) : null;
  if (!arq || arq.sala_id === null || !a.pode(PERMISSAO_VER, arq.sala_id) || !(await imagemDoBoletim(arq.sala_id, id))) {
    return new Response('Não encontrado.', { status: 404 });
  }
  return respostaArquivo(arq, { inline: true });
}
