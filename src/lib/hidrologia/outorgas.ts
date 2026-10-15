import { hojeSp, type Dado } from '../integracoes/comum';
import { resumoRecente } from '../integracoes/sabesp';

/**
 * Vazões outorgadas dos sistemas produtores (porte de out_montar_painel() de
 * vazoes-outorgadas.php): captação observada (SABESP) × limite de retirada.
 */

/**
 * Limites de retirada em m³/s — os mesmos valores do Sumário Executivo.
 * PARÂMETRO REGULATÓRIO: atualize quando sair nova outorga ou resolução.
 * A transposição do Paraíba do Sul (Cantareira) é mostrada à parte.
 */
export const OUTORGAS: { id: number; nome: string; outorga: number; transposicao?: number }[] = [
  { id: 64, nome: 'CANTAREIRA', outorga: 33.0, transposicao: 8.5 },
  { id: 65, nome: 'ALTO TIETÊ', outorga: 15.0 },
  { id: 66, nome: 'GUARAPIRANGA', outorga: 16.0 },
  { id: 67, nome: 'COTIA', outorga: 2.3 },
  { id: 68, nome: 'RIO GRANDE', outorga: 5.5 },
  { id: 69, nome: 'RIO CLARO', outorga: 4.0 },
  { id: 72, nome: 'SÃO LOURENÇO', outorga: 6.4 },
];

export type LinhaOutorga = {
  id: number;
  nome: string;
  captacao: number | null;
  outorga: number;
  transposicao: number;
  percentual: number | null;
  margem: number | null;
};

export type PainelOutorgas = {
  data: string;
  sistemas: LinhaOutorga[];
  totalOutorga: number;
  totalCaptacao: number | null;
  percentualTotal: number | null;
  maiorUso: LinhaOutorga | null;
};

/** Painel do dia pedido, recuando até 7 dias se a SABESP ainda não publicou. */
export async function painelOutorgas(dataRef = hojeSp()): Promise<Dado<PainelOutorgas>> {
  const r = await resumoRecente(dataRef, 7);
  if (!r.ok) return r;

  const sistemas = OUTORGAS.map((o): LinhaOutorga => {
    const captacao = r.dados.sistemas.find((s) => s.id === o.id)?.vazaoCaptada ?? null;
    return {
      id: o.id,
      nome: o.nome,
      captacao,
      outorga: o.outorga,
      transposicao: o.transposicao ?? 0,
      percentual: captacao === null ? null : (captacao / o.outorga) * 100,
      margem: captacao === null ? null : o.outorga - captacao,
    };
  });
  const comDado = sistemas.filter((s) => s.captacao !== null);
  const totalOutorga = sistemas.reduce((t, s) => t + s.outorga, 0);
  const totalCaptacao = comDado.length ? comDado.reduce((t, s) => t + s.captacao!, 0) : null;

  return {
    ...r,
    dados: {
      data: r.dados.data,
      sistemas,
      totalOutorga,
      totalCaptacao,
      percentualTotal: totalCaptacao === null ? null : (totalCaptacao / totalOutorga) * 100,
      maiorUso: comDado.reduce<LinhaOutorga | null>((m, s) => (!m || s.percentual! > m.percentual! ? s : m), null),
    },
  };
}

/** Faixas de utilização do limite: cor e situação (as mesmas do PHP). */
export function situacaoUso(p: number | null): { rotulo: string; classe: string; cor: string } {
  if (p === null) return { rotulo: 'SEM DADO', classe: 'b-ok', cor: '#9aa8b6' };
  if (p >= 100) return { rotulo: 'LIMITE / ACIMA', classe: 'b-crit', cor: '#d9544d' };
  if (p >= 90) return { rotulo: 'ALERTA', classe: 'b-alert', cor: '#ed8a2f' };
  if (p >= 75) return { rotulo: 'ATENÇÃO', classe: 'b-att', cor: '#f4b942' };
  return { rotulo: 'DENTRO DO LIMITE', classe: 'b-ok', cor: '#0aa58f' };
}
