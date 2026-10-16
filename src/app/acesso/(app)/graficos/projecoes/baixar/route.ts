import { salaPorSlug } from '@/lib/acesso/api';
import { acl } from '@/lib/auth/acl';
import { usuarioAtual } from '@/lib/auth/sessao';
import { csvConsolidado, filtrarPeriodo, filtrarSimulacoes, lerCsv, resumo, SISTEMAS } from '@/lib/hidrologia/projecoes';
import { csvRodada } from '@/lib/hidrologia/projecoes-rodadas';

const MES = /^\d{4}-\d{2}$/;

/**
 * CSV consolidado da rodada (tipo=csv) ou resumo da marcação da GDN (tipo=txt),
 * para quem vê os gráficos da sala. Com de/ate (AAAA-MM), só o período escolhido;
 * com c=<esi>:<qn> (repetido), só essas simulações.
 */
export async function GET(req: Request) {
  if (!(await usuarioAtual())) return new Response('Faça login.', { status: 401 });
  const a = await acl();
  const p = new URL(req.url).searchParams;
  const sala = await salaPorSlug(p.get('s') ?? '');
  if (!sala || !a.pode('visualizar_graficos', sala.id)) return new Response('Sem acesso.', { status: 403 });

  const sistema = p.get('sistema') ?? '';
  const rodada = p.get('rodada') ?? '';
  const tipo = p.get('tipo');
  const csv = Object.hasOwn(SISTEMAS, sistema) && (tipo === 'csv' || tipo === 'txt') ? await csvRodada(sistema, rodada) : null;
  if (csv === null) return new Response('Rodada não encontrada: o arquivo desta rodada não existe mais.', { status: 404 });

  let de = MES.test(p.get('de') ?? '') ? p.get('de')! : '';
  let ate = MES.test(p.get('ate') ?? '') ? p.get('ate')! : '';
  if (de && ate && de > ate) [de, ate] = [ate, de];
  const escolhidas = new Set(p.getAll('c').filter((c) => /^\d{1,3}(\.\d{1,2})?:\d{1,3}$/.test(c)));
  const registros = filtrarSimulacoes(filtrarPeriodo(lerCsv(csv, rodada), de, ate), escolhidas);
  const periodo = (de || ate ? `_${de || 'inicio'}_a_${ate || 'fim'}` : '') + (escolhidas.size ? '_selecao' : '');

  const base = `projecao_${sistema}_${rodada.slice(7, 22)}${periodo}`;
  const [corpo, mime, nome] =
    tipo === 'csv'
      ? [`﻿${periodo ? csvConsolidado(registros) : csv}`, 'text/csv', `${base}_dados_consolidados.csv`]
      : [`﻿${resumo(sistema, registros)}`, 'text/plain', `${base}_resumo_marcacao_GDN.txt`];
  return new Response(corpo, {
    headers: { 'Content-Type': `${mime}; charset=utf-8`, 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'private, no-store' },
  });
}
