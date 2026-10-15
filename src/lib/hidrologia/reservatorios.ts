import { volumeCantareira, volumeJaguari, type VolumeAna } from '../integracoes/ana';
import { hojeSp, somarDias, type Dado } from '../integracoes/comum';
import { arred } from '../integracoes/http';
import { ID_CANTAREIRA, ID_SIM, resumoRecente, resumosPeriodo, type SistemaSabesp } from '../integracoes/sabesp';
import { serie, SERIE_TRANSPOSICAO } from '../integracoes/ssd';

/**
 * Reservatórios dos sistemas produtores da RMSP (porte de
 * Hidrologia::montarReservatorios() da referência).
 *
 * Regra da Sala: o volume do Cantareira vem da ANA quando disponível, e o card
 * mostra "Dado: ANA"; sem ANA, cai para o valor da SABESP.
 * Diferença deliberada: a comparação é com o MESMO DIA DO ANO ANTERIOR
 * (a referência fixava 2025).
 */

// ---------------------------------------------------------------------------
// Estágios do Protocolo de Escassez (faixas da referência)
// ---------------------------------------------------------------------------

export type Estagio = { codigo: 'E0' | 'E1' | 'E2' | 'E3' | 'E4'; nome: string; classe: string; faixa: string };

export const ESTAGIOS: Estagio[] = [
  { codigo: 'E0', nome: 'Normal', classe: 'normal', faixa: 'Volume útil igual ou acima de 60%.' },
  { codigo: 'E1', nome: 'Atenção', classe: 'atencao', faixa: 'Volume útil entre 40% e 60%.' },
  { codigo: 'E2', nome: 'Alerta', classe: 'alerta', faixa: 'Volume útil entre 30% e 40%.' },
  { codigo: 'E3', nome: 'Crítico', classe: 'critico', faixa: 'Volume útil entre 20% e 30%.' },
  { codigo: 'E4', nome: 'Emergência', classe: 'emergencia', faixa: 'Volume útil abaixo de 20%.' },
];
export const LIMITES_ESTAGIO = [60, 40, 30, 20] as const;

export function estagio(volumePct: number): Estagio {
  const i = LIMITES_ESTAGIO.findIndex((l) => volumePct >= l);
  return ESTAGIOS[i === -1 ? 4 : i]!;
}

// ---------------------------------------------------------------------------
// Tela principal
// ---------------------------------------------------------------------------

export type LinhaSistema = {
  id: number;
  nome: string;
  fonte: 'ana' | 'sabesp';
  volume: number;
  volumeAnoAnterior: number | null;
  difAno: number | null;
  difDia: number | null;
  chuvaDia: number | null;
  chuvaMes: number | null;
  chuvaMediaHistorica: number | null;
  estagio: Estagio;
};

export type PainelReservatorios = {
  dataUsada: string;
  dataComparacao: string | null;
  anoComparacao: number;
  sistemas: LinhaSistema[];
  sim: LinhaSistema | null;
  cantareira: LinhaSistema | null;
  altoTiete: LinhaSistema | null;
  menor: LinhaSistema | null;
  cantareiraAna: Dado<VolumeAna>;
  jaguari: Dado<VolumeAna>;
  transposicaoM3s: number | null;
  desatualizado: boolean;
  obtidoEm: Date;
};

/** Primeira data com resumo completo, recuando até 5 dias (null se nenhuma). */
async function recente(ymd: string) {
  const r = await resumoRecente(ymd, 5);
  return r.ok ? r : null;
}

function porId(lista: SistemaSabesp[] | undefined, id: number) {
  return lista?.find((s) => s.id === id) ?? null;
}

