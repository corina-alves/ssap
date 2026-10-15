import {
  acumular,
  agregar,
  MESES,
  mltMensal,
  PERIODOS,
  PRIMEIRO_ANO,
  resumoPeriodo,
  rotuloAno,
  serieMensal,
  SISTEMAS,
  valoresPeriodo,
  VARIAVEIS,
  type Periodo,
  type VariavelMlt,
} from './analise-mlt';

/**
 * "Criar gráfico com MLT" (porte de graficos/criar-mlt.php): série mensal de um
 * sistema produtor comparada à MLT, por período. Três formatos: mês a mês,
 * acumulado no período e comparação ano a ano.
 *
 * A mesma função serve para mostrar e para salvar: ao salvar, o gráfico é
 * montado de novo no servidor a partir dos parâmetros, nunca de dados vindos
 * do navegador.
 */

export const FORMATOS = {
  mensal: 'Mês a mês no período',
  acumulado: 'Acumulado no período',
  anual: 'Ano a ano (valor do período × MLT)',
} as const;
export type Formato = keyof typeof FORMATOS;

export type Parametros = Record<string, string | undefined>;
type Resumo = ReturnType<typeof resumoPeriodo>;

const num = (v: number | null | undefined, casas = 1) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const arred2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

export async function graficoMlt(p: Parametros, anoAtual: number) {
  const sistema = SISTEMAS[p.sistema ?? ''] ? p.sistema! : 'cantareira';
  const variavel = (Object.hasOwn(VARIAVEIS, p.variavel ?? '') ? p.variavel : 'chuva') as VariavelMlt;
  const periodo = (Object.hasOwn(PERIODOS, p.periodo ?? '') ? p.periodo : 'chuvoso') as Periodo;
  const { rotulo: nomeVar, agregacao, unidade } = VARIAVEIS[variavel];
  let formato = (Object.hasOwn(FORMATOS, p.formato ?? '') ? p.formato : 'mensal') as Formato;
  if (formato === 'acumulado' && agregacao !== 'soma') formato = 'mensal'; // acumular só faz sentido para chuva

  const ano = (k: string): number | null => {
    const v = p[k] ?? '';
    return /^\d{4}$/.test(v) && Number(v) >= PRIMEIRO_ANO && Number(v) <= anoAtual ? Number(v) : null;
  };
  const mesesPeriodo = PERIODOS[periodo].meses;
  const rotulosMeses = mesesPeriodo.map((m) => MESES[m - 1]!);
  const base = { sistema, variavel, periodo, formato, nomeVar, agregacao, unidade, nomeSistema: SISTEMAS[sistema]!.nome, nomePeriodo: PERIODOS[periodo].rotulo, rotulosMeses };

  const s = await serieMensal(sistema, variavel);
  const { porAno } = s;
  // Último período com algum dado
  let ultimoY = s.fim;
  while (ultimoY > s.inicio && !valoresPeriodo(porAno, periodo, ultimoY).some((v) => v !== null)) ultimoY--;

  const mltDe = ano('mlt_de') ?? s.inicio;
  const mltAte = ano('mlt_ate') ?? s.fim;
  const { mlt } = mltMensal(porAno, mltDe, mltAte);
  const mltPeriodo = mesesPeriodo.map((m) => arred2(mlt[m - 1] ?? null));
  const mltCheio = agregar(mesesPeriodo.map((m) => mlt[m - 1]), agregacao);
  const nomeMlt = `MLT (${mltDe}–${mltAte})`;
  const titulo = `${nomeVar} — ${base.nomeSistema} — ${base.nomePeriodo.toLocaleLowerCase('pt-BR')} × MLT`;
  const comum = { ...base, mltDe, mltAte, nomeMlt, titulo, mltCheio };

  if (formato === 'anual') {
    let de = ano('de') ?? Math.max(s.inicio, ultimoY - 19);
    let ate = Math.min(ano('ate') ?? ultimoY, ultimoY);
    if (de > ate) [de, ate] = [ate, de];
    const linhas: { y: number; r: Resumo }[] = [];
    for (let y = de; y <= ate; y++) linhas.push({ y, r: resumoPeriodo(porAno, mlt, periodo, y, agregacao) });

    const ult = linhas[linhas.length - 1]!;
    const kpis: [string, string, string][] = [
      ['bi-calendar3', `${num(ult.r.valor)} ${unidade}`, rotuloAno(periodo, ate) + (ult.r.completo ? '' : ' (em andamento)')],
      ['bi-percent', `${num(ult.r.pct, 0)}%`, `da MLT em ${rotuloAno(periodo, ate)}`],
    ];
    const comPct = linhas.filter((l) => l.r.pct !== null && l.r.completo).sort((a, b) => a.r.pct! - b.r.pct!);
    if (comPct.length) {
      const menor = comPct[0]!;
      const maior = comPct[comPct.length - 1]!;
      kpis.push(['bi-arrow-down', `${num(menor.r.pct, 0)}%`, `menor: ${rotuloAno(periodo, menor.y)}`]);
      kpis.push(['bi-arrow-up', `${num(maior.r.pct, 0)}%`, `maior: ${rotuloAno(periodo, maior.y)}`]);
    }
    return {
      ...comum,
      de,
      ate,
      anos: [] as number[],
      kpis,
      grafico: {
        tipo: 'barra', unidade, eixo_y: nomeVar as string, empilhado: false,
        rotulos: linhas.map((l) => rotuloAno(periodo, l.y) + (l.r.completo ? '' : '*')),
        series: [
          { nome: `${nomeVar} no período`, valores: linhas.map((l) => arred2(l.r.valor)) },
          { nome: nomeMlt, valores: linhas.map(() => arred2(mltCheio)) },
        ],
      },
      tabela: { tipo: 'anual' as const, linhas },
    };
  }

  let anos = [1, 2, 3, 4].map((i) => ano(`ano${i}`)).filter((a): a is number => a !== null);
  if (!anos.length && p.ano1 === undefined) {
    // padrão: os dois últimos e o da crise (2013/14 nos períodos que começam em outubro)
    anos = [ultimoY, ultimoY - 1, periodo === 'chuvoso' || periodo === 'hidrologico' ? 2013 : 2014].filter((a) => a >= s.inicio);
  }
  anos = [...new Set(anos)];
  const acum = formato === 'acumulado';
  const valoresAno = anos.map((y) => ({ y, valores: valoresPeriodo(porAno, periodo, y).map(arred2) }));
  const resAtual = resumoPeriodo(porAno, mlt, periodo, ultimoY, agregacao);
  return {
    ...comum,
    de: null,
    ate: null,
    anos,
    kpis: [
      ['bi-calendar3', `${num(resAtual.valor)} ${unidade}`, `${agregacao === 'soma' ? 'total' : 'média'} em ${rotuloAno(periodo, ultimoY)}${resAtual.completo ? '' : ' (em andamento)'}`],
      ['bi-percent', `${num(resAtual.pct, 0)}%`, 'da MLT dos mesmos meses'],
      ['bi-graph-up', `${num(mltCheio)} ${unidade}`, 'MLT do período inteiro'],
      ['bi-clock-history', `${mltDe}–${mltAte}`, 'base da MLT'],
    ] as [string, string, string][],
    grafico: {
      tipo: 'linha', unidade, eixo_y: nomeVar + (acum ? ' acumulada' : ''), empilhado: false,
      rotulos: rotulosMeses,
      series: [
        { nome: nomeMlt + (acum ? ' acumulada' : ''), valores: acum ? acumular(mltPeriodo) : mltPeriodo },
        ...valoresAno.map(({ y, valores }) => ({ nome: rotuloAno(periodo, y), valores: acum ? acumular(valores) : valores })),
      ],
    },
    tabela: {
      tipo: 'mensal' as const,
      mlt: mltPeriodo,
      anos: valoresAno.map(({ y, valores }) => ({ y, valores, resumo: resumoPeriodo(porAno, mlt, periodo, y, agregacao) })),
    },
  };
}

export type GraficoMlt = Awaited<ReturnType<typeof graficoMlt>>;
