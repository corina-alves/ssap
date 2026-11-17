import { volumesCantareira } from '../integracoes/ana';
import { hojeSp, somarDias, type Dado } from '../integracoes/comum';
import { arred } from '../integracoes/http';
import { ID_CANTAREIRA, ID_SIM, resumoDiario, resumoRecente, SISTEMAS, FONTE as FONTE_SABESP, type SistemaSabesp } from '../integracoes/sabesp';
import { ESTAGIOS, estagio, type Estagio } from './reservatorios';

/**
 * Resumo dos sistemas produtores da RMSP — porte do boletim-dos-reservatorios.php
 * (SSSP_limpo): volume útil de cada sistema, variação no dia, comparação com o
 * mesmo dia do ano anterior e o texto da análise, pronto para copiar.
 *
 * Regra do Cantareira (a mesma da referência): o volume vem da ANA quando ela
 * publicou o dia; cada diferença compara a mesma fonte nas duas datas — ANA × ANA
 * se a ANA tiver as duas, senão SABESP × SABESP. Nunca ANA × SABESP.
 *
 * Diferenças deliberadas: o ano de comparação é o anterior ao da data (a referência
 * fixava 2025); o dia mais recente recua até 5 dias (a referência, só 1); o SIM,
 * que já tem frase própria, fica fora do ranking de reduções e ganhos; as
 * diferenças saem em pontos percentuais (p.p.), como nos outros boletins.
 */

/** Ordem dos cartões e do texto (a da referência). */
export const ORDEM = [ID_SIM, ID_CANTAREIRA, 65, 66, 67, 68, 72, 69] as const;

const NOME_COMPLETO: Record<number, string> = { [ID_SIM]: 'Sistema Integrado Metropolitano (SIM)' };

export type FonteResumo = 'ANA' | 'SABESP';

export type LinhaResumo = {
  id: number;
  /** nome do texto (o SIM por extenso) */
  nome: string;
  /** nome do cartão */
  curto: string;
  volume: number;
  estagio: Estagio;
  /** p.p., uma casa (como na referência) */
  difDia: number | null;
  difAno: number | null;
  volumeAnoAnterior: number | null;
  fonteVolume: FonteResumo;
  fonteDifDia: FonteResumo;
  fonteDifAno: FonteResumo;
};

export type ResumoSistemas = {
  data: string;
  dataOntem: string;
  dataAnoAnterior: string;
  anoComparacao: number;
  linhas: LinhaResumo[];
};

/** Volumes da ANA (Cantareira) nas três datas; null = a ANA não publicou o dia. */
export type CantareiraAna = { hoje: number | null; ontem: number | null; ano: number | null };

const porId = (lista: SistemaSabesp[] | null | undefined, id: number) => lista?.find((s) => s.id === id) ?? null;
const dif = (a: number, b: number | null | undefined) => (b == null ? null : arred(a - b, 1));

/** Mesmo dia/mês do ano anterior (29/02 → 28/02). */
export function mesmoDiaAnoAnterior(ymd: string): string {
  return `${Number(ymd.slice(0, 4)) - 1}${ymd.slice(4)}`.replace(/-02-29$/, '-02-28');
}

/** Monta as linhas a partir dos resumos da SABESP e dos volumes da ANA (sem consultar nada). */
export function montarLinhas(atual: SistemaSabesp[], ontem: SistemaSabesp[] | null, anoAnterior: SistemaSabesp[] | null, ana: CantareiraAna): LinhaResumo[] {
  const linhas: LinhaResumo[] = [];
  for (const id of ORDEM) {
    const s = porId(atual, id);
    if (s?.volumePct == null) continue;
    const volOntem = porId(ontem, id)?.volumePct;
    const volAno = porId(anoAnterior, id)?.volumePct;

    let volume = s.volumePct;
    let fonteVolume: FonteResumo = 'SABESP';
    let difDia = dif(s.volumePct, volOntem);
    let fonteDifDia: FonteResumo = 'SABESP';
    let volumeAnoAnterior = volAno ?? null;
    let difAno = dif(s.volumePct, volAno);
    let fonteDifAno: FonteResumo = 'SABESP';

    if (id === ID_CANTAREIRA && ana.hoje !== null) {
      volume = ana.hoje;
      fonteVolume = 'ANA';
      if (ana.ontem !== null) {
        difDia = dif(ana.hoje, ana.ontem);
        fonteDifDia = 'ANA';
      }
      if (ana.ano !== null) {
        volumeAnoAnterior = ana.ano;
        difAno = dif(ana.hoje, ana.ano);
        fonteDifAno = 'ANA';
      }
    }

    volume = arred(volume, 2);
    linhas.push({
      id,
      nome: NOME_COMPLETO[id] ?? SISTEMAS[id]!,
      curto: SISTEMAS[id]!,
      volume,
      estagio: estagio(volume),
      difDia,
      difAno,
      volumeAnoAnterior: volumeAnoAnterior === null ? null : arred(volumeAnoAnterior, 2),
      fonteVolume,
      fonteDifDia,
      fonteDifAno,
    });
  }
  return linhas;
}

