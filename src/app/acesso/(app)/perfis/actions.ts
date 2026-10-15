'use server';

import { revalidatePath } from 'next/cache';
import type { EstadoAdmin } from '@/lib/admin/estado';
import { criarPerfil, excluirPerfil, salvarMatriz, type DadosPerfil } from '@/lib/admin/perfis';
import { campo, campoId } from '@/lib/admin/validacao';
import { exigirPermissao } from '@/lib/auth/acl';
import { origemRequisicao } from '@/lib/requisicao';

async function autor() {
  const a = await exigirPermissao('gerenciar_permissoes');
  return { id: a.usuario.id, nome: a.usuario.nome };
}

/** Checkboxes da matriz: name="p_<perfil>" value="<permissão>". */
export async function salvarMatrizAcao(_: EstadoAdmin, form: FormData): Promise<EstadoAdmin> {
  const a = await autor();
  const marcados: Record<number, number[]> = {};
  for (const [k, v] of form.entries()) {
    const m = /^p_(\d+)$/.exec(k);
    if (m && typeof v === 'string' && /^\d+$/.test(v)) (marcados[Number(m[1])] ??= []).push(Number(v));
  }
  const mudou = await salvarMatriz(marcados, a, await origemRequisicao());
  revalidatePath('/acesso', 'layout');
  return { erros: [], mensagem: mudou ? 'Permissões salvas.' : 'Nenhuma alteração.', versao: Date.now() };
}

export async function criarPerfilAcao(_: EstadoAdmin<DadosPerfil>, form: FormData): Promise<EstadoAdmin<DadosPerfil>> {
  const a = await autor();
  const dados: DadosPerfil = {
    slug: campo(form, 'slug'),
    nome: campo(form, 'nome'),
    descricao: campo(form, 'descricao'),
    escopo: campo(form, 'escopo') || 'sala',
  };
  const r = await criarPerfil(dados, a, await origemRequisicao());
  if (!r.ok) return { erros: r.erros, valores: dados, versao: Date.now() };
  revalidatePath('/acesso/perfis');
  return { erros: [], mensagem: `Perfil "${dados.nome}" criado. Marque as permissões dele na matriz.`, versao: Date.now() };
}

export async function excluirPerfilAcao(_: EstadoAdmin, form: FormData): Promise<EstadoAdmin> {
  const a = await autor();
  const erros = await excluirPerfil(campoId(form), a, await origemRequisicao());
  if (!erros.length) revalidatePath('/acesso/perfis');
  return { erros, mensagem: erros.length ? undefined : 'Perfil excluído.', versao: Date.now() };
}
