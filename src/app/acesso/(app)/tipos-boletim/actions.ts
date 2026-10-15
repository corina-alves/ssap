'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { EstadoAdmin } from '@/lib/admin/estado';
import { salvarTipo, type DadosTipo } from '@/lib/admin/tipos-boletim';
import { campo, campoId } from '@/lib/admin/validacao';
import { exigirPermissao } from '@/lib/auth/acl';
import { origemRequisicao } from '@/lib/requisicao';

export async function salvarTipoAcao(_: EstadoAdmin<DadosTipo>, form: FormData): Promise<EstadoAdmin<DadosTipo>> {
  const a = await exigirPermissao('gerenciar_salas');
  const id = campoId(form) || null;
  const dados: DadosTipo = {
    salaId: campoId(form, 'sala_id'),
    slug: campo(form, 'slug'),
    nome: campo(form, 'nome'),
    descricao: campo(form, 'descricao'),
    periodicidade: campo(form, 'periodicidade'),
    exigeRevisao: campo(form, 'exige_revisao') === '1',
    publico: campo(form, 'publico') === '1',
    ativo: campo(form, 'ativo') === '1',
    ordem: campo(form, 'ordem') || '0',
  };
  const r = await salvarTipo(id, dados, { id: a.usuario.id, nome: a.usuario.nome }, await origemRequisicao());
  if (!r.ok) return { erros: r.erros, valores: dados, versao: Date.now() };

  revalidatePath('/acesso/tipos-boletim');
  if (!id) redirect(`/acesso/tipos-boletim/${r.id}?criado=1`);
  return { erros: [], mensagem: 'Alterações salvas.', versao: Date.now() };
}
