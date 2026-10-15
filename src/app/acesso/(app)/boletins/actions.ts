'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { EstadoAdmin } from '@/lib/admin/estado';
import { campo, campoId } from '@/lib/admin/validacao';
import { acl } from '@/lib/auth/acl';
import * as boletins from '@/lib/boletins';
import { origemRequisicao } from '@/lib/requisicao';

export type ValoresBoletim = { tipoId: number; titulo: string; dataReferencia: string; competencia: string };

async function contexto() {
  const a = await acl();
  return { a, autor: { id: a.usuario.id, nome: a.usuario.nome }, origem: await origemRequisicao() };
}

function lerDados(form: FormData): ValoresBoletim {
  return {
    tipoId: campoId(form, 'tipo_id'),
    titulo: campo(form, 'titulo'),
    dataReferencia: campo(form, 'data_referencia'),
    competencia: campo(form, 'competencia'),
  };
}

function revalidar(id?: number) {
  revalidatePath('/acesso/boletins');
  if (id) revalidatePath(`/acesso/boletins/${id}`);
  revalidatePath('/boletins', 'layout'); // páginas públicas
}

/** Página do boletim com um aviso (a mensagem aparece uma vez, no topo). */
const ver = (id: number, p: Record<string, string>) => `/acesso/boletins/${id}?${new URLSearchParams(p)}`;

export async function criarBoletimAcao(_: EstadoAdmin<ValoresBoletim>, form: FormData): Promise<EstadoAdmin<ValoresBoletim>> {
  const { a, autor, origem } = await contexto();
  const dados = lerDados(form);
  const r = await boletins.criar(a, dados, form.get('pdf'), autor, origem);
  if (!r.ok) return { erros: r.erros, valores: dados, versao: Date.now() };
  revalidar();
  redirect(ver(r.id, { aviso: 'criado' }));
}

export async function editarBoletimAcao(_: EstadoAdmin<ValoresBoletim>, form: FormData): Promise<EstadoAdmin<ValoresBoletim>> {
  const { a, autor, origem } = await contexto();
  const id = campoId(form);
  const dados = lerDados(form);
  const pdf = form.get('pdf');
  const r = await boletins.atualizar(a, id, dados, pdf, autor, origem);
  if (!r.ok) return { erros: r.erros, valores: dados, versao: Date.now() };
  revalidar(id);
  redirect(ver(id, { aviso: !r.mudou ? 'sem-mudanca' : pdf instanceof File && pdf.size > 0 ? 'salvo-pdf' : 'salvo' }));
}

/**
 * Ações sobre o registro de um boletim (formulários da lista e da página do
 * boletim): mudança de situação, "salvar uma versão agora" e excluir. A
 * permissão de cada passo é conferida no módulo de boletins.
 */
export async function acaoBoletimAcao(form: FormData): Promise<void> {
  const { a, autor, origem } = await contexto();
  const id = campoId(form);
  const acao = campo(form, 'acao');
  const comentario = campo(form, 'comentario');
  const erro = (erros: string[]) => redirect(ver(id, { erro: erros.join(' ') }));

  if (acao === 'excluir') {
    const b = await boletins.obter(id);
    const erros = await boletins.excluir(a, id, autor, origem);
    if (erros.length) erro(erros);
    revalidar(id);
    redirect(`/acesso/boletins?${new URLSearchParams({ sala: String(b?.sala_id ?? ''), aviso: b?.status === 'publicado' ? 'excluido-publicado' : 'excluido' })}`);
  }
  if (acao === 'salvar_versao') {
    const r = await boletins.salvarVersao(a, id, comentario, autor, origem);
    if (!r.ok) erro(r.erros);
    else {
      revalidar(id);
      redirect(ver(id, { aviso: 'versao', v: String(r.versao) }));
    }
  }
  const r = await boletins.transicionar(a, id, acao, comentario, autor, origem);
  if (!r.ok) erro(r.erros);
  revalidar(id);
  redirect(ver(id, { aviso: 'acao', acao }));
}
