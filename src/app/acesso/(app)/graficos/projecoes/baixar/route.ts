import { salaPorSlug } from '@/lib/acesso/api';
import { acl } from '@/lib/auth/acl';
import { usuarioAtual } from '@/lib/auth/sessao';
import { lerCsv, resumo, SISTEMAS } from '@/lib/hidrologia/projecoes';
import { csvRodada } from '@/lib/hidrologia/projecoes-rodadas';

/** CSV consolidado da rodada (tipo=csv) ou resumo da marcação da GDN (tipo=txt), para quem vê os gráficos da sala. */
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

  const base = `projecao_${sistema}_${rodada.slice(7, 22)}`;
  const [corpo, mime, nome] =
    tipo === 'csv'
      ? [`﻿${csv}`, 'text/csv', `${base}_dados_consolidados.csv`]
      : [`﻿${resumo(sistema, lerCsv(csv, rodada))}`, 'text/plain', `${base}_resumo_marcacao_GDN.txt`];
  return new Response(corpo, {
    headers: { 'Content-Type': `${mime}; charset=utf-8`, 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'private, no-store' },
  });
}
