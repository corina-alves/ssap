import type { EstacaoRibeira } from '@/conteudo/boletim-ribeira';
import { arred } from '../integracoes/http';
import { instante, type Cotas, type Medicao } from '../integracoes/sibh-medicoes';
import { classificar, SITUACOES, type Situacao } from './sumario-automatico-tp';

/**
 * Regras do Boletim Executivo Público — Vale do Ribeira, sem acesso a rede ou
 * banco (testadas em tests/boletim-ribeira.test.ts). As regras hidrológicas são
 * as do Sumário Executivo tradicional do Ribeira:
 *   situação   nível atual × cotas de referência do SIBH (a cota entra na faixa)
 *   variação   nível atual − nível das 07h
 *   tendência  sinal da variação arredondada a 2 casas (0,00 = estável)
 *   acima      nível atual − cota de extravasamento, só em extravasamento
 * Os textos dizem só o que os números dizem: nada de interpretação.
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
  nivel07: number | null;
  nivel07Em: number | null;
  atual: number | null;
  atualEm: number | null;
  /** atual − 07h (m) */
  variacao: number | null;
  /** atual − cota de extravasamento (m) */
  acima: number | null;
  situacao: Situacao;
  tendencia: Tendencia | null;
  /** sem leitura nas últimas 12 h */
  semDado: boolean;
  /** sem cotas de referência no SIBH: situação não classificada */
  semCotas: boolean;
  /** última leitura com mais de 1 h */
  atrasado: boolean;
  desde: Desde | null;
  saiuEm: number | null;
};

