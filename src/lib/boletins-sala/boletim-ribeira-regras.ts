import type { EstacaoRibeira } from '@/conteudo/boletim-ribeira';
import { arred } from '../integracoes/http';
import { instante, type Cotas, type Medicao } from '../integracoes/sibh-medicoes';
import { classificar, SITUACOES, type Situacao } from './sumario-automatico-tp';

/**
 * Regras do Boletim Executivo Público — Vale do Ribeira, sem acesso a rede ou
 * banco (testadas em tests/boletim-ribeira.test.ts). Segue o Sumário Executivo
 * que a Sala emite (sumarios_cheias/ribeira_iguape), com o período FECHADO em
 * 24 h: Referência 1 = 07h do dia anterior, Referência 2 = 07h do dia.
 *   situação   nível das 07h × cotas de referência do SIBH (a cota entra na faixa)
 *   variação   nível das 07h − nível das 07h do dia anterior
 *   tendência  sinal da variação arredondada a 2 casas (0,00 = estável)
 *   acima      nível das 07h − cota de extravasamento, só em extravasamento
 * Os textos são os modelos do sumário emitido, preenchidos com os números.
 */

export { SITUACOES, type Situacao };

const HORA = 3_600_000;
/** Leitura das 07h: a mais próxima das 07h, até 30 min antes ou depois. */
export const TOLERANCIA_07H = 30 * 60_000;
/** Leitura atual: a mais recente das últimas 12 h (o limite do sumário tradicional). */
export const LIMITE_ATUAL = 12 * HORA;
/** Leitura atual mais velha que isto sai marcada como atrasada. */
export const ATRASO = HORA;

// ---------------------------------------------------------------- formatação

const FUSO = 'America/Sao_Paulo';
const fmtPartes = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function partes(ms: number): Record<string, string> {
  return Object.fromEntries(fmtPartes.formatToParts(ms).map((p) => [p.type, p.value]));
}
/** 15h50 (Brasília) */
export const horaH = (ms: number) => {
  const p = partes(ms);
  return `${p.hour}h${p.minute}`;
};
/** 28/10 */
export const diaMes = (ms: number) => {
  const p = partes(ms);
  return `${p.day}/${p.month}`;
};
/** 07h (só a hora, como nos cabeçalhos do sumário emitido); 13h20 fora da hora cheia */
export const hora = (ms: number) => {
  const p = partes(ms);
  return `${p.hour}h${p.minute === '00' ? '' : p.minute}`;
};
/** 29/10/2026 - 07:00 (cabeçalho do sumário emitido) */
export const dataHoraCab = (ms: number) => {
  const p = partes(ms);
  return `${p.day}/${p.month}/${p.year} - ${p.hour}:${p.minute}`;
};
/** "07h/28/10 a 07h/29/10": o período do boletim */
export const periodo = (ini: number, fim: number) => `${hora(ini)}/${diaMes(ini)} a ${hora(fim)}/${diaMes(fim)}`;
/** 28/10/2026, 15h50 */
export const dataHoraH = (ms: number) => {
  const p = partes(ms);
  return `${p.day}/${p.month}/${p.year}, ${p.hour}h${p.minute}`;
};