/**
 * Resumo do dia mais recente com dados completos da SABESP até `dataRef`; ontem
 * e o mesmo dia do ano anterior são as datas exatas (sem recuo), como na referência.
 */
export async function resumoSistemas(dataRef = hojeSp()): Promise<Dado<ResumoSistemas>> {
  const atual = await resumoRecente(dataRef, 5);
  if (!atual.ok) return atual;
  const data = atual.dados.data;
  const dataOntem = somarDias(data, -1);
  const dataAnoAnterior = mesmoDiaAnoAnterior(data);
  const [ontem, anoAnterior, ana] = await Promise.all([resumoDiario(dataOntem), resumoDiario(dataAnoAnterior), volumesCantareira([data, dataOntem, dataAnoAnterior])]);
  return {
    ...atual,
    fonte: FONTE_SABESP,
    dados: {
      data,
      dataOntem,
      dataAnoAnterior,
      anoComparacao: Number(dataAnoAnterior.slice(0, 4)),
      linhas: montarLinhas(atual.dados.sistemas, ontem?.valor ?? null, anoAnterior?.valor ?? null, {
        hoje: ana.get(data) ?? null,
        ontem: ana.get(dataOntem) ?? null,
        ano: ana.get(dataAnoAnterior) ?? null,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Texto da análise (formato de mensagem: *negrito* e _itálico_, como no WhatsApp)
// ---------------------------------------------------------------------------

export const EMOJI_ESTAGIO: Record<Estagio['codigo'], string> = { E0: '🟢', E1: '🟡', E2: '🟠', E3: '🔴', E4: '🟣' };

const fmt = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
/** +0,2 / -0,1 / 0,0 */
const sinal = (v: number) => `${v > 0 ? '+' : ''}${fmt(v, 1)}`;
const seta = (v: number | null) => (v === null || v === 0 ? '➡️' : v > 0 ? '⬆️' : '⬇️');
const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

export function textoAnalise(r: ResumoSistemas): string {
  const ano = r.anoComparacao;
  const l: string[] = [
    '📊 *Análise dos Sistemas Produtores da Rede Metropolitana de São Paulo (RMSP)*',
    '',
    `_Volume útil (%) em ${dataBr(r.data)}_`,
    '',
    ...r.linhas.map((s) => `${EMOJI_ESTAGIO[s.estagio.codigo]} *${s.nome}*: ${fmt(s.volume, 2)}% ${seta(s.difDia)} (${s.difDia === null ? 'sem dado do dia anterior' : sinal(s.difDia)})`),
    '',
    '*Legenda:*',
    ...ESTAGIOS.map((e) => `${EMOJI_ESTAGIO[e.codigo]} ${e.codigo} - ${e.nome}`),
    '',
    `📝 *Comparação com o ano de ${ano}*`,
    '',
  ];

  const comparaveis = r.linhas.filter((s) => s.difAno !== null);
  if (!comparaveis.length) {
    l.push(`Sem dados de ${ano} para comparar.`);
    return l.join('\n');
  }

  const sim = r.linhas.find((s) => s.id === ID_SIM);
  if (sim?.difAno != null) {
    const d = sim.difAno;
    const como = d > 0 ? 'acréscimo' : d < 0 ? 'redução' : 'estabilidade';
    l.push(`${seta(d)} O *SIM* apresenta ${como} de *${fmt(Math.abs(d), 1)} p.p.* em relação a ${ano}.`, '');
  }

  const produtores = comparaveis.filter((s) => s.id !== ID_SIM);
  const reducoes = produtores.filter((s) => s.difAno! < 0).sort((a, b) => a.difAno! - b.difAno!);
  const ganhos = produtores.filter((s) => s.difAno! > 0).sort((a, b) => b.difAno! - a.difAno!);
  const ordinal = { reducao: ['maior redução', 'segunda maior redução'], ganho: ['maior ganho', 'segundo maior ganho'] };

  if (reducoes.length) {
    l.push('⚠️ *Maiores reduções:*');
    reducoes.slice(0, 2).forEach((s, i) => l.push(`⬇️ *${s.nome}*: ${ordinal.reducao[i]} em relação ao ano de ${ano} (${sinal(s.difAno!)} p.p.)`));
  }
  if (ganhos.length) {
    if (reducoes.length) l.push('');
    l.push('🟢 *Maiores ganhos:*');
    ganhos.slice(0, 2).forEach((s, i) => l.push(`⬆️ *${s.nome}*: ${ordinal.ganho[i]} em relação ao ano de ${ano} (${sinal(s.difAno!)} p.p.)`));
  }
  return l.join('\n').trimEnd();
}