/** Monta o ponto a partir da série recente (e do nível das 07h guardado no banco, se o SIBH não tiver). */
export function montarPonto(e: EstacaoRibeira, serie: Leitura[], cotas: Cotas | null, t07: number, agora: number, nivel07Guardado: { nivel: number; em: number | null } | null): PontoRibeira {
  const l07 = maisProxima(serie, t07, TOLERANCIA_07H);
  const nivel07 = l07?.nivel ?? nivel07Guardado?.nivel ?? null;
  const nivel07Em = l07?.em ?? nivel07Guardado?.em ?? null;
  const agoraL = ultima(serie, agora);
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

/** Pontos com situação classificada (com leitura e com cotas). */
export const classificados = (pontos: PontoRibeira[]) => pontos.filter((p) => !p.semDado && !p.semCotas);

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

/** Situações de destaque (pedem atenção visual). */
export const CRITICAS: Situacao[] = ['ALERTA', 'EMERGÊNCIA', 'EXTRAVASAMENTO'];

// ---------------------------------------------------------------- textos

/** Diagnóstico executivo: contagem por situação, movimento desde as 07h e maior excedência. */
export function diagnostico(pontos: PontoRibeira[], t07: number): string {
  const com = classificados(pontos);
  const semLeitura = pontos.filter((p) => p.semDado).length;
  if (!com.length) {
    return pontos.length && semLeitura === pontos.length
      ? 'Sem leituras recentes dos pontos monitorados: o diagnóstico volta a ser gerado quando o SIBH enviar novos dados.'
      : 'Sem dados suficientes para o diagnóstico no momento.';
  }
  const ref = Math.max(...com.map((p) => p.atualEm ?? 0));
  const contagem = [...SITUACOES].reverse().flatMap((s) => {
    const k = com.filter((p) => p.situacao === s).length;
    return k ? [`${k} em ${TEXTO_SITUACAO[s]}`] : [];
  });
  const total = pontos.length;
  const todosNormais = com.every((p) => p.situacao === 'NORMAL');
  let t =
    todosNormais && com.length === total
      ? `Às ${horaH(ref)} de ${diaMes(ref)}, os ${total} pontos monitorados no Vale do Ribeira de Iguape estão em condição normal; nenhum está acima da cota de extravasamento.`
      : `Às ${horaH(ref)} de ${diaMes(ref)}, ${com.length === total ? `dos ${total} pontos monitorados no Vale do Ribeira de Iguape` : `entre os ${com.length} pontos com situação classificada`}, ${lista(contagem)}.`;
  if (semLeitura) t += ` ${plural(semLeitura, 'ponto está', 'pontos estão')} sem leitura recente.`;

  const mov = (x: Tendencia) => com.filter((p) => p.tendencia === x).length;
  const movimento = [
    mov('subida') ? `subiu em ${plural(mov('subida'), 'ponto', 'pontos')}` : '',
    mov('queda') ? `caiu em ${plural(mov('queda'), 'ponto', 'pontos')}` : '',
    mov('estavel') ? `ficou estável em ${plural(mov('estavel'), 'ponto', 'pontos')}` : '',
  ].filter(Boolean);
  if (movimento.length) t += ` Desde as 07h de ${diaMes(t07)}, o nível ${lista(movimento)}.`;

  const extrav = com.filter((p) => p.situacao === 'EXTRAVASAMENTO' && p.acima !== null);
  if (extrav.length) {
    const maior = extrav.reduce((a, b) => ((b.acima ?? 0) > (a.acima ?? 0) ? b : a));
    t += ` Maior excedência da cota de extravasamento em ${maior.curto} (${fmtSinal(maior.acima)} m).`;
  }
  return t;
}

const quando = (ms: number) => `às ${horaH(ms)} de ${diaMes(ms)}`;

/** Síntese de um ponto, no formato dos modelos do sumário tradicional (sem o nome, que vai em destaque). */
export function sintese(p: PontoRibeira): string {
  if (p.semDado) return 'sem leitura disponível no SIBH nas últimas 12 horas.';
  const nivel = `${quando(p.atualEm!)}, o posto registrava nível de ${fmt(p.atual)} m`;
  const mov =
    p.variacao === null
      ? '; sem a leitura das 07h, a variação do dia não foi calculada'
      : p.tendencia === 'estavel'
        ? ', estável desde as 07h'
        : `, ${p.tendencia === 'subida' ? 'subida' : 'queda'} de ${fmt(Math.abs(p.variacao))} m desde as 07h`;
  if (p.semCotas) return `sem cotas de referência cadastradas no SIBH (situação não classificada). ${maiuscula(nivel)}${mov}.`;

  if (p.situacao === 'EXTRAVASAMENTO') {
    const d = p.desde;
    const desde = !d ? '' : 'em' in d ? ` desde ${horaH(d.em)} de ${diaMes(d.em)}` : ` desde antes de ${horaH(d.antesDe)} de ${diaMes(d.antesDe)} (início do período consultado)`;
    const cota = p.cotas?.extravasamento ?? null;
    const acima = p.acima !== null && cota !== null ? `, ${fmt(Math.abs(p.acima))} m acima da cota de extravasamento de ${fmt(cota)} m` : '';
    return `em extravasamento${desde}. ${maiuscula(nivel)}${acima}${mov}.`;
  }
  const saiu = p.saiuEm !== null ? `saiu do extravasamento ${quando(p.saiuEm)} e está em ${TEXTO_SITUACAO[p.situacao]}` : `em ${TEXTO_SITUACAO[p.situacao]}`;
  return `${saiu}. ${maiuscula(nivel)}${mov}.`;
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Observações automáticas sobre registros ausentes ou incompletos. */
export function observacoes(pontos: PontoRibeira[], t07: number): string[] {
  const nomes = (f: (p: PontoRibeira) => boolean) => pontos.filter(f).map((p) => p.curto);
  const o: string[] = [];
  const sem = nomes((p) => p.semDado);
  if (sem.length) o.push(`Sem leitura nas últimas 12 horas: ${lista(sem)}.`);
  const atrasados = pontos.filter((p) => p.atrasado).map((p) => `${p.curto} (${horaH(p.atualEm!)} de ${diaMes(p.atualEm!)})`);
  if (atrasados.length) o.push(`Última leitura recebida há mais de 1 hora: ${lista(atrasados)}.`);
  const sem07 = nomes((p) => !p.semDado && p.nivel07 === null);
  if (sem07.length) o.push(`Sem leitura das 07h de ${diaMes(t07)} (até 30 minutos antes ou depois): ${lista(sem07)} — variação e tendência não calculadas.`);
  const semCotas = nomes((p) => p.semCotas);
  if (semCotas.length) o.push(`Sem cotas de referência cadastradas no SIBH: ${lista(semCotas)} — situação não classificada.`);
  if (!o.length) o.push(`Os ${pontos.length} pontos monitorados enviaram leitura na última hora, com a referência das 07h disponível.`);
  return o;
}

// ---------------------------------------------------------------- Copel

/**
 * Volume útil do Reservatório Capivari (Copel), registro das 07h. Só o
 * registro das 07h vale: outro horário não substitui. Hoje não há fonte
 * autorizada (ver volumeCopel em boletim-ribeira.ts).
 */
export type VolumeCopel =
  | { estado: 'ok'; valor: number; lidoEm: number }
  | { estado: 'aguardando' }
  | { estado: 'indisponivel'; motivo: string; ultima: { valor: number; lidoEm: number } | null };

export function textoVolumeCopel(v: VolumeCopel): { valor: string; detalhe: string } {
  if (v.estado === 'ok') return { valor: `${fmt(v.valor, 1)}%`, detalhe: `Registro das 07h de ${diaMes(v.lidoEm)} (horário de Brasília).` };
  if (v.estado === 'aguardando') return { valor: '—', detalhe: 'Volume útil das 07h: aguardando atualização da Copel.' };
  const ultima = v.ultima ? ` Última medição válida: ${fmt(v.ultima.valor, 1)}% em ${diaMes(v.ultima.lidoEm)} às ${horaH(v.ultima.lidoEm)}.` : '';
  return { valor: 'Indisponível', detalhe: `${v.motivo}${ultima}` };
}
