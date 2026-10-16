'use server';

import { redirect } from 'next/navigation';
import { salaPorSlug } from '@/lib/acesso/api';
import { auditar } from '@/lib/auditoria';
import { acl } from '@/lib/auth/acl';
import { ErroValidacao } from '@/lib/graficos-tabela';
import { decodificar, lerCsv, lerGrade, SISTEMAS, sistemaCitado, type Registro } from '@/lib/hidrologia/projecoes';
import { salvarRodada } from '@/lib/hidrologia/projecoes-rodadas';
import { lerXlsx } from '@/lib/planilha-xlsx';
import { origemRequisicao } from '@/lib/requisicao';

export type EstadoProjecao = { erros: string[] };

const MAX_BYTES = 5 * 1024 * 1024;

const texto = (form: FormData, campo: string) => {
  const v = form.get(campo);
  return typeof v === 'string' ? v : '';
};

/**
 * Registros da planilha. No .xlsx, lê todas as abas do sistema da página (pelo
 * nome da aba ou pelo título, ex.: "Cantareira 100", "Cantareira 70"); sem aba
 * que cite um sistema, lê as que não citam nenhum. No .csv, a tabela única.
 * Recusa a planilha que só tem dados de outro sistema.
 */
function lerPlanilha(bytes: Uint8Array, nome: string, sistema: string): { registros: Registro[]; abas: string[] } {
  const nomeSistema = SISTEMAS[sistema]!.nome;
  const outroSistema = (citados: (string | null)[]) =>
    new ErroValidacao([
      `${nome}: a planilha é do ${[...new Set(citados.flatMap((s) => (s ? [SISTEMAS[s]!.nome] : [])))].join(', ')}, mas a página está em ${nomeSistema}. Troque o sistema acima.`,
    ]);
  if (/\.xlsx$/i.test(nome)) {
    const abas = lerXlsx(bytes).map((a) => ({ ...a, sistema: sistemaCitado([], a.nome) ?? sistemaCitado(a.linhas) }));
    let usar = abas.filter((a) => a.sistema === sistema);
    if (!usar.length) usar = abas.filter((a) => a.sistema === null);
    if (!usar.length) throw outroSistema(abas.map((a) => a.sistema));
    const registros: Registro[] = [];
    const lidas: string[] = [];
    for (const a of usar) {
      const r = lerGrade(a.linhas, nome, a.nome);
      if (r) {
        registros.push(...r);
        lidas.push(a.nome);
      }
    }
    if (!registros.length) {
      throw new ErroValidacao([
        `${nome}: não achei datas com volumes rotulados por ESI e QN ${usar.length > 1 ? 'nas abas' : 'na aba'} ${usar.map((a) => `"${a.nome}"`).join(', ')}.`,
      ]);
    }
    return { registros, abas: lidas };
  }
  const t = decodificar(bytes);
  const citado = sistemaCitado(t.split(/\r\n|\r|\n/, 5).map((l) => [l]));
  if (citado && citado !== sistema) throw outroSistema([citado]);
  return { registros: lerCsv(t, nome), abas: [] };
}

/** Envio de uma rodada nova: uma planilha com todas as simulações (QN × retirada na ESI). Exige criar_graficos na sala. */
export async function enviarRodadaAcao(_: EstadoProjecao, form: FormData): Promise<EstadoProjecao> {
  const a = await acl();
  const sala = await salaPorSlug(texto(form, 's'));
  if (!sala || !a.pode('criar_graficos', sala.id)) return { erros: ['Sem permissão para enviar projeções nesta sala.'] };
  const sistema = texto(form, 'sistema');
  const sis = SISTEMAS[sistema];
  if (!sis) return { erros: ['Sistema inválido.'] };

  const arquivo = form.get('planilha');
  if (!arquivo || typeof arquivo === 'string' || (arquivo.size === 0 && !arquivo.name)) return { erros: ['Selecione a planilha das simulações.'] };
  const nome = arquivo.name.replace(/^.*[\\/]/, '');
  if (arquivo.size > MAX_BYTES) return { erros: [`${nome}: maior que 5 MB.`] };
  if (/\.xls$/i.test(nome)) return { erros: [`${nome}: formato antigo do Excel (.xls). Salve como .xlsx e envie de novo.`] };
  if (!/\.(xlsx|csv|txt)$/i.test(nome)) return { erros: [`${nome}: envie a planilha em .xlsx (ou .csv).`] };
  // Sem referência digitada, vale o nome do arquivo (ex.: "Simulações Cantareira 16-10-2026").
  const referencia = texto(form, 'referencia').trim() || nome.replace(/\.[^.]+$/, '').slice(0, 120);

  let registros: Registro[];
  let abas: string[];
  try {
    ({ registros, abas } = lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()), nome, sistema));
  } catch (e) {
    if (!(e instanceof ErroValidacao)) throw e;
    return { erros: e.erros };
  }
  if (!registros.length) return { erros: ['Nenhum dado de volume útil foi reconhecido na planilha.'] };
  const unicos = new Map(registros.map((r) => [`${r.esi}|${r.qn}|${r.mes}`, r]));
  const simulacoes = new Set(registros.map((r) => `${r.esi}|${r.qn}`)).size;

  const autor = { id: a.usuario.id, nome: a.usuario.nome };
  const nova = await salvarRodada(sistema, [...unicos.values()], referencia, autor.nome);
  await auditar({
    modulo: 'graficos', acao: 'projecao_enviar', entidade: 'projecoes', salaId: sala.id,
    descricao: `Projeções enviadas: ${sis.nome}${referencia ? ` (${referencia})` : ''}`,
    depois: { sistema, rodada: nova, arquivo: nome, abas, simulacoes, dados: unicos.size }, usuario: autor, ...(await origemRequisicao()),
  });
  const q = new URLSearchParams({ s: sala.slug, sistema, rodada: nova, simulacoes: String(simulacoes), valores: String(unicos.size) });
  for (const aba of abas) q.append('aba', aba);
  redirect(`/acesso/graficos/projecoes?${q}`);
}
