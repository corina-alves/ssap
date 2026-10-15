import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { auditar } from '@/lib/auditoria';
import { ehTipo, MESES, NOMES, periodoBoletim, PERMISSAO_BOLETIM, SALA_BOLETIM, ultimoMesFechado } from '@/lib/boletins-sala/boletim-integrado';
import { restaurarValores, salvarEdicoes } from '@/lib/boletins-sala/boletim-integrado-armazenado';
import { origemRequisicao } from '@/lib/requisicao';

const erro = (mensagem: string, status: number) => NextResponse.json({ ok: false, erro: mensagem }, { status });

/**
 * POST — grava as edições feitas na tela do boletim (a origem do envio é conferida em src/proxy.ts):
 *   {tipo, ano, mes, textos: {seção: texto}, valores: {chave: número|null}}  ou  {acao: "restaurar", tipo, ano, mes}
 */
export async function POST(req: NextRequest) {
  const acesso = await exigirApi(SALA_BOLETIM, PERMISSAO_BOLETIM);
  if (acesso instanceof NextResponse) return acesso;

  const d = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return erro('Conteúdo inválido.', 400);
  const tipo = String(d.tipo ?? '');
  if (!ehTipo(tipo)) return erro('Tipo de boletim inválido.', 400);
  const { ano, mes } = periodoBoletim(d.ano, d.mes, ultimoMesFechado());
  const usuario = { id: acesso.a.usuario.id, nome: acesso.a.usuario.nome };
  const base = { modulo: 'boletins', entidade: 'boletim_integrado', salaId: acesso.sala.id, usuario, ...(await origemRequisicao()) };
  const rotulo = `Boletim ${NOMES[tipo]} de ${MESES[mes - 1]}/${ano}`;
  const objeto = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

  if (d.acao === 'restaurar') {
    const r = await restaurarValores(tipo, ano, mes, usuario.id);
    await auditar({ ...base, acao: 'boletim_integrado_restaurar', descricao: `${rotulo}: ${r.removidos} valor(es) restaurado(s) ao original`, depois: r });
    return NextResponse.json({ ok: true, ...r });
  }
  const salvo = await salvarEdicoes(tipo, ano, mes, objeto(d.textos), objeto(d.valores), usuario.id);
  const totais = { textos: Object.keys(salvo.textos).length, valores: Object.keys(salvo.valores).length };
  await auditar({ ...base, acao: 'boletim_integrado_editar', descricao: `${rotulo}: edição gravada`, depois: totais });
  return NextResponse.json({ ok: true, ...totais, atualizado_em: new Date().toISOString() });
}
