'use server';

import { redirect } from 'next/navigation';
import { auditar } from '@/lib/auditoria';
import { exigirUsuario } from '@/lib/auth/acl';
import { login, trocarSenha } from '@/lib/auth/login';
import { redefinirComToken } from '@/lib/auth/redefinicao';
import { encerrarSessaoAtual, usuarioAtual } from '@/lib/auth/sessao';
import { origemRequisicao } from '@/lib/requisicao';

export type EstadoForm = { erros: string[] };

function texto(form: FormData, campo: string): string {
  const v = form.get(campo);
  return typeof v === 'string' ? v : '';
}

export async function entrar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const r = await login(texto(form, 'usuario'), texto(form, 'senha'), await origemRequisicao());
  if (!r.ok) return { erros: [r.mensagem] };
  redirect(r.trocarSenha ? '/acesso/trocar-senha' : '/acesso');
}

export async function sair(): Promise<void> {
  const u = await usuarioAtual();
  if (u) {
    await auditar({
      modulo: 'auth', acao: 'logout', entidade: 'usuarios', entidadeId: u.id,
      descricao: 'Logout', usuario: u, ...(await origemRequisicao()),
    });
  }
  await encerrarSessaoAtual('logout');
  redirect('/acesso/login');
}

export async function definirSenhaPorLink(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const erros = await redefinirComToken(
    texto(form, 'token'),
    texto(form, 'nova'),
    texto(form, 'confirmacao'),
    await origemRequisicao(),
  );
  if (erros.length) return { erros };
  // Encerra qualquer sessão aberta neste navegador antes de voltar ao login.
  await encerrarSessaoAtual('senha_redefinida');
  redirect('/acesso/login?senha=definida');
}

export async function alterarSenha(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const u = await exigirUsuario({ permitirTrocaPendente: true });
  const erros = await trocarSenha(
    u,
    texto(form, 'atual'),
    texto(form, 'nova'),
    texto(form, 'confirmacao'),
    await origemRequisicao(),
  );
  if (erros.length) return { erros };
  redirect('/acesso?senha=alterada');
}
