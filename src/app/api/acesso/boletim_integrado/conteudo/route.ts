import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import {
  dadosChuvaVazao, dadosExutorios, dadosMananciais, ehTipo, novaColeta, periodoBoletim, PERMISSAO_BOLETIM, SALA_BOLETIM, TIPOS, ultimoMesFechado, type Tipo,
} from '@/lib/boletins-sala/boletim-integrado';
import { lerEdicoes, lerManuais } from '@/lib/boletins-sala/boletim-integrado-armazenado';
import { avisoPendencias, htmlChuvaVazao, htmlExutorios, htmlMananciais } from '@/lib/boletins-sala/boletim-integrado-html';

export const maxDuration = 180;

const erro = (mensagem: string, status: number) => NextResponse.json({ ok: false, erro: mensagem }, { status });

async function montar(tipo: Tipo, ano: number, mes: number): Promise<string> {
  const coleta = novaColeta();
  const edicoes = await lerEdicoes(tipo, ano, mes);
  const html =
    tipo === 'chuva_vazao'
      ? htmlChuvaVazao(await dadosChuvaVazao(ano, mes, coleta), ano, mes, edicoes)
      : tipo === 'mananciais'
        ? htmlMananciais(await dadosMananciais(ano, mes, coleta), ano, mes, edicoes)
        : htmlExutorios(await dadosExutorios(ano, mes, await lerManuais(ano, mes), coleta), ano, mes, edicoes);
  return avisoPendencias(coleta.pendencias) + html;
}

/** GET ?tipo=&ano=&mes= — conteúdo do boletim, montado com os dados das fontes e as edições gravadas (tela e PDF usam o mesmo). */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_BOLETIM, PERMISSAO_BOLETIM);
  if (acesso instanceof NextResponse) return acesso;
  const q = req.nextUrl.searchParams;
  const tipo = q.get('tipo') ?? '';
  if (!ehTipo(tipo)) return erro('Tipo de boletim inválido.', 400);
  const { ano, mes } = periodoBoletim(q.get('ano'), q.get('mes'), ultimoMesFechado());
  try {
    return NextResponse.json({ ok: true, tipo, titulo: TIPOS[tipo], periodo: { ano, mes }, html: await montar(tipo, ano, mes) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('Boletim integrado:', e);
    return erro('Não foi possível montar o boletim no momento. Tente novamente em instantes.', 500);
  }
}
