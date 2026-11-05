import { volumesCantareira } from '../integracoes/ana';
import { ID_CANTAREIRA, ID_SIM, resumosPeriodo, SISTEMAS, type SistemaSabesp } from '../integracoes/sabesp';
import { MESES, somarMeses } from './sistemas-ssd';

/**
 * Tabela "Volumes Sistemas Produtores (SABESP e ANA)" do boletim mensal da Sala:
 * volume útil no último dia do mês, no último dia do mês anterior e no último
 * dia do mesmo mês do ano anterior, as diferenças (p.p.), a chuva acumulada no
 * mês e a média histórica do mês.
 *
 *  - fonte: resumo diário da SABESP (Mananciais); o volume do Cantareira vem da
 *    ANA (SAR) quando ela publicou o dia — a mesma regra dos cards da Sala;
 *  - diferenças calculadas com os valores sem arredondar;
 *  - SIM: volume da própria SABESP; chuva e média histórica = média simples dos
 *    demais sistemas (a SABESP não publica chuva do SIM), como no boletim;
 *  - dia sem publicação fica sem valor — nunca é trocado por outro dia.
 */

export type LinhaVolumes = {
  id: number;
  nome: string;
  atual: number | null;
  mesAnterior: number | null;
  anoAnterior: number | null;
  difMes: number | null;
  difAno: number | null;
  chuvaMes: number | null;
  mediaHistorica: number | null;
  /** De onde veio o volume atual. */
  fonte: 'ana' | 'sabesp' | null;
};

export type TabelaVolumes = {
  mes: string; // AAAA-MM
  datas: { atual: string; mesAnterior: string; anoAnterior: string };
  rotulos: { atual: string; mesAnterior: string; anoAnterior: string; anoAnteriorAno: string };
  sistemas: LinhaVolumes[];
  sim: LinhaVolumes;
  /** Datas que a fonte ainda não publicou (ou não respondeu). */
  faltas: string[];
};

