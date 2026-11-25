import { NextResponse, type NextRequest } from 'next/server';
import { DIAGRAMA_PARAIBA } from '@/conteudo/diagrama-paraiba';
import { ehPostoAna, ehPostoSibh } from '@/conteudo/diagramas-unifilares';
import { exigirApiEmAlguma } from '@/lib/acesso/api';
import { graficosPosto } from '@/lib/hidrologia/cantareira-operacao';
import { graficosPluviometro, graficosReservatorio, SALA_VALE_PARAIBA } from '@/lib/hidrologia/paraiba-do-sul';
import { dataValida, PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { FONTE as FONTE_ANA, trintaDias } from '@/lib/integracoes/ana-telemetria';
import { hojeSp } from '@/lib/integracoes/comum';

export const maxDuration = 120;

/**
 * GET ?id=<station_prefix_id>&data= (posto do SIBH) ou ?ana=<código>&data=
 * (estação telemétrica da ANA) — gráficos de um posto do diagrama da bacia do
 * Paraíba do Sul (só desses): vazão e nível médios por dia nos 30 dias até a
 * data e a chuva (ANA: do pluviômetro da estação; SIBH: sem radar na bacia).
 * Mesmo formato dos gráficos de posto dos outros diagramas.
 * Também ?reservatorio=<local> (reservatório ou elevatória do ONS: volume, nível e
 * vazões de cada dia) e ?pluvio=<station_prefix_id> (pluviômetro do SIBH: chuva de cada dia).
 */
export async function GET(req: NextRequest) {
  const acesso = await exigirApiEmAlguma([SALA_PAINEL, SALA_VALE_PARAIBA], PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const p = req.nextUrl.searchParams;
  const pedida = p.get('data');
  const data = dataValida(pedida) && pedida <= hojeSp() ? pedida : hojeSp();
  const cache = { headers: { 'Cache-Control': 'private, max-age=60' } };
  try {
    if (p.has('reservatorio')) {
      const g = await graficosReservatorio(Number(p.get('reservatorio')), data);
      return g ? NextResponse.json(g, cache) : NextResponse.json({ erro: 'Reservatório fora do diagrama.' }, { status: 404 });
    }
    if (p.has('pluvio')) {
      const g = await graficosPluviometro(Number(p.get('pluvio')), data);
      return g ? NextResponse.json(g, cache) : NextResponse.json({ erro: 'Pluviômetro fora do diagrama.' }, { status: 404 });
    }
    const codigo = p.get('ana');
    if (codigo !== null) {
      const no = DIAGRAMA_PARAIBA.nos.filter(ehPostoAna).find((n) => n.ana.codigo === codigo);
      if (!no) return NextResponse.json({ erro: 'Estação fora do diagrama.' }, { status: 404 });
      const t = await trintaDias(codigo, data);
      return NextResponse.json(
        { data, id: 0, prefixo: codigo, nome: no.nome, radar: null, semDados: t.semDados, atual: t.atual, dias: t.dias, fonte: FONTE_ANA, chuvaDoPosto: true },
        { headers: { 'Cache-Control': 'private, max-age=60' } },
      );
    }
    const id = Number(p.get('id'));
    if (!DIAGRAMA_PARAIBA.nos.some((n) => ehPostoSibh(n) && n.sibh.id === id)) return NextResponse.json({ erro: 'Posto fora do diagrama.' }, { status: 404 });
    const g = await graficosPosto(id, data);
    if (!g) return NextResponse.json({ erro: 'Posto fora dos diagramas.' }, { status: 404 });
    return NextResponse.json(g, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    return NextResponse.json({ erro: `Fonte indisponível: ${(e as Error).message}` }, { status: 502 });
  }
}
