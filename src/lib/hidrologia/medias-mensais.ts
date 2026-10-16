import { hojeSp, somarDias } from '@/lib/integracoes/comum';
import { ID_SIM, resumoDiario, SISTEMAS, type SistemaSabesp } from '@/lib/integracoes/sabesp';

/**
 * Médias mensais dos sistemas produtores (porte de mlt-melhorada.php): vazão
 * natural do mês × média histórica (MLT) e chuva do mês × média climatológica,
 * mês a mês, a partir do resumo diário da SABESP. O resumo do último dia de
 * cada mês traz a vazão média e a chuva acumulada do mês inteiro.
 */

export { SISTEMAS };
export const PERIODOS = [6, 12, 18, 24];
const ROTULOS_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
/** Dias que o mês corrente recua até achar um resumo já publicado pela SABESP. */
const RECUO_MES_CORRENTE = 3;

export type Periodo = { rotulo: string; datas: string[] };
export type LinhaMes = {
  mes: string;
  data: string | null;
  vazaoMensal: number | null;
  vazaoHistorica: number | null;
  mlt: number | null;
  chuvaMensal: number | null;
  chuvaHistorica: number | null;
  mc: number | null;
};

/**
 * Os `meses` últimos meses (o corrente por último), cada um com as datas a
 * consultar em ordem de preferência: o último dia do mês; no mês corrente,
 * hoje e os dias anteriores (o dia corrente costuma chegar vazio).
 */
export function periodos(meses: number, hoje = hojeSp()): Periodo[] {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  return Array.from({ length: meses }, (_, k) => {
    const d = new Date(Date.UTC(ano, mes - 1 - (meses - 1 - k), 1));
    const ym = d.toISOString().slice(0, 7);
    const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const datas =
      ultimo < hoje
        ? [ultimo]
        : Array.from({ length: RECUO_MES_CORRENTE + 1 }, (_, i) => somarDias(hoje, -i)).filter((x) => x.startsWith(ym));
    return { rotulo: `${ROTULOS_MES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, datas };
  });
}

type Campo = 'vazaoNaturalMes' | 'vazaoNaturalMediaHistorica' | 'chuvaMes' | 'chuvaMediaHistorica';

function media(sistemas: SistemaSabesp[], campo: Campo): number | null {
  const vals = sistemas.map((s) => s[campo]).filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : null;
}

const pct = (valor: number | null, referencia: number | null) => (valor !== null && referencia !== null && referencia > 0 ? (valor / referencia) * 100 : null);

/**
 * Linha de um mês para o sistema. No SIM a vazão vem do próprio registro da
 * SABESP (ou da média dos demais, se faltar) e a chuva é sempre a média simples
 * dos demais sistemas.
 */
export function linhaMes(rotulo: string, data: string | null, resumo: SistemaSabesp[], idSistema: number): LinhaMes {
  const proprio = resumo.find((s) => s.id === idSistema);
  const demais = resumo.filter((s) => s.id !== ID_SIM);
  const sim = idSistema === ID_SIM;
  const valor = (campo: Campo, mediaNoSim: 'sempre' | 'se-faltar') =>
    sim ? (mediaNoSim === 'sempre' ? media(demais, campo) : (proprio?.[campo] ?? media(demais, campo))) : (proprio?.[campo] ?? null);

  const vazaoMensal = valor('vazaoNaturalMes', 'se-faltar');
  const vazaoHistorica = valor('vazaoNaturalMediaHistorica', 'se-faltar');
  const chuvaMensal = valor('chuvaMes', 'sempre');
  const chuvaHistorica = valor('chuvaMediaHistorica', 'sempre');
  return { mes: rotulo, data, vazaoMensal, vazaoHistorica, mlt: pct(vazaoMensal, vazaoHistorica), chuvaMensal, chuvaHistorica, mc: pct(chuvaMensal, chuvaHistorica) };
}

/** Série mensal do sistema nos `meses` últimos meses. Mês sem resumo publicado vem com os valores nulos. */
export async function mediasMensais(idSistema: number, meses: number, hoje = hojeSp()): Promise<LinhaMes[]> {
  const ps = periodos(meses, hoje);
  // No máximo 28 datas (24 meses): todas de uma vez, sem os lotes de 10 de resumosPeriodo.
  const datas = ps.flatMap((p) => p.datas);
  const rs = await Promise.all(datas.map((d) => resumoDiario(d)));
  const resumos = new Map(datas.flatMap((d, i) => (rs[i] ? [[d, rs[i].valor] as const] : [])));
  return ps.map((p) => {
    const data = p.datas.find((d) => resumos.has(d)) ?? null;
    return linhaMes(p.rotulo, data, data ? resumos.get(data)! : [], idSistema);
  });
}
