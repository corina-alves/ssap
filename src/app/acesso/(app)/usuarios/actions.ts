'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import * as usuarios from '@/lib/admin/usuarios';
import { exigirPermissao } from '@/lib/auth/acl';
import { urlRedefinicao } from '@/lib/auth/redefinicao';
import { origemRequisicao } from '@/lib/requisicao';

export type EstadoUsuario = {
  erros: string[];
  mensagem?: string;
  /** Link de senha gerado agora — mostrado uma única vez. */
  link?: { url: string; horas: number; novo: boolean };
  idCriado?: number;
  /** Valores enviados, para reexibir o formulário após erro. */
  valores?: usuarios.DadosUsuario;
  versao: number;
};

// O id do usuário vem num campo oculto do formulário (não em .bind): o envio
// sem JavaScript de ações vinculadas no cliente travava a resposta. Não há
// perda de segurança — argumentos vinculados também chegam do navegador, e
// toda ação confere a permissão e as regras no servidor.

async function autor() {
  const a = await exigirPermissao('gerenciar_usuarios');
  return { id: a.usuario.id, nome: a.usuario.nome };
}

function txt(form: FormData, k: string): string {
  const v = form.get(k);
  return typeof v === 'string' ? v : '';
}

function idDe(form: FormData): number {
  const v = txt(form, 'id');
  return /^\d{1,9}$/.test(v) ? Number(v) : 0;
}

function lerForm(form: FormData): usuarios.DadosUsuario {
  const salas: Record<number, number> = {};
  for (const [k, v] of form.entries()) {
    const m = /^sala_(\d+)$/.exec(k);
    if (m && typeof v === 'string') salas[Number(m[1])] = Number(v) || 0;
  }
  return {
    nome: txt(form, 'nome'),
    email: txt(form, 'email'),
    login: txt(form, 'login'),
    status: txt(form, 'status') || 'ativo',
    deveTrocarSenha: txt(form, 'deve_trocar_senha') === '1',
    perfisGlobais: form.getAll('perfis_globais').map(Number).filter(Number.isInteger),
    salas,
  };
}

export async function salvarUsuario(_: EstadoUsuario, form: FormData): Promise<EstadoUsuario> {
  const a = await autor();
  const id = idDe(form) || null;
  const dados = lerForm(form);
  const r = await usuarios.salvar(id, dados, a, await origemRequisicao());
  if (!r.ok) return { erros: r.erros, valores: dados, versao: Date.now() };

  revalidatePath('/acesso/usuarios');
  if (r.token) {
    return {
      erros: [],
      mensagem: 'Usuário cadastrado. Envie a ele o link abaixo para definir a senha.',
      link: { url: await urlRedefinicao(r.token), horas: 72, novo: true },
      idCriado: r.id,
      versao: Date.now(),
    };
  }
  return { erros: [], mensagem: 'Alterações salvas.', versao: Date.now() };
}

export async function gerarLinkSenha(_: EstadoUsuario, form: FormData): Promise<EstadoUsuario> {
  const a = await autor();
  const r = await usuarios.novoLinkSenha(idDe(form), a, await origemRequisicao());
  if ('erros' in r) return { erros: r.erros, versao: Date.now() };
  return {
    erros: [],
    mensagem: 'Link de redefinição gerado. Os links anteriores deixaram de valer.',
    link: { url: await urlRedefinicao(r.token), horas: 24, novo: false },
    versao: Date.now(),
  };
}

export async function desbloquearUsuario(_: EstadoUsuario, form: FormData): Promise<EstadoUsuario> {
  const a = await autor();
  const id = idDe(form);
  const erros = await usuarios.desbloquear(id, a, await origemRequisicao());
  revalidatePath(`/acesso/usuarios/${id}`);
  return { erros, mensagem: erros.length ? undefined : 'Bloqueio removido.', versao: Date.now() };
}

export async function excluirUsuario(_: EstadoUsuario, form: FormData): Promise<EstadoUsuario> {
  const a = await autor();
  const erros = await usuarios.excluir(idDe(form), a, await origemRequisicao());
  if (erros.length) return { erros, versao: Date.now() };
  revalidatePath('/acesso/usuarios');
  redirect('/acesso/usuarios?excluido=1');
}
