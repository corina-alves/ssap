import { hojeSp, somarDias } from '../integracoes/comum';
import { arred } from '../integracoes/http';
import { ID_CANTAREIRA, resumosPeriodo } from '../integracoes/sabesp';
import { serie, transposicaoAno } from '../integracoes/ssd';
import { OUTORGAS } from './outorgas';
import { painelReservatorios } from './reservatorios';
import { chuvasSistemas, vazoesSistemas } from './sistemas';

/**
 * Painel de Situação Hídrica — RMSP (porte de painel/index.php?ajax=dados):
 * volume, chuva, vazão natural, transposição do Paraíba do Sul e captação do
 * mês × outorga dos sistemas produtores, numa única chamada.
 */

/** SSD: captação mensal do Cantareira (E.E. Santa Inês), m³/s. */
const SERIE_CAPTACAO_CANTAREIRA = 809;

export type CaptacaoMensal = { id: number; outorga: number; captadoMes: number | null; pctOutorga: number | null };

/**
 * Captação do mês × outorga (porte de Hidrologia::getCaptacaoMensalSistemas):
 * média da vazão captada (SABESP) do dia 1º até a data; no Cantareira, o último
 * valor mensal da série do SSD.
 */
export async function captacaoMensal(dataRef = hojeSp()): Promise<CaptacaoMensal[]> {
  const dias: string[] = [];
  for (let d = `${dataRef.slice(0, 8)}01`; d <= dataRef; d = somarDias(d, 1)) dias.push(d);
  const [resumos, cantareira] = await Promise.all([resumosPeriodo(dias), serie(SERIE_CAPTACAO_CANTAREIRA, `${dataRef.slice(0, 4)}-01-01`, dataRef)]);

  return OUTORGAS.map((o) => {
    let captadoMes: number | null;
    if (o.id === ID_CANTAREIRA) {
      captadoMes = cantareira.ok ? (cantareira.dados.pontos.at(-1)?.valor ?? null) : null;
    } else {
      const vs = dias.flatMap((d) => {
        const v = resumos.get(d)?.find((s) => s.id === o.id)?.vazaoCaptada;
        return typeof v === 'number' ? [v] : [];
      });
      captadoMes = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    }
    return {
      id: o.id,
      outorga: o.outorga,
      captadoMes: captadoMes === null ? null : arred(captadoMes, 2),
      pctOutorga: captadoMes === null ? null : arred((100 * captadoMes) / o.outorga, 1),
    };
  });
}

export async function painelSituacao(dataRef = hojeSp()) {
  const [volume, chuva, vazao, transposicao, captacao] = await Promise.all([
    painelReservatorios(dataRef),
    chuvasSistemas(dataRef),
    vazoesSistemas(dataRef),
    transposicaoAno(dataRef),
    captacaoMensal(dataRef),
  ]);
  return { volume, chuva, vazao, transposicao, captacao };
}
