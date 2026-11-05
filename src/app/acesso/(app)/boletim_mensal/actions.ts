'use server';

import { revalidatePath } from 'next/cache';
import type { EstadoAdmin } from '@/lib/admin/estado';
import { acl } from '@/lib/auth/acl';
import { enviarImagem, removerImagem, salvarTextos } from '@/lib/boletins-sala/boletim-mensal';
import { queryOne } from '@/lib/db';
import { origemRequisicao } from '@/lib/requisicao';

const texto = (f: FormData, k: string) => String(f.get(k) ?? '');

async function contexto(f: FormData) {
  const a = await acl();
  const sala = await queryOne<{ id: number; slug: string }>("SELECT id, slug FROM salas WHERE id = $1 AND status = 'ativa' AND excluido_em IS NULL", [Number(f.get('sala_id')) || 0]);
  return { a, sala, mes: texto(f, 'mes'), autor: { id: a.usuario.id, nome: a.usuario.nome }, origem: await origemRequisicao() };
}

const resposta = (erros: string[], mensagem: string): EstadoAdmin => {
  if (!erros.length) revalidatePath('/acesso/boletim_mensal');
  return { erros, mensagem: erros.length ? undefined : mensagem, versao: Date.now() };
};

/** Textos do boletim: campos "texto:<chave>". */
export async function salvarTextosAcao(_: EstadoAdmin, f: FormData): Promise<EstadoAdmin> {
  const { a, sala, mes, autor, origem } = await contexto(f);
  if (!sala) return resposta(['Sala não encontrada.'], '');
  const textos = Object.fromEntries([...f.entries()].filter(([k]) => k.startsWith('texto:')).map(([k, v]) => [k.slice(6), String(v)]));
  return resposta(await salvarTextos(a, sala.id, mes, textos, autor, origem), 'Textos salvos.');
}

export async function enviarImagemAcao(_: EstadoAdmin, f: FormData): Promise<EstadoAdmin> {
  const { a, sala, mes, autor, origem } = await contexto(f);
  if (!sala) return resposta(['Sala não encontrada.'], '');
  return resposta(await enviarImagem(a, sala.id, sala.slug, mes, texto(f, 'chave'), f.get('imagem'), autor, origem), 'Imagem anexada.');
}

export async function removerImagemAcao(_: EstadoAdmin, f: FormData): Promise<EstadoAdmin> {
  const { a, sala, mes, autor, origem } = await contexto(f);
  if (!sala) return resposta(['Sala não encontrada.'], '');
  return resposta(await removerImagem(a, sala.id, mes, texto(f, 'chave'), autor, origem), 'Imagem removida.');
}