export async function painelReservatorios(dataRef = hojeSp()): Promise<Dado<PainelReservatorios>> {
  const atual = await resumoRecente(dataRef, 5);
  if (!atual.ok) return atual;
  const dataUsada = atual.dados.data;
  const anoComparacao = Number(dataUsada.slice(0, 4)) - 1;
  const mesmaDataAnoAnterior = `${anoComparacao}${dataUsada.slice(4)}`.replace(/-02-29$/, '-02-28');

  // Tudo o que depende só da data usada, em paralelo.
  const [anterior, ontem, cantareiraAna, jaguari, transp] = await Promise.all([
    recente(mesmaDataAnoAnterior),
    recente(somarDias(dataUsada, -1)),
    volumeCantareira(dataUsada),
    volumeJaguari(dataUsada),
    serie(SERIE_TRANSPOSICAO, somarDias(dataUsada, -30), dataUsada),
  ]);

  const sistemas: LinhaSistema[] = [];
  for (const s of atual.dados.sistemas) {
    if (s.volumePct === null) continue;
    const ehCantareira = s.id === ID_CANTAREIRA && cantareiraAna.ok;
    const volume = arred(ehCantareira && cantareiraAna.ok ? cantareiraAna.dados.volumePct : s.volumePct, 2);
    const a = porId(anterior?.dados.sistemas, s.id);
    const o = porId(ontem?.dados.sistemas, s.id);
    sistemas.push({
      id: s.id,
      nome: s.nome,
      fonte: ehCantareira ? 'ana' : 'sabesp',
      volume,
      volumeAnoAnterior: a?.volumePct != null ? arred(a.volumePct, 2) : null,
      difAno: a?.volumePct != null ? arred(volume - a.volumePct, 2) : null,
      // Dif. dia sempre na mesma fonte (SABESP), para não misturar ANA com SABESP.
      difDia: o?.volumePct != null ? arred(s.volumePct - o.volumePct, 2) : null,
      chuvaDia: s.chuvaDia,
      chuvaMes: s.chuvaMes,
      chuvaMediaHistorica: s.chuvaMediaHistorica,
      estagio: estagio(volume),
    });
  }
  const produtores = sistemas.filter((s) => s.id !== ID_SIM);
  const pontos = transp.ok ? transp.dados.pontos : [];

  return {
    ...atual,
    dados: {
      dataUsada,
      dataComparacao: anterior?.dados.data ?? null,
      anoComparacao,
      sistemas,
      sim: sistemas.find((s) => s.id === ID_SIM) ?? null,
      cantareira: sistemas.find((s) => s.id === ID_CANTAREIRA) ?? null,
      altoTiete: sistemas.find((s) => s.nome === 'Alto Tietê') ?? null,
      menor: produtores.reduce<LinhaSistema | null>((m, s) => (!m || s.volume < m.volume ? s : m), null),
      cantareiraAna,
      jaguari,
      transposicaoM3s: pontos.length ? arred(pontos[pontos.length - 1]!.valor, 2) : null,
      desatualizado: atual.desatualizado,
      obtidoEm: atual.obtidoEm,
    },
  };
}

// ---------------------------------------------------------------------------
// Série anual (mesmo dia/mês desde 2010) — mais lenta na primeira vez
// ---------------------------------------------------------------------------

export type PontoAnual = { ano: number; data: string; volume: number | null };

export async function serieAnual(dataBase: string, idSistema: number, desde = 2010): Promise<PontoAnual[]> {
  const ano = Number(dataBase.slice(0, 4));
  const mmdd = dataBase.slice(5);
  const datas = Array.from({ length: ano - desde + 1 }, (_, i) => {
    const a = desde + i;
    // 29/02 em ano não bissexto → 28/02
    return mmdd === '02-29' && !(a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0)) ? `${a}-02-28` : `${a}-${mmdd}`;
  });
  const resumos = await resumosPeriodo(datas);
  return datas.map((d) => {
    const v = porId(resumos.get(d), idSistema)?.volumePct ?? null;
    return { ano: Number(d.slice(0, 4)), data: d, volume: v === null ? null : arred(v, 2) };
  });
}