export const fmt = (n: number | null | undefined, casas = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const fmtSinal = (n: number | null | undefined, casas = 2) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${fmt(n, casas)}`);

/** "a", "a e b", "a, b e c" */
export const lista = (itens: string[]) => (itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ---------------------------------------------------------------- leituras

export type Leitura = { nivel: number; em: number; vazao: number | null };

/** Série de um posto em ordem de tempo: nível em m (value em cm) e vazão (read_value, m³/s). */
export function serieDoPosto(med: Medicao[] | null, id: number): Leitura[] {
  const s = String(id);
  return (med ?? [])
    .flatMap(([i, d, v, q]) => (i === s && v !== null ? [{ nivel: arred(v / 100, 3), em: instante(d), vazao: q }] : []))
    .sort((a, b) => a.em - b.em);
}

/** Leitura mais próxima do instante alvo, dentro da tolerância. */
export function maisProxima(serie: Leitura[], alvo: number, tolerancia: number): Leitura | null {
  let melhor: Leitura | null = null;
  for (const l of serie) {
    const d = Math.abs(l.em - alvo);
    if (d <= tolerancia && (!melhor || d < Math.abs(melhor.em - alvo))) melhor = l;
  }
  return melhor;
}

/** Leitura mais recente até `agora`, se não for mais velha que `limite`. */
export function ultima(serie: Leitura[], agora: number, limite = LIMITE_ATUAL): Leitura | null {
  const l = serie.findLast((x) => x.em <= agora);
  return l && agora - l.em <= limite ? l : null;
}

// "|| 0": sem −0 (que sairia como "-0,00")
export const dif = (a: number | null, b: number | null, casas = 2) => (a === null || b === null ? null : arred(a - b, casas) || 0);

// ---------------------------------------------------------------- tendência e situação

export type Tendencia = 'subida' | 'queda' | 'estavel';
export const TEXTO_TENDENCIA: Record<Tendencia, string> = { subida: 'Subida', queda: 'Queda', estavel: 'Estável' };

/** Pelo valor já arredondado a 2 casas (o que aparece na tela): 0,00 é estável; 0,01 já conta. */
export function tendencia(variacao: number | null): Tendencia | null {
  if (variacao === null || !Number.isFinite(variacao)) return null;
  const v = Math.round(variacao * 100) / 100;
  return v > 0 ? 'subida' : v < 0 ? 'queda' : 'estavel';
}

export const temCotas = (c: Cotas | null): c is Cotas =>
  !!c && (c.atencao !== null || c.alerta !== null || c.emergencia !== null || c.extravasamento !== null);

/** Desde quando o posto está na situação atual: o instante da entrada, ou "antes do início da série". */
export type Desde = { em: number } | { antesDe: number };

/**
 * Procura, de trás para frente, a última mudança de situação: devolve a
 * primeira leitura já na situação atual. Se a série inteira está na mesma
 * situação, a entrada foi antes do início dela (o sumário tradicional mostrava
 * "[PREENCHER]"; aqui o texto diz "desde antes de").
 */
export function inicioDaSituacao(serie: Leitura[], cotas: Cotas, situacao: Situacao): Desde | null {
  if (!serie.length) return null;
  let inicio = serie.at(-1)!;
  for (let i = serie.length - 1; i >= 0; i--) {
    if (classificar(serie[i]!.nivel, cotas) !== situacao) return { em: inicio.em };
    inicio = serie[i]!;
  }
  return { antesDe: serie[0]!.em };
}

/** Fora do extravasamento agora, mas esteve nele nas últimas 24 h: instante da primeira leitura fora. */
export function saidaDoExtravasamento(serie: Leitura[], cotas: Cotas, situacao: Situacao, agora: number): number | null {
  if (situacao === 'EXTRAVASAMENTO') return null;
  for (let i = serie.length - 1; i >= 0; i--) {
    if (serie[i]!.em < agora - 24 * HORA) break;
    if (classificar(serie[i]!.nivel, cotas) === 'EXTRAVASAMENTO') return (serie[i + 1] ?? serie[i])!.em;
  }
  return null;
}

// ---------------------------------------------------------------- pontos

export type PontoRibeira = EstacaoRibeira & {
  cotas: Cotas | null;
  /** nível na Referência 1 (07h do dia anterior) */
  nivel07: number | null;
  nivel07Em: number | null;
  /** nível na Referência 2 (07h do dia; a leitura mais recente até as 07h) */
  atual: number | null;
  atualEm: number | null;
  /** Referência 2 − Referência 1 (m) */
  variacao: number | null;
  /** Referência 2 − cota de extravasamento (m) */
  acima: number | null;
  situacao: Situacao;
  tendencia: Tendencia | null;
  /** sem leitura nas 12 h antes da Referência 2 */
  semDado: boolean;
  /** sem cotas de referência no SIBH: situação não classificada */
  semCotas: boolean;
  /** leitura usada com mais de 1 h antes da Referência 2 */
  atrasado: boolean;
  desde: Desde | null;
  saiuEm: number | null;
};

type Guardado = { nivel: number; em: number | null } | null;

/**
 * Monta o ponto do período fechado `ini` → `fim` (07h → 07h). Se o SIBH não
 * tiver a leitura de uma das referências, usa a guardada no banco.
 */
export function montarPonto(e: EstacaoRibeira, serie: Leitura[], cotas: Cotas | null, ini: number, fim: number, guardadoIni: Guardado, guardadoFim: Guardado = null): PontoRibeira {
  const t07 = ini;
  const agora = fim;
  const l07 = maisProxima(serie, t07, TOLERANCIA_07H);
  const nivel07 = l07?.nivel ?? guardadoIni?.nivel ?? null;
  const nivel07Em = l07?.em ?? guardadoIni?.em ?? null;
  const agoraL = ultima(serie, agora) ?? (guardadoFim ? { nivel: guardadoFim.nivel, em: guardadoFim.em ?? agora, vazao: null } : null);
  const atual = agoraL?.nivel ?? null;
  const classificavel = temCotas(cotas);
  const situacao = classificar(atual, classificavel ? cotas : null);
  const variacao = dif(atual, nivel07);
  const ateAgora = agoraL ? serie.filter((l) => l.em <= agoraL.em) : [];
  return {
    ...e,
    cotas,
    nivel07,
    nivel07Em,
    atual,
    atualEm: agoraL?.em ?? null,
    variacao,
    acima: dif(atual, cotas?.extravasamento ?? null),
    situacao,
    tendencia: tendencia(variacao),
    semDado: atual === null,
    semCotas: atual !== null && !classificavel,
    atrasado: agoraL !== null && agora - agoraL.em > ATRASO,
    desde: classificavel && atual !== null && situacao === 'EXTRAVASAMENTO' ? inicioDaSituacao(ateAgora, cotas, situacao) : null,
    saiuEm: classificavel && atual !== null ? saidaDoExtravasamento(ateAgora, cotas, situacao, agora) : null,
  };
}

/** Rótulo da situação para selos e tabelas. */
export function rotuloSituacao(p: PontoRibeira): string {
  if (p.semDado) return 'SEM DADO';
  if (p.semCotas) return 'SEM COTAS';
  return p.situacao;
}

const TEXTO_SITUACAO: Record<Situacao, string> = {
  NORMAL: 'condição normal',
  ATENÇÃO: 'atenção',
  ALERTA: 'alerta',
  EMERGÊNCIA: 'emergência',
  EXTRAVASAMENTO: 'extravasamento',
};


// ---------------------------------------------------------------- textos

/** Trecho de texto; `b` = negrito (os mesmos destaques do sumário emitido). */
export type Trecho = { t: string; b?: boolean };

const comDado = (pontos: PontoRibeira[]) => pontos.filter((p) => p.atual !== null && p.variacao !== null);

/**
 * DIAGNÓSTICO EXECUTIVO: o modelo do sumário emitido, às 07h do dia (`fim`).
 * Subida e queda contam os pontos com leitura nas duas referências.
 */
export function diagnostico(pontos: PontoRibeira[], fim: number): string {
  const com = comDado(pontos);
  if (!com.length) return 'Sem dados suficientes para diagnóstico no momento.';
  const as = `${hora(fim)} de ${diaMes(fim)}`;
  const total = pontos.length;
  const extrav = pontos.filter((p) => !p.semCotas && p.situacao === 'EXTRAVASAMENTO' && p.acima !== null);
  if (!extrav.length) return `Nenhum dos ${total} pontos monitorados no Vale do Ribeira de Iguape está acima da cota de extravasamento às ${as}.`;
  const subindo = com.filter((p) => p.tendencia === 'subida').length;
  const descendo = com.filter((p) => p.tendencia === 'queda').length;
  const maior = extrav.reduce((a, b) => ((b.acima ?? 0) > (a.acima ?? 0) ? b : a));
  return (
    `Às ${as}, ${extrav.length} de ${total} pontos monitorados ${extrav.length === 1 ? 'permanece' : 'permanecem'} em extravasamento no Vale do Ribeira de Iguape` +
    (descendo ? `, com redução de nível em ${descendo} deles` : '') +
    (subindo ? `${descendo ? ' e' : ','} elevação em ${plural(subindo, 'ponto', 'pontos')}` : '') +
    `. Maior excedência em ${maior.curto} (${fmtSinal(maior.acima)} m acima da cota).`
  );
}

/** Abertura da SÍNTESE: contagem por situação, como no sumário emitido. */
export function sinteseResumo(pontos: PontoRibeira[]): string {
  const com = comDado(pontos);
  if (!com.length) return 'Sem dados suficientes para síntese no momento.';
  const n = (s: Situacao) => com.filter((p) => !p.semCotas && p.situacao === s).length;
  const extrav = n('EXTRAVASAMENTO');
  const normal = com.filter((p) => p.semCotas || p.situacao === 'NORMAL').length;
  return (
    `Das ${pontos.length} estações monitoradas, ${extrav} ${extrav === 1 ? 'permanece' : 'permanecem'} em extravasamento` +
    (n('ALERTA') ? `, ${n('ALERTA')} em alerta` : '') +
    (n('EMERGÊNCIA') ? `, ${n('EMERGÊNCIA')} em emergência` : '') +
    (n('ATENÇÃO') ? ` e ${n('ATENÇÃO')} em atenção` : '') +
    `. ${normal} ${normal === 1 ? 'estação apresenta' : 'estações apresentam'} condição de normalidade.`
  );
}

const TENDENCIA_SINTESE: Record<Tendencia, string> = { subida: 'subida', queda: 'queda', estavel: 'estável' };

/**
 * Síntese de um ponto nos três modelos do sumário emitido (extravasamento,
 * saiu do extravasamento, demais situações), às 07h do dia (`fim`). O nome do
 * ponto vai à parte, em destaque.
 */
export function sintese(p: PontoRibeira, fim: number): Trecho[] {
  const as = `${horaH(fim)} de ${diaMes(fim)}`;
  if (p.semDado) return [{ t: `sem leitura disponível no SIBH às ${as}.` }];
  const nivel = `Às ${as}, o posto registrava nível de ${fmt(p.atual)} m`;
  const variacao: Trecho[] =
    p.variacao === null
      ? [{ t: 'sem variação registrada no período em análise' }]
      : [{ t: 'com variação de ' }, { t: `${fmtSinal(p.variacao)} m`, b: true }, { t: ' no período em análise' }];
  const fechamento: Trecho[] = p.tendencia
    ? [{ t: ' O monitoramento dos dados mais recentes indica que o nível permanece em ' }, { t: TENDENCIA_SINTESE[p.tendencia], b: true }, { t: '.' }]
    : [];
  const leitura = (antes: Trecho[]): Trecho[] => [...antes, { t: ', ' }, ...variacao, { t: '.' }, ...fechamento];

  if (p.semCotas) return leitura([{ t: `sem cotas de referência cadastradas no SIBH (situação não classificada). ${nivel}` }]);
  if (p.situacao === 'EXTRAVASAMENTO') {
    const d = p.desde;
    const desde = !d ? '' : 'em' in d ? ` desde ${diaMes(d.em)}, às ${horaH(d.em)}` : ` desde antes de ${diaMes(d.antesDe)}, às ${horaH(d.antesDe)} (início do período consultado)`;
    const cota = p.cotas?.extravasamento ?? null;
    const acima: Trecho[] =
      p.acima !== null && cota !== null ? [{ t: ', aproximadamente ' }, { t: `${fmt(Math.abs(p.acima))} m acima`, b: true }, { t: ` da cota de extravasamento de ${fmt(cota)} m` }] : [];
    return leitura([{ t: `permanece em extravasamento${desde}. ${nivel}` }, ...acima]);
  }
  if (p.saiuEm !== null) return leitura([{ t: `Saiu de extravasamento às ${horaH(p.saiuEm)} de ${diaMes(p.saiuEm)}. ${nivel}` }]);
  return leitura([{ t: `permanece em ${p.situacao === 'NORMAL' ? 'normalidade' : TEXTO_SITUACAO[p.situacao]}. ${nivel}` }]);
}

/** Texto corrido da síntese (testes e leitores de tela). */
export const textoSintese = (trechos: Trecho[]) => trechos.map((x) => x.t).join('');

// ---------------------------------------------------------------- Copel

/**
 * Volume útil do Reservatório Capivari (Copel), registro das 07h. Só o
 * registro das 07h vale: outro horário não substitui (ver volumeCopel em
 * boletim-ribeira.ts).
 */
export type VolumeCopel =
  | { estado: 'ok'; valor: number; lidoEm: number }
  | { estado: 'aguardando' }
  | { estado: 'indisponivel'; motivo: string; ultima: { valor: number; lidoEm: number } | null };

export function textoVolumeCopel(v: VolumeCopel): { valor: string; detalhe: string } {
  if (v.estado === 'ok') return { valor: `${fmt(v.valor, 1)}%`, detalhe: `Registro das ${hora(v.lidoEm)} de ${diaMes(v.lidoEm)} (horário de Brasília).` };
  if (v.estado === 'aguardando') return { valor: '—', detalhe: 'Aguardando a publicação do registro pela Copel.' };
  const ultima = v.ultima ? ` Última medição válida: ${fmt(v.ultima.valor, 1)}% em ${diaMes(v.ultima.lidoEm)} às ${horaH(v.ultima.lidoEm)}.` : '';
  return { valor: 'Indisponível', detalhe: `${v.motivo}${ultima}` };
}
