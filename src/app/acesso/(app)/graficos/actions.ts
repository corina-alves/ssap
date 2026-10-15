'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { acl } from '@/lib/auth/acl';
import * as graficos from '@/lib/graficos';
import { salaPorSlug } from '@/lib/acesso/api';
import { ErroValidacao, tabelaDe } from '@/lib/graficos-tabela';
import { graficoMlt, type Parametros } from '@/lib/hidrologia/grafico-mlt';
import { graficoSsd, type Parametros as ParametrosSsd } from '@/lib/hidrologia/grafico-ssd';
import { hojeSp } from '@/lib/integracoes/comum';
import { origemRequisicao } from '@/lib/requisicao';

export type ValoresGrafico = { titulo: string; tipo: string; fonte: string; unidade: string; eixo_y: string; empilhado: boolean; dados: string };
export type EstadoGrafico = { erros: string[]; valores?: ValoresGrafico };

const texto = (form: FormData, campo: string) => {
  const v = form.get(campo);
  return typeof v === 'string' ? v : '';
};
const inteiro = (form: FormData, campo: string) => (/^\d{1,9}$/.test(texto(form, campo)) ? Number(texto(form, campo)) : 0);

const lista = (salaId: number, aviso?: string) => `/acesso/graficos?sala=${salaId}${aviso ? `&aviso=${aviso}` : ''}`;

/** Novo exige criar_graficos; edição exige editar_graficos — sempre na sala do gráfico. */
export async function salvarGraficoAcao(_: EstadoGrafico, form: FormData): Promise<EstadoGrafico> {
  const a = await acl();
  const id = inteiro(form, 'id') || null;
  const salaId = inteiro(form, 'sala');
  const valores: ValoresGrafico = {
    titulo: texto(form, 'titulo'), tipo: texto(form, 'tipo'), fonte: texto(form, 'fonte'), unidade: texto(form, 'unidade'),
    eixo_y: texto(form, 'eixo_y'), empilhado: texto(form, 'empilhado') === '1', dados: texto(form, 'dados'),
  };
  if (!a.pode(id ? 'editar_graficos' : 'criar_graficos', salaId)) return { erros: ['Sem permissão para salvar gráficos nesta sala.'], valores };
  if (valores.dados.length > 200_000) return { erros: ['Dados: conteúdo grande demais.'], valores };
  try {
    await graficos.salvar(id, salaId, valores, { id: a.usuario.id, nome: a.usuario.nome }, await origemRequisicao());
  } catch (e) {
    if (e instanceof ErroValidacao) return { erros: e.erros, valores };
    throw e;
  }
  revalidatePath('/acesso/graficos');
  redirect(lista(salaId, id ? 'atualizado' : 'criado'));
}

export type EstadoSalvarAnalise = { erros: string[] };

/**
 * Salva o gráfico de "Criar gráfico com MLT" na lista da sala, como rascunho.
 * O gráfico é montado de novo aqui a partir dos parâmetros do formulário.
 */
export async function salvarGraficoMltAcao(_: EstadoSalvarAnalise, form: FormData): Promise<EstadoSalvarAnalise> {
  const a = await acl();
  const sala = await salaPorSlug(texto(form, 's'));
  if (!sala || !a.pode('criar_graficos', sala.id)) return { erros: ['Sem permissão para salvar gráficos nesta sala.'] };

  const parametros: Parametros = {};
  for (const k of ['sistema', 'variavel', 'periodo', 'formato', 'mlt_de', 'mlt_ate', 'de', 'ate', 'ano1', 'ano2', 'ano3', 'ano4']) {
    if (form.has(k)) parametros[k] = texto(form, k);
  }
  let g: Awaited<ReturnType<typeof graficoMlt>>;
  try {
    g = await graficoMlt(parametros, Number(hojeSp().slice(0, 4)));
  } catch {
    return { erros: ['Não foi possível obter os dados do SSD agora. Tente novamente em instantes.'] };
  }
  let id: number;
  try {
    id = await graficos.salvar(
      null,
      sala.id,
      { titulo: texto(form, 'titulo').trim() || g.titulo, tipo: g.grafico.tipo, fonte: 'SSD SP Águas', unidade: g.unidade, eixo_y: g.grafico.eixo_y, empilhado: false, dados: tabelaDe(g.grafico) },
      { id: a.usuario.id, nome: a.usuario.nome },
      await origemRequisicao(),
    );
  } catch (e) {
    if (e instanceof ErroValidacao) return { erros: e.erros };
    throw e;
  }
  revalidatePath('/acesso/graficos');
  redirect(`/acesso/graficos/editar?sala=${sala.id}&id=${id}`);
}