/** Último dia do mês "AAAA-MM" → "AAAA-MM-DD". */
export function ultimoDia(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number) as [number, number];
  return `${anoMes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const dif = (a: number | null, b: number | null) => (a === null || b === null ? null : r1(a - b));
const rotuloMes = (anoMes: string) => `${MESES[Number(anoMes.slice(5)) - 1]}/${anoMes.slice(2, 4)}`;
const media = (vs: (number | null)[]) => {
  const ok = vs.filter((v): v is number => v !== null);
  return ok.length === vs.length && ok.length ? r1(ok.reduce((s, v) => s + v, 0) / ok.length) : null;
};

/** Monta a tabela com os resumos da SABESP e os volumes da ANA (Cantareira) das três datas. Pura. */
export function montarTabela(mes: string, sabesp: Map<string, SistemaSabesp[]>, anaCantareira: Map<string, number>): TabelaVolumes {
  const mesAnt = somarMeses(mes, -1);
  const anoAnt = `${Number(mes.slice(0, 4)) - 1}${mes.slice(4)}`;
  const datas = { atual: ultimoDia(mes), mesAnterior: ultimoDia(mesAnt), anoAnterior: ultimoDia(anoAnt) };
  const faltas = Object.values(datas).filter((d) => !sabesp.get(d)?.some((s) => s.volumePct !== null));

  const volume = (id: number, data: string): { v: number | null; fonte: 'ana' | 'sabesp' | null } => {
    if (id === ID_CANTAREIRA && anaCantareira.has(data)) return { v: anaCantareira.get(data)!, fonte: 'ana' };
    const v = sabesp.get(data)?.find((s) => s.id === id)?.volumePct ?? null;
    return { v, fonte: v === null ? null : 'sabesp' };
  };
  const linha = (id: number): LinhaVolumes => {
    const atual = volume(id, datas.atual);
    const mesA = volume(id, datas.mesAnterior).v;
    const anoA = volume(id, datas.anoAnterior).v;
    const s = sabesp.get(datas.atual)?.find((x) => x.id === id);
    return {
      id,
      nome: SISTEMAS[id]!,
      atual: atual.v === null ? null : r1(atual.v),
      mesAnterior: mesA === null ? null : r1(mesA),
      anoAnterior: anoA === null ? null : r1(anoA),
      difMes: dif(atual.v, mesA),
      difAno: dif(atual.v, anoA),
      chuvaMes: s?.chuvaMes ?? null,
      mediaHistorica: s?.chuvaMediaHistorica ?? null,
      fonte: atual.fonte,
    };
  };
  const sistemas = Object.keys(SISTEMAS)
    .map(Number)
    .filter((id) => id !== ID_SIM)
    .map(linha);
  const sim = linha(ID_SIM);
  sim.chuvaMes = media(sistemas.map((s) => s.chuvaMes));
  sim.mediaHistorica = media(sistemas.map((s) => s.mediaHistorica));
  sim.fonte = sim.atual === null ? null : 'sabesp';
  return {
    mes,
    datas,
    rotulos: { atual: rotuloMes(mes), mesAnterior: rotuloMes(mesAnt), anoAnterior: rotuloMes(anoAnt), anoAnteriorAno: anoAnt.slice(0, 4) },
    sistemas,
    sim,
    faltas,
  };
}

const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pp = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
const dataBr = (ymd: string) => `${ymd.slice(8)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const lista = (itens: string[]) => (itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join('; ')}; e ${itens[itens.length - 1]}`);

/**
 * "Análise dos Sistemas Produtores" do boletim, montada só com os números da
 * tabela (sem interpretação): volume de cada sistema, quantos subiram ou caíram
 * no mês, as maiores variações e o SIM. Diferença entre volumes em p.p.
 */
export function textoAnalise(t: TabelaVolumes): string | null {
  const comDado = t.sistemas.filter((s) => s.atual !== null);
  if (!comDado.length) return null;
  const frases = [
    `A figura apresenta a situação dos sistemas produtores da Região Metropolitana de São Paulo (RMSP) em ${dataBr(t.datas.atual)}, comparada ao último dia do mês anterior (${dataBr(t.datas.mesAnterior)}) e ao mesmo período do ano anterior (${dataBr(t.datas.anoAnterior)}).`,
  ];

  const comMes = comDado.filter((s) => s.difMes !== null);
  const subiu = comMes.filter((s) => s.difMes! > 0).length;
  const caiu = comMes.filter((s) => s.difMes! < 0).length;
  const estavel = comMes.length - subiu - caiu;
  if (comMes.length) {
    if (subiu === comMes.length) frases.push('Em relação ao mês anterior, o volume útil subiu em todos os sistemas.');
    else if (caiu === comMes.length) frases.push('Em relação ao mês anterior, o volume útil caiu em todos os sistemas.');
    else {
      const partes = [subiu && `subiu em ${subiu} ${subiu === 1 ? 'sistema' : 'sistemas'}`, caiu && `caiu em ${caiu}`, estavel && `ficou estável em ${estavel}`].filter(Boolean) as string[];
      frases.push(`Em relação ao mês anterior, o volume útil ${partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0]}.`);
    }
  }

  const cantareira = comDado.find((s) => s.id === ID_CANTAREIRA);
  if (cantareira) {
    frases.push(
      `Atualmente, o volume útil do sistema Cantareira é de ${pct(cantareira.atual!)}${cantareira.anoAnterior !== null ? `, enquanto no mesmo período do ano anterior registrava ${pct(cantareira.anoAnterior)}` : ''}.`,
    );
  }
  const demais = comDado.filter((s) => s.id !== ID_CANTAREIRA);
  if (demais.length) frases.push(`O sistema ${demais[0]!.nome} apresenta ${pct(demais[0]!.atual!)} do volume útil${demais.length > 1 ? `; ${lista(demais.slice(1).map((s) => `${s.nome}, ${pct(s.atual!)}`))}` : ''}.`);

  const maior = (campo: 'difMes' | 'difAno') => comDado.filter((s) => s[campo] !== null).reduce<LinhaVolumes | null>((m, s) => (!m || Math.abs(s[campo]!) > Math.abs(m[campo]!) ? s : m), null);
  const mMes = maior('difMes');
  const mAno = maior('difAno');
  if (mMes && mAno) {
    frases.push(`As maiores variações foram no sistema ${mMes.nome} em relação ao mês anterior (${pp(mMes.difMes!)}) e no sistema ${mAno.nome} em relação ao ano anterior (${pp(mAno.difAno!)}).`);
  }

  const { sim } = t;
  if (sim.atual !== null) {
    const antes = [sim.mesAnterior !== null && `${pct(sim.mesAnterior)} no mês anterior`, sim.anoAnterior !== null && `${pct(sim.anoAnterior)} no mesmo período do ano anterior`].filter(Boolean) as string[];
    frases.push(`Já o Sistema Integrado Metropolitano (SIM) possui ${pct(sim.atual)} do volume útil atual${antes.length ? `, ante ${antes.join(' e ')}` : ''}.`);
  }
  return frases.join(' ');
}

/** Tabela do mês "AAAA-MM" com os dados da SABESP e da ANA (dias passados ficam no cache das integrações). */
export async function volumesMensais(mes: string): Promise<TabelaVolumes> {
  const mesAnt = somarMeses(mes, -1);
  const anoAnt = `${Number(mes.slice(0, 4)) - 1}${mes.slice(4)}`;
  const datas = [ultimoDia(mes), ultimoDia(mesAnt), ultimoDia(anoAnt)];
  const [sabesp, ana] = await Promise.all([resumosPeriodo(datas).catch(() => new Map<string, SistemaSabesp[]>()), volumesCantareira(datas).catch(() => new Map<string, number>())]);
  return montarTabela(mes, sabesp, ana);
}
