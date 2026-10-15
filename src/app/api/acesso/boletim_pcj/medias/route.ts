import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi, gravarConfig, lerConfig } from '@/lib/acesso/api';
import { auditar } from '@/lib/auditoria';
import { aplicarMedias, CHAVE_MEDIAS, MEDIAS_INICIAIS, PERMISSAO_PCJ, SALA_PCJ, type Medias } from '@/lib/boletins-sala/pcj';
import { origemRequisicao } from '@/lib/requisicao';

/**
 * POST {"mes": 9, "chuva": {"53": 55.72, ...}, "vazao": {...}, "nivel": {...}}
 * Grava as médias históricas de um mês (botão "Salvar médias do mês").
 * A origem da requisição é conferida em src/proxy.ts (todas as rotas /api).
 */
export async function POST(req: NextRequest) {
  const acesso = await exigirApi(SALA_PCJ, PERMISSAO_PCJ);
  if (acesso instanceof NextResponse) return acesso;

  const entrada: unknown = await req.json().catch(() => null);
  const atual = (await lerConfig<Medias>(CHAVE_MEDIAS)) ?? MEDIAS_INICIAIS;
  const r = aplicarMedias(atual, entrada);
  if ('erro' in r) return NextResponse.json({ erro: r.erro }, { status: 422 });

  if (r.alterados) {
    const u = acesso.a.usuario;
    await gravarConfig(CHAVE_MEDIAS, r.medias, u.id);
    await auditar({
      modulo: 'boletins', acao: 'medias_pcj', salaId: acesso.sala.id, usuario: u,
      descricao: `Médias históricas do Boletim PCJ (mês ${r.mes}): ${r.alterados} valor(es) alterado(s)`,
      ...(await origemRequisicao()),
    });
  }
  return NextResponse.json({ ok: true, alterados: r.alterados });
}
