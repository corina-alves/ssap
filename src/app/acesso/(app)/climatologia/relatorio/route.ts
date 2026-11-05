import { acl } from '@/lib/auth/acl';
import { anosPorFonte, atualizacao, climatologias, serieRegional } from '@/lib/climatologia/painel';
import { gerarRelatorio } from '@/lib/climatologia/relatorio-pdf';
import { comparar, fonteDoAno, lerSelecao, maisRecente, parametros } from '@/lib/climatologia/selecao';
import { enderecoPublico } from '@/lib/requisicao';

/** Relatório em PDF do Painel de Climatologia (mesmos filtros e mesma permissão da página). */
export async function GET(req: Request): Promise<Response> {
  const a = await acl();
  if (!a.podeEmAlguma('visualizar_climatologia')) return new Response('Sem acesso.', { status: 403 });

  const s = lerSelecao(Object.fromEntries(new URL(req.url).searchParams));
  const fonte = s.fonte ?? fonteDoAno(s.ano, await anosPorFonte());
  const [serie, serieAcervo, at] = await Promise.all([serieRegional({ ...s, fonte }), serieRegional({ ...s, fonte: 'acervo' }), atualizacao()]);
  if (!serieAcervo.length) return new Response('Ainda não há dados processados.', { status: 404 });
  const clima = await climatologias(s, serieAcervo);
  const recente = maisRecente(serie, s.ugrhi);
  const ano = s.ano ?? recente?.ano ?? Math.max(...serieAcervo.map((p) => p.ano));
  const mes = s.mes ?? (s.ano ? 12 : (recente?.mes ?? 12));
  const sel = { ...s, ano, mes };
  const comparacao = comparar(serie, clima, ano, mes, s.acumulado);
  const doAno = (m: number) => serie.find((p) => p.ugrhi === s.ugrhi && p.ano === ano && p.mes === m);

  const pdf = await gerarRelatorio({
    s: sel,
    fonte,
    atual: comparacao.find((c) => c.ugrhi === s.ugrhi)!,
    comparacao,
    est: clima.get(s.ugrhi) ?? [],
    observadoMeses: Array.from({ length: 12 }, (_, i) => (doAno(i + 1)?.valido ? doAno(i + 1)!.chuva : null)),
    atualizacao: at,
    endereco: `${enderecoPublico(req)}/acesso/climatologia?${parametros(sel)}`,
  });
  const nome = `climatologia-ugrhi${s.ugrhi}-${ano}-${String(mes).padStart(2, '0')}-${s.acumulado}.pdf`;
  return new Response(pdf as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nome}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
