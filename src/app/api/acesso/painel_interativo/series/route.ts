import { NextResponse, type NextRequest } from 'next/server';
import { exigirApi } from '@/lib/acesso/api';
import { dataValida, localPermitido, PERMISSAO_PAINEL, pontosDiarios, SALA_PAINEL, VAR } from '@/lib/hidrologia/painel-interativo';
import { somarDias } from '@/lib/integracoes/comum';

export const maxDuration = 120;

const VARIAVEIS = new Set<number>(Object.values(VAR));
const MAX_SERIES = 12;
const MAX_DIAS = 6 * 366; // comparações de até 6 anos

const erro = (mensagem: string) => NextResponse.json({ erro: mensagem }, { status: 400 });

/**
 * GET ?s=local:variável (até 12, repetido) &de=AAAA-MM-DD &ate=AAAA-MM-DD —
 * séries diárias do SSD para os gráficos: { series: { "local:variável": [{ data, valor }] } }.
 */
export async function GET(req: NextRequest) {
  const acesso = await exigirApi(SALA_PAINEL, PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const p = req.nextUrl.searchParams;
  const de = p.get('de');
  const ate = p.get('ate');
  if (!dataValida(de) || !dataValida(ate) || de > ate) return erro('Período inválido.');
  if (somarDias(de, MAX_DIAS) < ate) return erro('Período longo demais (máximo de 6 anos).');
  const pares = [...new Set(p.getAll('s'))].slice(0, MAX_SERIES).map((s) => s.split(':').map(Number) as [number, number]);
  if (!pares.length) return erro('Informe ao menos uma série (s=local:variável).');
  for (const [space, v] of pares) {
    if (!Number.isInteger(space) || !VARIAVEIS.has(v) || !(await localPermitido(space))) return erro('Série não permitida.');
  }
  try {
    const listas = await Promise.all(pares.map(([space, v]) => pontosDiarios(space, v, de, ate)));
    const series = Object.fromEntries(pares.map(([space, v], i) => [`${space}:${v}`, listas[i]]));
    return NextResponse.json({ de, ate, series }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (e) {
    return NextResponse.json({ erro: `SSD indisponível: ${(e as Error).message}` }, { status: 502 });
  }
}