/** Salva o gráfico de "Gráficos com dados do SSD" na lista da sala, como rascunho (montado de novo aqui). */
export async function salvarGraficoSsdAcao(_: EstadoSalvarAnalise, form: FormData): Promise<EstadoSalvarAnalise> {
  const a = await acl();
  const sala = await salaPorSlug(texto(form, 's'));
  if (!sala || !a.pode('criar_graficos', sala.id)) return { erros: ['Sem permissão para salvar gráficos nesta sala.'] };

  const parametros: ParametrosSsd = { locais: form.getAll('locais').filter((v): v is string => typeof v === 'string') };
  for (const k of new Set(form.keys())) {
    if (k !== 'locais' && k !== 'titulo' && k !== 's' && !k.startsWith('$')) parametros[k] = texto(form, k);
  }
  const g = await graficoSsd(parametros, hojeSp());
  if (!g.grafico) return { erros: g.erro ? [g.erro] : g.avisos.length ? g.avisos : ['Não foi possível montar o gráfico.'] };

  let id: number;
  try {
    id = await graficos.salvar(
      null,
      sala.id,
      {
        titulo: texto(form, 'titulo').trim() || g.titulo, tipo: g.grafico.tipo, fonte: 'SSD SP Águas', unidade: g.grafico.unidade,
        eixo_y: g.grafico.eixo_y, empilhado: g.grafico.empilhado, dados: tabelaDe(g.grafico),
        cores: Object.fromEntries(g.grafico.series.filter((s) => s.cor).map((s) => [s.nome, s.cor!])),
      },
      { id: a.usuario.id, nome: a.usuario.nome },
      await origemRequisicao(),
    );
  } catch (e) {
    if (e instanceof ErroValidacao) return { erros: e.erros };
    throw e;
  }
  revalidatePath('/acesso/graficos');
  redirect(`/acesso/graficos/editar?sala=${sala.id}&id=${id}`);
}

/** Publicar, despublicar e excluir (permissão conferida por ação, na sala do gráfico). */
export async function acaoGraficoAcao(form: FormData): Promise<void> {
  const a = await acl();
  const g = await graficos.obter(inteiro(form, 'id'));
  if (!g || !a.pode('visualizar_graficos', g.sala_id)) redirect('/acesso/sem-acesso');
  const autor = { id: a.usuario.id, nome: a.usuario.nome };
  const acao = texto(form, 'acao');
  let aviso = 'invalido';
  if (acao === 'publicar' || acao === 'despublicar') {
    if (!a.pode('publicar_graficos', g.sala_id)) redirect('/acesso/sem-acesso');
    await graficos.publicar(g, acao === 'publicar', autor, await origemRequisicao());
    aviso = acao === 'publicar' ? 'publicado' : 'despublicado';
  } else if (acao === 'excluir') {
    if (!a.pode('editar_graficos', g.sala_id)) redirect('/acesso/sem-acesso');
    aviso = (await graficos.excluir(g, autor, await origemRequisicao())) ? 'publicado-nao-exclui' : 'excluido';
  }
  revalidatePath('/acesso/graficos');
  redirect(lista(g.sala_id, aviso));
}
