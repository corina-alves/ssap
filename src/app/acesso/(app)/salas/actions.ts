'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { EstadoAdmin } from '@/lib/admin/estado';
import { salvarSala, type DadosSala } from '@/lib/admin/salas';
import { campo, campoId } from '@/lib/admin/validacao';
import { exigirPermissao } from '@/lib/auth/acl';
import { origemRequisicao } from '@/lib/requisicao';

export async function salvarSalaAcao(_: EstadoAdmin<DadosSala>, form: FormData): Promise<EstadoAdmin<DadosSala>> {
  const a = await exigirPermissao('gerenciar_salas');
  const id = campoId(form) || null;
  const dados: DadosSala = {
    slug: campo(form, 'slug'),
    nome: campo(form, 'nome'),
    sigla: campo(form, 'sigla'),
    descricao: campo(form, 'descricao'),
    cor: campo(form, 'cor'),
    status: campo(form, 'status') || 'ativa',
    ordem: campo(form, 'ordem') || '0',
    modulos: form.getAll('modulos').map(Number).filter(Number.isInteger),
  };
  const r = await salvarSala(id, dados, { id: a.usuario.id, nome: a.usuario.nome }, await origemRequisicao());
  if (!r.ok) return { erros: r.erros, valores: dados, versao: Date.now() };

  revalidatePath('/acesso', 'layout');
  if (!id) redirect(`/acesso/salas/${r.id}?criada=1`);
  return { erros: [], mensagem: 'Alterações salvas.', versao: Date.now() };
}
