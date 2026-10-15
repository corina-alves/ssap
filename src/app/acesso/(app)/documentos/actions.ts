'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { EstadoAdmin } from '@/lib/admin/estado';
import { campo, campoId } from '@/lib/admin/validacao';
import { acl } from '@/lib/auth/acl';
import * as documentos from '@/lib/documentos';
import { origemRequisicao } from '@/lib/requisicao';

export type ValoresDocumento = documentos.DadosDocumento;

function lerDados(form: FormData): ValoresDocumento {
  return {
    salaId: campoId(form, 'sala_id'),
    categoriaId: campoId(form, 'categoria_id'),
    titulo: campo(form, 'titulo'),
    descricao: campo(form, 'descricao'),
    dataDocumento: campo(form, 'data_documento'),
    publico: campo(form, 'publico') === '1',
  };
}

function revalidar(id?: number) {
  revalidatePath('/acesso/documentos');
  if (id) revalidatePath(`/acesso/documentos/${id}`);
  revalidatePath('/documentos');
}

export async function salvarDocumentoAcao(
  _: EstadoAdmin<ValoresDocumento>,
  form: FormData,
): Promise<EstadoAdmin<ValoresDocumento>> {
  const a = await acl();
  const id = campoId(form) || null;
  const dados = lerDados(form);
  const r = await documentos.salvar(a, id, dados, form.get('arquivo'), { id: a.usuario.id, nome: a.usuario.nome }, await origemRequisicao());
  if (!r.ok) return { erros: r.erros, valores: dados, versao: Date.now() };
  revalidar(r.id);
  if (!id) redirect(`/acesso/documentos/${r.id}?enviado=1`);
  return { erros: [], mensagem: r.mudou ? 'Alterações salvas.' : 'Nenhuma alteração.', versao: Date.now() };
}

export async function excluirDocumentoAcao(_: EstadoAdmin, form: FormData): Promise<EstadoAdmin> {
  const a = await acl();
  const erros = await documentos.excluir(a, campoId(form), { id: a.usuario.id, nome: a.usuario.nome }, await origemRequisicao());
  if (erros.length) return { erros, versao: Date.now() };
  revalidar();
  redirect('/acesso/documentos?excluido=1');
}
