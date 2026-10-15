'use server';

import { redirect } from 'next/navigation';
import { salaPorSlug } from '@/lib/acesso/api';
import { auditar } from '@/lib/auditoria';
import { acl } from '@/lib/auth/acl';
import { ErroValidacao } from '@/lib/graficos-tabela';
import { decodificar, formatarEsi, lerCsv, numero, SISTEMAS, type Registro } from '@/lib/hidrologia/projecoes';
import { salvarRodada } from '@/lib/hidrologia/projecoes-rodadas';
import { origemRequisicao } from '@/lib/requisicao';

export type EstadoProjecao = { erros: string[] };

const MAX_BYTES = 5 * 1024 * 1024;

const texto = (form: FormData, campo: string) => {
  const v = form.get(campo);
  return typeof v === 'string' ? v : '';
};

/**
 * Envio de uma rodada nova: um CSV por célula da grade (campos "arq:<QN>:<ESI>")
 * e/ou o CSV consolidado do kit. Exige criar_graficos na sala.
 */
export async function enviarRodadaAcao(_: EstadoProjecao, form: FormData): Promise<EstadoProjecao> {
  const a = await acl();
  const sala = await salaPorSlug(texto(form, 's'));
  if (!sala || !a.pode('criar_graficos', sala.id)) return { erros: ['Sem permissão para enviar projeções nesta sala.'] };
  const sistema = texto(form, 'sistema');
  const sis = SISTEMAS[sistema];
  if (!sis) return { erros: ['Sistema inválido.'] };
  const referencia = texto(form, 'referencia').trim();

  const erros: string[] = [];
  const registros = new Map<string, Registro>();
  let arquivos = 0;
  /** Lê um arquivo enviado e junta os registros; ESI e QN vêm da célula (ou, no consolidado, do próprio CSV). */
  const ler = async (v: FormDataEntryValue, esi: string | null, qn: number | null) => {
    if (typeof v === 'string' || (v.size === 0 && !v.name)) return; // célula sem arquivo
    const nome = v.name.replace(/^.*[\\/]/, '');
    if (v.size > MAX_BYTES) return void erros.push(`${nome}: maior que 5 MB.`);
    if (!/\.(csv|txt)$/i.test(nome)) return void erros.push(`${nome}: envie o arquivo .csv baixado do SSD.`);
    arquivos++;
    try {
      for (const r of lerCsv(decodificar(new Uint8Array(await v.arrayBuffer())), nome, esi, qn)) registros.set(`${r.esi}|${r.qn}|${r.mes}`, r);
    } catch (e) {
      if (!(e instanceof ErroValidacao)) throw e;
      erros.push(...e.erros);
    }
  };

  const consolidado = form.get('consolidado');
  if (consolidado) await ler(consolidado, null, null);
  for (const [campo, v] of form.entries()) {
    const m = /^arq:(\d{1,3}):([\d_]{1,8})$/.exec(campo);
    const esi = m ? numero(m[2]!.replace('_', '.')) : null;
    if (m && esi !== null) await ler(v, formatarEsi(esi), Number(m[1]));
  }
  if (!erros.length && !arquivos) erros.push('Selecione os arquivos CSV das simulações (ou o CSV consolidado).');
  if (!erros.length && !registros.size) erros.push('Nenhum dado de volume útil foi reconhecido nos arquivos enviados.');
  if (erros.length) return { erros };

  const autor = { id: a.usuario.id, nome: a.usuario.nome };
  const nova = await salvarRodada(sistema, [...registros.values()], referencia, autor.nome);
  await auditar({
    modulo: 'graficos', acao: 'projecao_enviar', entidade: 'projecoes', salaId: sala.id,
    descricao: `Projeções enviadas: ${sis.nome}${referencia ? ` (${referencia})` : ''}`,
    depois: { sistema, rodada: nova, arquivos, dados: registros.size }, usuario: autor, ...(await origemRequisicao()),
  });
  const q = new URLSearchParams({ s: sala.slug, sistema, rodada: nova, arquivos: String(arquivos), valores: String(registros.size) });
  redirect(`/acesso/graficos/projecoes?${q}`);
}
