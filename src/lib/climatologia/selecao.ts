import { CRITERIOS, METODOS, PERIODO_PADRAO, type Criterio, type Estatistica, type Metodo, type TipoMedia } from './regras';

/**
 * Seleção do painel (filtros da URL) e comparação observado × climatologia —
 * pura, para a página, a exportação e o relatório usarem a mesma conta.
 *
 * Período acumulado: "mes" (o mês), "ytd" (janeiro até o mês) ou "ano" (o ano
 * todo). A climatologia comparada é sempre a do MESMO intervalo (soma das
 * médias dos mesmos meses), nunca a de um intervalo maior.
 */

export type Acumulado = 'mes' | 'ytd' | 'ano';
export const ACUMULADOS: Record<Acumulado, string> = { mes: 'Mês', ytd: 'Acumulado no ano (jan. até o mês)', ano: 'Ano completo' };
/** Ano de hoje em Brasília: fim do período "2010 até hoje". */
export const anoAtual = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }));
/** Início do período recente (2010 até hoje): a média só usa os anos que o acervo tem. */
export const INICIO_RECENTE = 2010;
/** Períodos de referência do painel: chave da URL → anos. O recente vai até o ano corrente. */
export function periodosReferencia(): Record<string, [number, number]> {
  return {
    '1991-2020': PERIODO_PADRAO,
    '2010-atual': [INICIO_RECENTE, anoAtual()],
    '1981-2010': [1981, 2010],
    '1961-1990': [1961, 1990],
  };
}
/**
 * Todo o acervo, de antes do primeiro ano com dado (1888) até hoje: cada posto usa
 * todos os anos que tem. É a média histórica mensal da tabela no formato do boletim.
 */
export const periodoTodoAcervo = (): [number, number] => [1800, anoAtual()];
/** "10 anos: 2015–2023, 2025" — anos seguidos viram intervalo. */
export function rotuloAnos(anos: readonly number[]): string {
  if (!anos.length) return 'sem anos com dado';
  const faixas: string[] = [];
  let ini = anos[0]!;
  for (let i = 1; i <= anos.length; i++) {
    if (i < anos.length && anos[i] === anos[i - 1]! + 1) continue;
    const fim = anos[i - 1]!;
    faixas.push(ini === fim ? String(ini) : `${ini}–${fim}`);
    ini = anos[i]!;
  }
  return `${anos.length} ${anos.length === 1 ? 'ano' : 'anos'}: ${faixas.join(', ')}`;
}
/** Rótulo do período para os filtros. */
export function rotuloReferencia(chave: string, periodo: readonly [number, number]): string {
  const anos = `${periodo[0]}–${periodo[1]}`;
  return chave === '1991-2020' ? `${anos} (normal OMM)` : chave === '2010-atual' ? `${anos} (2010 até hoje)` : anos;
}
export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** De onde vem a chuva observada. A climatologia vem sempre do acervo (a telemetria não tem série longa). */
export type Fonte = 'acervo' | 'telemetria';
export const ROTULO_FONTE: Record<Fonte, string> = { acervo: 'acervo histórico (pluviômetros convencionais)', telemetria: 'rede telemétrica (SIBH, API v2)' };

export type Selecao = {
  ugrhi: number;
  ano: number | null; // null = o mais recente com dado
  mes: number | null;
  acumulado: Acumulado;
  referencia: string;
  periodo: [number, number];
  criterio: Criterio;
  metodo: Metodo;
  fonte: Fonte | null; // null = automática (fonteDoAno)
  mun: number | null; // código IBGE do município em foco
  posto: number | null; // posto em foco
};

