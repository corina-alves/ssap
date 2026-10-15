import 'server-only';
import { gravarConfig, lerConfig } from '../acesso/api';
import { anoMes, type CargaMes, type DiaReservatorio, type ManuaisExutorios, type Tipo } from './boletim-integrado';
import type { Edicoes } from './boletim-integrado-html';

/**
 * O que os boletins guardam (no PHP eram arquivos em exports/; aqui é a
 * tabela configuracoes, que mantém a versão anterior de cada chave):
 *   - edições da tela, por boletim e mês: textos de análise e valores ajustados;
 *   - cadastro manual dos exutórios: operação diária de Pirapora e
 *     Billings/Pedreira (por mês) e vazão e DBO mensais (carga orgânica).
 */

const chaveEdicoes = (tipo: Tipo, ano: number, mes: number) => `boletim-integrado.edicoes.${tipo.replace('_', '-')}.${anoMes(ano, mes)}`;
const chaveReservatorio = (slug: 'pedreira' | 'pirapora', ano: number, mes: number) => `boletim-integrado.exutorios.${slug}.${anoMes(ano, mes)}`;
const CHAVE_CARGAS = 'boletim-integrado.exutorios.cargas';

export async function lerEdicoes(tipo: Tipo, ano: number, mes: number): Promise<Edicoes> {
  const d = await lerConfig<Partial<Edicoes>>(chaveEdicoes(tipo, ano, mes));
  return { textos: d?.textos ?? {}, valores: d?.valores ?? {} };
}

/** Mescla as alterações: texto vazio remove o texto; valor null remove o ajuste (volta ao da fonte). */
export async function salvarEdicoes(tipo: Tipo, ano: number, mes: number, textos: Record<string, unknown>, valores: Record<string, unknown>, usuarioId: number): Promise<Edicoes> {
  const atual = await lerEdicoes(tipo, ano, mes);
  for (const [bruta, texto] of Object.entries(textos)) {
    const secao = bruta.replace(/[^a-z0-9_.-]/g, '').slice(0, 120);
    if (!secao) continue;
    const t = [...String(texto ?? '')].slice(0, 4000).join('').trim();
    if (t) atual.textos[secao] = t;
    else delete atual.textos[secao];
  }
  for (const [bruta, valor] of Object.entries(valores)) {
    const chave = bruta.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 120);
    if (!chave) continue;
    if (valor === null || valor === '') delete atual.valores[chave];
    else if ((typeof valor === 'number' || typeof valor === 'string') && Number.isFinite(Number(valor))) atual.valores[chave] = Number(valor);
  }
  await gravarConfig(chaveEdicoes(tipo, ano, mes), atual, usuarioId);
  return atual;
}

/** Remove todos os valores ajustados do boletim no mês (os textos de análise ficam). Devolve quantos eram. */
export async function restaurarValores(tipo: Tipo, ano: number, mes: number, usuarioId: number): Promise<{ removidos: number; textos: number }> {
  const atual = await lerEdicoes(tipo, ano, mes);
  const removidos = Object.keys(atual.valores).length;
  if (removidos) await gravarConfig(chaveEdicoes(tipo, ano, mes), { ...atual, valores: {} }, usuarioId);
  return { removidos, textos: Object.keys(atual.textos).length };
}

export const lerReservatorio = async (slug: 'pedreira' | 'pirapora', ano: number, mes: number) =>
  (await lerConfig<Record<string, DiaReservatorio>>(chaveReservatorio(slug, ano, mes))) ?? {};

export async function salvarReservatorio(slug: 'pedreira' | 'pirapora', ano: number, mes: number, dias: Record<string, DiaReservatorio>, usuarioId: number): Promise<void> {
  await gravarConfig(chaveReservatorio(slug, ano, mes), Object.fromEntries(Object.entries(dias).sort(([a], [b]) => (a < b ? -1 : 1))), usuarioId);
}

export const lerCargas = async () => (await lerConfig<Record<string, CargaMes>>(CHAVE_CARGAS)) ?? {};

export async function salvarCargas(meses: Record<string, CargaMes>, usuarioId: number): Promise<void> {
  await gravarConfig(CHAVE_CARGAS, Object.fromEntries(Object.entries(meses).sort(([a], [b]) => (a < b ? -1 : 1))), usuarioId);
}

/** Cadastro manual usado pelo Boletim Exutórios de um mês. */
export async function lerManuais(ano: number, mes: number): Promise<ManuaisExutorios> {
  const [pedreira, pirapora, cargas] = await Promise.all([lerReservatorio('pedreira', ano, mes), lerReservatorio('pirapora', ano, mes), lerCargas()]);
  return { pedreira, pirapora, cargas };
}
