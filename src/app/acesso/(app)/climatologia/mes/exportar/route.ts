import { acl } from '@/lib/auth/acl';
import { FONTE_CLIMATOLOGIA, FONTE_TELEMETRIA } from '@/conteudo/climatologia-metodologia';
import { chuvaDoMes, INICIO_HISTORICO, mesesDisponiveis, type Escala } from '@/lib/climatologia/chuva-mes';
import { municipios } from '@/lib/climatologia/painel';
import { anoAtual, MESES_LONGOS, rotuloAnos } from '@/lib/climatologia/selecao';
import { csv, planilha, type Celula } from '@/lib/climatologia/xlsx';
import { UGRHIS } from '@/lib/hidrologia/situacao-rios';

/**
 * Exportação da aba "Chuva do mês" (CSV ou Excel).
 *   ?escala=ugrhi|municipio&ano=AAAA&mes=M&formato=csv|xlsx
 * Mesma permissão da página; só lê dados já processados no banco.
 */
export async function GET(req: Request): Promise<Response> {
  const a = await acl();
  if (!a.podeEmAlguma('visualizar_climatologia')) return new Response('Sem acesso.', { status: 403 });

  const p = new URL(req.url).searchParams;
  const escala: Escala = p.get('escala') === 'municipio' ? 'municipio' : 'ugrhi';
  const formato = p.get('formato') === 'xlsx' ? 'xlsx' : 'csv';
  const inteiro = (v: string | null, min: number, max: number) => {
    const n = Number(v);
    return v !== null && Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const recente = (await mesesDisponiveis()).recente;
  const ano = inteiro(p.get('ano'), INICIO_HISTORICO, 2100) ?? recente?.ano ?? anoAtual();
  const mes = inteiro(p.get('mes'), 1, 12) ?? recente?.mes ?? 1;

  const dados = await chuvaDoMes(escala, ano, mes);
  const muns = escala === 'municipio' ? await municipios() : [];
  const areas: [number, string, number | null][] =
    escala === 'ugrhi' ? Object.entries(UGRHIS).map(([u, nome]) => [Number(u), nome, null]) : muns.map((m) => [m.codIbge, m.nome, m.ugrhi]);

  const cabecalho: Celula[] = [
    ...(escala === 'ugrhi' ? ['UGRHI', 'Nome'] : ['Código IBGE', 'Município', 'UGRHI']),
    'Acumulado do mês (mm)', 'Chuva máxima (mm)', 'Posto da máxima', 'Município da máxima', 'Média histórica (mm)', '% da média', 'Postos no mês', 'Anos na média', 'Anos usados', 'Até o dia',
  ];
  const linhas: Celula[][] = [
    cabecalho,
    ...areas.map(([codigo, nome, ugrhi]) => {
      const l = dados.get(codigo);
      const pm = l?.postoMaxima;
      return [
        codigo, nome, ...(escala === 'municipio' ? [ugrhi] : []),
        l?.acumulado ?? null, l?.maxima ?? null, pm ? `${pm.prefixo} — ${pm.nome ?? ''}` : null, pm?.municipio ?? null,
        l?.historica ?? null, l?.percentual ?? null, l?.postos ?? 0, l?.anos.length ?? 0, l?.anos.length ? rotuloAnos(l.anos) : null, l?.ateDia ?? null,
      ];
    }),
  ];
  const ateDia = Math.max(0, ...[...dados.values()].map((l) => l.ateDia ?? 0)) || null;
  const nomeMes = MESES_LONGOS[mes - 1]!;
  const rodape: Celula[][] = [
    [],
    [`${nomeMes} de ${ano}${ateDia ? ` — mês em andamento: acumulado de 1º a ${ateDia}/${String(mes).padStart(2, '0')}, comparado com a média do mês inteiro` : ''}.`],
    [`Acumulado do mês: soma da chuva do mês dos postos com o mês completo ÷ número de postos. Chuva máxima: o maior acumulado entre esses postos. Média histórica: a mesma conta para ${nomeMes} de cada ano de ${INICIO_HISTORICO} até hoje com dado, e a média desses anos (sem mínimo de anos; não entram o próprio mês avaliado nem o mês em andamento).`],
    [`Dados: ${FONTE_CLIMATOLOGIA}; ${FONTE_TELEMETRIA}. Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`],
  ];
  const nome = `chuva-${escala === 'ugrhi' ? 'ugrhis' : 'municipios'}-${ano}-${String(mes).padStart(2, '0')}`;

  const cabecalhos = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (formato === 'xlsx') {
    return new Response(planilha(nome, [...linhas, ...rodape]) as unknown as BodyInit, {
      headers: { ...cabecalhos, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nome}.xlsx"` },
    });
  }
  return new Response(csv([...linhas, ...rodape]), {
    headers: { ...cabecalhos, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}.csv"` },
  });
}