const inteiro = (v: string | undefined, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Filtros da URL → seleção válida (valor inválido volta ao padrão). */
export function lerSelecao(p: Record<string, string | undefined>): Selecao {
  const periodos = periodosReferencia();
  const referencia = p.ref && p.ref in periodos ? p.ref : '1991-2020';
  return {
    ugrhi: inteiro(p.u, 1, 22) ?? 6,
    ano: inteiro(p.ano, 1800, 2100),
    mes: inteiro(p.mes, 1, 12),
    acumulado: p.acum === 'ytd' || p.acum === 'ano' ? p.acum : 'mes',
    referencia,
    periodo: periodos[referencia]!,
    criterio: CRITERIOS.includes(p.crit as Criterio) ? (p.crit as Criterio) : 'padrao',
    metodo: METODOS.includes(p.met as Metodo) ? (p.met as Metodo) : 'aritmetica', // soma dos postos ÷ número de postos
    fonte: p.fonte === 'acervo' || p.fonte === 'telemetria' ? p.fonte : null,
    mun: inteiro(p.mun, 1_100_000, 5_399_999),
    posto: inteiro(p.posto, 1, 99_999_999),
  };
}

/** Seleção → parâmetros da URL (para links do mapa, exportação e relatório). */
export function parametros(s: Selecao, mudar: Partial<Selecao> = {}): string {
  const x = { ...s, ...mudar };
  const q = new URLSearchParams({ u: String(x.ugrhi), acum: x.acumulado, ref: x.referencia, crit: x.criterio, met: x.metodo });
  if (x.ano) q.set('ano', String(x.ano));
  if (x.mes) q.set('mes', String(x.mes));
  if (x.fonte) q.set('fonte', x.fonte);
  if (x.mun) q.set('mun', String(x.mun));
  if (x.posto) q.set('posto', String(x.posto));
  return q.toString();
}

/**
 * Fonte automática da chuva observada: o acervo nos anos em que ele tem algum
 * mês válido de UGRHI; depois, a telemetria. Sem ano escolhido, a mais recente.
 */
export function fonteDoAno(ano: number | null, anos: Record<Fonte, readonly number[]>): Fonte {
  if (ano === null) return anos.telemetria.length ? 'telemetria' : 'acervo';
  if (anos.acervo.includes(ano)) return 'acervo';
  return anos.telemetria.includes(ano) ? 'telemetria' : 'acervo';
}

export const mesesDoAcumulado = (acumulado: Acumulado, mes: number) => (acumulado === 'mes' ? [mes] : acumulado === 'ytd' ? Array.from({ length: mes }, (_, i) => i + 1) : Array.from({ length: 12 }, (_, i) => i + 1));

/** ateDia: mês em andamento, chuva do dia 1 até esse dia (null = mês inteiro). */
export type PontoMes = { ugrhi: number; ano: number; mes: number; chuva: number | null; valido: boolean; postos: number; cobertura: number; ateDia?: number | null };

export type Comparacao = {
  ugrhi: number;
  observado: number | null;
  climatologia: number | null;
  tipo: TipoMedia;
  /** Menor número de anos válidos entre os meses do intervalo. */
  anosClimatologia: number;
  percentual: number | null;
  desvio: number | null;
  desvioMm: number | null;
  postos: number | null;
  cobertura: number | null;
  /** O último mês do intervalo está em andamento: observado do dia 1 até este dia (a climatologia é a do mês inteiro). */
  ateDia: number | null;
  /** Algum mês do intervalo tem cobertura abaixo do mínimo: o observado é a média dos poucos postos que há, e pode não representar a UGRHI. */
  coberturaBaixa: boolean;
};

const ORDEM_TIPO: TipoMedia[] = ['normal', 'media_historica', 'insuficiente'];
const r1 = (v: number) => Math.round(v * 10) / 10;

type Intervalo = Omit<Comparacao, 'ugrhi' | 'postos' | 'cobertura' | 'coberturaBaixa'>;

/**
 * A conta de um intervalo: observado = soma dos meses (só se todos são válidos);
 * climatologia = soma das médias dos mesmos meses (só se todos têm média); tipo =
 * o pior entre os meses; % = observado ÷ climatologia × 100; desvio = % − 100.
 * Mês em andamento: o observado vai até o último dia encerrado (`ateDia`) e é
 * comparado com a média do mês inteiro — fica indicado.
 */
export function compararIntervalo(pontos: readonly ({ chuva: number | null; valido: boolean; ateDia?: number | null } | undefined)[], doIntervalo: readonly (Estatistica | undefined)[]): Intervalo {
  const completo = pontos.length > 0 && pontos.every((p) => p?.valido && p.chuva !== null);
  const observado = completo ? r1(pontos.reduce((s, p) => s + p!.chuva!, 0)) : null;
  const temClima = doIntervalo.every((e) => e && e.media !== null);
  const climatologia = temClima ? r1(doIntervalo.reduce((s, e) => s + e!.media!, 0)) : null;
  const tipo = doIntervalo.reduce<TipoMedia>((pior, e) => (ORDEM_TIPO.indexOf(e?.tipo ?? 'insuficiente') > ORDEM_TIPO.indexOf(pior) ? (e?.tipo ?? 'insuficiente') : pior), 'normal');
  const percentual = observado !== null && climatologia ? r1((100 * observado) / climatologia) : null;
  return {
    observado,
    climatologia,
    tipo,
    anosClimatologia: Math.min(...doIntervalo.map((e) => e?.anosValidos ?? 0)),
    percentual,
    desvio: percentual === null ? null : r1(percentual - 100),
    desvioMm: observado !== null && climatologia !== null ? r1(observado - climatologia) : null,
    ateDia: pontos.find((p) => p?.ateDia)?.ateDia ?? null,
  };
}

/**
 * Observado × climatologia de cada UGRHI no intervalo escolhido. Observado só com
 * chuva em todos os meses do intervalo (média dos postos com o mês válido); mês
 * com cobertura abaixo do mínimo entra, marcado (`coberturaBaixa`) — a
 * climatologia, essa sim, só usa meses com a cobertura mínima.
 */
export function comparar(serie: readonly PontoMes[], clima: Map<number, Estatistica[]>, ano: number, mes: number, acumulado: Acumulado): Comparacao[] {
  const meses = mesesDoAcumulado(acumulado, mes);
  const chave = new Map(serie.filter((p) => p.ano === ano).map((p) => [`${p.ugrhi}:${p.mes}`, p]));
  return Array.from({ length: 22 }, (_, i) => i + 1).map((u) => {
    const pontos = meses.map((m) => chave.get(`${u}:${m}`));
    const est = clima.get(u);
    const comDado = pontos.filter((p): p is PontoMes => !!p);
    const r = compararIntervalo(pontos.map((p) => p && { ...p, valido: p.chuva !== null }), meses.map((m) => est?.[m]));
    return {
      ugrhi: u,
      ...r,
      postos: comDado.length ? Math.min(...comDado.map((p) => p.postos)) : null,
      cobertura: comDado.length ? Math.min(...comDado.map((p) => p.cobertura)) : null,
      coberturaBaixa: r.observado !== null && comDado.some((p) => !p.valido),
    };
  });
}

/** Um mês observado num posto (total do posto) ou num município (média dos postos dele com o mês válido). */
export type MesLocal = { mes: number; chuva: number | null; valido: boolean; postos: number; ateDia?: number | null };

export type ComparacaoLocal = Intervalo & {
  codigo: number;
  /** Menor número de postos entre os meses (município) ou 1 (posto). */
  postos: number | null;
  /** De onde vem a climatologia: do próprio posto/município ou, para um posto sem série no acervo, do município dele. */
  referencia: 'propria' | 'municipio' | null;
};

/**
 * Observado × climatologia de postos ou municípios no intervalo — a mesma conta
 * das UGRHIs. `reserva`: climatologia usada quando o código não tem a própria
 * (posto telemétrico → média do município dele, no acervo).
 */
export function compararLocal(
  codigos: readonly number[],
  meses: ReadonlyMap<number, readonly MesLocal[]>,
  clima: ReadonlyMap<number, Estatistica[]>,
  mes: number,
  acumulado: Acumulado,
  reserva: (codigo: number) => Estatistica[] | undefined = () => undefined,
): ComparacaoLocal[] {
  const lista = mesesDoAcumulado(acumulado, mes);
  return codigos.map((codigo) => {
    const doCodigo = new Map((meses.get(codigo) ?? []).map((m) => [m.mes, m]));
    const pontos = lista.map((m) => doCodigo.get(m));
    const tem = (est: Estatistica[] | undefined) => !!est && lista.every((m) => est[m]?.media !== null && est[m]?.media !== undefined);
    const propria = clima.get(codigo);
    const outra = tem(propria) ? undefined : reserva(codigo);
    const referencia = tem(propria) ? 'propria' : tem(outra) ? 'municipio' : null;
    const est = referencia === 'municipio' ? outra : propria;
    const comDado = pontos.filter((p): p is MesLocal => !!p);
    return { codigo, ...compararIntervalo(pontos, lista.map((m) => est?.[m])), postos: comDado.length ? Math.min(...comDado.map((p) => p.postos)) : null, referencia };
  });
}

/** Ano e mês mais recentes com o mês válido na UGRHI (padrão do painel). */
export function maisRecente(serie: readonly PontoMes[], ugrhi: number): { ano: number; mes: number } | null {
  let melhor: PontoMes | null = null;
  for (const p of serie) if (p.ugrhi === ugrhi && p.valido && (!melhor || p.ano * 12 + p.mes > melhor.ano * 12 + melhor.mes)) melhor = p;
  return melhor ? { ano: melhor.ano, mes: melhor.mes } : null;
}

/** Faixa do desvio em palavras. */
export function faixaDesvio(desvio: number | null): string {
  if (desvio === null) return 'sem dado';
  if (desvio <= -30) return 'muito abaixo da média';
  if (desvio <= -10) return 'abaixo da média';
  if (desvio < 10) return 'próximo da média';
  if (desvio < 30) return 'acima da média';
  return 'muito acima da média';
}

/** Cor divergente do desvio (%): seco em laranja-terra, chuvoso em azul, sem dado em cinza. */
export function corDesvio(desvio: number | null): string {
  if (desvio === null) return '#d5dbe0';
  const t = Math.max(-1, Math.min(1, desvio / 60));
  const [a, b] = t < 0 ? [[247, 247, 247], [179, 88, 6]] : [[247, 247, 247], [33, 102, 172]];
  const k = Math.abs(t);
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * k));
  return `rgb(${c.join(',')})`;
}

export const ROTULO_TIPO: Record<TipoMedia, string> = { normal: 'Normal climatológica', media_historica: 'Média histórica do período disponível', insuficiente: 'Sem dados suficientes' };
