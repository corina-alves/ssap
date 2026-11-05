import { acl } from '@/lib/auth/acl';
import { FONTE_CLIMATOLOGIA, FONTE_TELEMETRIA } from '@/conteudo/climatologia-metodologia';
import { anosPorFonte, climatologias, comparacoesLocais, municipios, normaisLocais, resumoUgrhis, serieRegional } from '@/lib/climatologia/painel';
import { comparar, fonteDoAno, lerSelecao, maisRecente, MESES, MESES_LONGOS, ROTULO_FONTE, ROTULO_TIPO, type ComparacaoLocal } from '@/lib/climatologia/selecao';
import { csv, planilha, type Celula } from '@/lib/climatologia/xlsx';
import { UGRHIS } from '@/lib/hidrologia/situacao-rios';

/**
 * Exportação das tabelas do Painel de Climatologia (CSV ou Excel).
 *   ?tabela=comparacao|resumo_ugrhis|serie|climatologia|municipios|medias_municipios|postos&formato=csv|xlsx + os filtros do painel
 * Mesma permissão da página; só lê dados já processados no banco.
 */
const TABELAS = ['comparacao', 'resumo_ugrhis', 'serie', 'climatologia', 'municipios', 'medias_municipios', 'postos'];

export async function GET(req: Request): Promise<Response> {
  const a = await acl();
  if (!a.podeEmAlguma('visualizar_climatologia')) return new Response('Sem acesso.', { status: 403 });

  const p = Object.fromEntries(new URL(req.url).searchParams);
  const s = lerSelecao(p);
  const tabela = TABELAS.includes(p.tabela ?? '') ? p.tabela! : 'comparacao';
  const formato = p.formato === 'xlsx' ? 'xlsx' : 'csv';

  const fonte = s.fonte ?? fonteDoAno(s.ano, await anosPorFonte());
  const f = { criterio: s.criterio, metodo: s.metodo, periodo: s.periodo, fonte };
  const [serie, serieAcervo] = await Promise.all([serieRegional(f), fonte === 'acervo' ? null : serieRegional({ ...f, fonte: 'acervo' })]);
  const clima = await climatologias(f, serieAcervo ?? serie);
  const recente = maisRecente(serie, s.ugrhi);
  const ano = s.ano ?? recente?.ano ?? new Date().getFullYear();
  const mes = s.mes ?? (s.ano ? 12 : (recente?.mes ?? 12));
  const periodo = `${s.periodo[0]}-${s.periodo[1]}`;
  const metodo = s.metodo === 'thiessen' ? 'Thiessen' : 'Média aritmética';
  const criterio = s.criterio === 'padrao' ? 'padrão' : 'estrito';
  const referencia = (c: ComparacaoLocal) => (c.referencia === 'propria' ? 'própria' : c.referencia === 'municipio' ? 'do município' : 'sem média');

  let linhas: Celula[][];
  let nome: string;
  if (tabela === 'resumo_ugrhis') {
    nome = `chuva-mes-ugrhis-${ano}-${String(mes).padStart(2, '0')}`;
    linhas = [
      ['UGRHI', 'Nome', 'Chuva máxima (mm)', 'Posto da máxima', 'Município da máxima', 'Média mensal (mm)', 'Postos no mês', 'Média histórica mensal (mm)', 'Postos com média histórica', 'Anos da média histórica', 'Até o dia'],
      ...(await resumoUgrhis(f, ano, mes)).map((r) => [
        r.ugrhi, UGRHIS[r.ugrhi] ?? '', r.maxima, r.postoMaxima ? `${r.postoMaxima.prefixo} — ${r.postoMaxima.nome ?? ''}` : null, r.postoMaxima?.municipio ?? null,
        r.media, r.postos, r.historica, r.postosHistorica, r.anosHistorica ? `${r.anosHistorica[0]}–${r.anosHistorica[1]}` : null, r.ateDia,
      ]),
    ];
  } else if (tabela === 'serie') {
    nome = `serie-mensal-ugrhi${s.ugrhi}-${fonte}`;
    linhas = [
      ['UGRHI', 'Ano', 'Mês', 'Chuva (mm)', 'Mês válido', 'Postos', 'Cobertura (%)', 'Média do mês no período (mm)', 'Desvio (%)'],
      ...serie
        .filter((x) => x.ugrhi === s.ugrhi)
        .map((x) => {
          const media = clima.get(x.ugrhi)?.[x.mes]?.media ?? null;
          const desvio = x.valido && x.chuva !== null && media ? Math.round((1000 * x.chuva) / media - 1000) / 10 : null;
          return [x.ugrhi, x.ano, MESES[x.mes - 1]!, x.chuva, x.valido ? 'sim' : 'não', x.postos, x.cobertura, media, desvio];
        }),
    ];
  } else if (tabela === 'climatologia') {
    nome = `climatologia-ugrhis-${periodo}`;
    linhas = [
      ['UGRHI', 'Nome', 'Mês', 'Média (mm)', 'Tipo', 'Anos válidos', 'Mediana (mm)', 'Desvio-padrão (mm)', 'Mínimo (mm)', 'Ano do mínimo', 'Máximo (mm)', 'Ano do máximo', 'Anos usados'],
      ...[...clima].flatMap(([u, est]) =>
        est.map((e, m) => [u, UGRHIS[u] ?? '', m === 0 ? 'Ano' : MESES[m - 1]!, e.media, ROTULO_TIPO[e.tipo], e.anosValidos, e.mediana, e.desvio, e.minimo, e.anoMinimo, e.maximo, e.anoMaximo, e.anos.join(' ')]),
      ),
    ];
  } else if (tabela === 'medias_municipios') {
    const muns = await municipios();
    const normais = await normaisLocais('municipio', muns.map((m) => m.codIbge), f);
    nome = `medias-mensais-municipios-${periodo}`;
    linhas = [
      ['Código IBGE', 'Município', 'UGRHI', ...MESES.map((m) => `${m} (mm)`), 'Ano (mm)', 'Tipo', 'Anos válidos (mín.)'],
      ...muns.map((m) => {
        const est = normais.get(m.codIbge) ?? [];
        const meses = Array.from({ length: 12 }, (_, i) => est[i + 1]);
        const tipo = !meses.every((e) => e?.media !== null && e?.media !== undefined) ? 'incompleta' : meses.every((e) => e!.tipo === 'normal') ? 'normal' : 'média histórica';
        const anos = meses.filter(Boolean).map((e) => e!.anosValidos);
        return [m.codIbge, m.nome, m.ugrhi, ...meses.map((e) => e?.media ?? null), est[0]?.media ?? null, tipo, anos.length ? Math.min(...anos) : 0];
      }),
    ];
  } else if (tabela === 'municipios' || tabela === 'postos') {
    const muns = await municipios();
    const l = await comparacoesLocais(f, { ugrhi: s.ugrhi, mun: s.mun }, ano, mes, s.acumulado, muns);
    const escopo = s.mun ? String(s.mun) : `ugrhi${s.ugrhi}`;
    if (tabela === 'municipios') {
      nome = `municipios-${ano}-${String(mes).padStart(2, '0')}-${s.acumulado}`;
      linhas = [
        ['Código IBGE', 'Município', 'UGRHI', 'Observado (mm)', 'Média histórica (mm)', '% da média', 'Desvio (%)', 'Desvio (mm)', 'Tipo da média', 'Anos válidos (mín.)', 'Postos (mín.)', 'Até o dia'],
        ...l.municipios.map((cod) => {
          const c = l.cmpMunicipios.get(cod)!;
          const m = muns.find((x) => x.codIbge === cod);
          return [cod, m?.nome ?? '', m?.ugrhi ?? null, c.observado, c.climatologia, c.percentual, c.desvio, c.desvioMm, c.climatologia === null ? 'sem média' : ROTULO_TIPO[c.tipo], c.anosClimatologia, c.postos, c.ateDia];
        }),
      ];
    } else {
      nome = `postos-${escopo}-${ano}-${String(mes).padStart(2, '0')}-${s.acumulado}`;
      linhas = [
        ['Id SIBH', 'Prefixo', 'Posto', 'Rede', 'Município', 'Código IBGE', 'UGRHI', 'Latitude', 'Longitude', 'Observado (mm)', 'Média histórica (mm)', 'Média de referência', '% da média', 'Desvio (%)', 'Desvio (mm)', 'Tipo da média', 'Telemetria: primeiro dia', 'Telemetria: último dia'],
        ...l.postos.map((x) => {
          const c = l.cmpPostos.get(x.id)!;
          const per = l.periodos.get(x.id);
          return [x.id, x.prefixo, x.nome, x.dono, x.municipio, x.codIbge, x.ugrhi, x.lat, x.lon, c.observado, c.climatologia, referencia(c), c.percentual, c.desvio, c.desvioMm, c.climatologia === null ? 'sem média' : ROTULO_TIPO[c.tipo], per?.ini ?? null, per?.fim ?? null];
        }),
      ];
    }
  } else {
    nome = `comparacao-ugrhis-${ano}-${String(mes).padStart(2, '0')}-${s.acumulado}`;
    linhas = [
      ['UGRHI', 'Nome', 'Observado (mm)', 'Média histórica (mm)', '% da média', 'Desvio (%)', 'Desvio (mm)', 'Tipo da média', 'Anos válidos (mín.)', 'Postos (mín.)', 'Cobertura (%) (mín.)', 'Cobertura baixa', 'Até o dia'],
      ...comparar(serie, clima, ano, mes, s.acumulado).map((c) => [c.ugrhi, UGRHIS[c.ugrhi] ?? '', c.observado, c.climatologia, c.percentual, c.desvio, c.desvioMm, ROTULO_TIPO[c.tipo], c.anosClimatologia, c.postos, c.cobertura, c.coberturaBaixa ? 'sim' : 'não', c.ateDia]),
    ];
  }
  const ateDia = serie.find((x) => x.ano === ano && x.mes === mes && x.ateDia)?.ateDia ?? null;
  const intervalo =
    (s.acumulado === 'mes' || tabela === 'resumo_ugrhis' ?`${MESES_LONGOS[mes - 1]} de ${ano}` : s.acumulado === 'ytd' ? `janeiro a ${MESES_LONGOS[mes - 1]} de ${ano}` : `ano de ${ano}`) +
    (ateDia ? ` (mês em andamento: chuva de 1º a ${ateDia}/${String(mes).padStart(2, '0')}, comparada com a média do mês inteiro)` : '');
  const rodape: Celula[][] = [
    [],
    tabela === 'resumo_ugrhis'
      ? [`Intervalo: ${intervalo}. Chuva observada: ${ROTULO_FONTE[fonte]}. Chuva máxima: maior acumulado entre os postos da UGRHI com o mês válido; média mensal: soma desses acumulados ÷ número de postos; média histórica mensal: média do mês de cada posto da UGRHI com todos os anos que ele tem no acervo (mínimo 10), somadas ÷ número de postos. Critério de qualidade: ${criterio}.`]
      : [`Intervalo: ${intervalo}. Chuva observada: ${ROTULO_FONTE[fonte]}. Referência: ${periodo}. Média espacial: ${metodo}. Critério de qualidade: ${criterio}.`],
    [`Média histórica: ${FONTE_CLIMATOLOGIA}.${fonte === 'telemetria' ? ` Chuva observada: ${FONTE_TELEMETRIA}.` : ''} Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`],
  ];

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
