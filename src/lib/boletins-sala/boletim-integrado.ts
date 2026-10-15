import historicoChuva from '@/conteudo/ugrhi6-chuva-historica.json';
import { lembrar } from '../integracoes/cache';
import { hojeSp } from '../integracoes/comum';
import { buscarSibh, cotasAlerta, instante, medicoes, type Cotas, type Medicao, type Pedido } from '../integracoes/sibh-medicoes';
import { mediasDiarias, PARAMETROS, type MediasDiarias, type Parametro } from '../integracoes/simqua';
import { serie } from '../integracoes/ssd';
import { dataIso, postosAtivos, SUBBACIAS, type Posto } from './rede-pluviometrica';

/**
 * Boletins mensais do Alto Tietê feitos com a CETESB (porte de
 * C:\xampp_\htdocs\boletim_integrado): Chuva-Vazão, Mananciais e Exutórios.
 * Aqui ficam a configuração (postos, séries, pontos de qualidade) e a coleta
 * dos dados — SIBH (chuva, nível e vazão), SSD SP Águas (mananciais e
 * Billings/Pedreira) e CETESB/SIMQUA (qualidade). O que não tem fonte
 * automática (Pirapora e carga orgânica) é digitado no cadastro dos exutórios.
 * Nada é estimado: sem dado, o boletim mostra "sem dados".
 */

export const SALA_BOLETIM = 'cetesb';
export const PERMISSAO_BOLETIM = 'criar_boletim';

export const TIPOS = { chuva_vazao: 'BOLETIM CHUVA - VAZÃO', mananciais: 'BOLETIM MANANCIAIS', exutorios: 'BOLETIM EXUTÓRIOS' } as const;
export type Tipo = keyof typeof TIPOS;
export const NOMES: Record<Tipo, string> = { chuva_vazao: 'Chuva-Vazão', mananciais: 'Mananciais', exutorios: 'Exutórios' };
export const ehTipo = (t: string): t is Tipo => Object.hasOwn(TIPOS, t);

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Ordem das sub-bacias nas tabelas dos boletins. */
export const ORDEM_SUBBACIAS = ['cabeceiras', 'cotia_guarapiranga', 'penha_pinheiros', 'pinheiros_pirapora', 'juqueri_cantareira', 'billings_tamanduatei'];

/** Leitura diária de chuva acima disto (ou negativa) é descartada: contador acumulado ou sensor com defeito. */
export const CHUVA_MAX_DIARIA_MM = 200;
const INICIO_SERIE_SIBH = 2015;

// --- Boletim Mananciais: séries diárias do SSD SP Águas (chuva, vazão natural, vazão defluente, volume útil %)
export const MANANCIAIS: Record<string, { nome: string; titulo: string; chuva: number; qnat: number; qjus: number; volume: number }> = {
  cantareira: { nome: 'Sistema Cantareira', titulo: 'Sistema Cantareira', chuva: 369, qnat: 373, qjus: 378, volume: 375 },
  guarapiranga: { nome: 'Sistema Guarapiranga', titulo: 'Guarapiranga', chuva: 393, qnat: 397, qjus: 402, volume: 399 },
  alto_tiete: { nome: 'Sistema Alto Tietê', titulo: 'Sistema Alto Tietê', chuva: 345, qnat: 349, qjus: 354, volume: 351 },
  cotia: { nome: 'Sistema Alto Cotia', titulo: 'Sistema Alto Cotia', chuva: 381, qnat: 385, qjus: 390, volume: 387 },
  rio_grande: { nome: 'Sistema Rio Grande', titulo: 'Sistema Rio Grande', chuva: 429, qnat: 433, qjus: 438, volume: 435 },
  rio_claro: { nome: 'Sistema Rio Claro', titulo: 'Sistema Rio Claro', chuva: 417, qnat: 421, qjus: 426, volume: 423 },
};
/** "Histórico dos Sistemas Produtores" (Sistemas Sabesp RMSP): volume útil (%), vazão tratada (m³/s) e quantos anos mostrar. */
export const HISTORICO_PRODUTORES = { volume: 459, producao: 464, anos: 4 };

// --- Qualidade (CETESB/SIMQUA): os quatro reservatórios do modelo primeiro; depois os demais pontos
export type PontoQualidade = { codigo: string; local: string; simqua: number; subbacia: string; lat: number; lng: number; classe?: 'especial' | '2' };
export const PONTOS_QUALIDADE: PontoQualidade[] = [
  { codigo: 'EF08', local: 'Reservatório Guarapiranga', simqua: 7, subbacia: 'cotia_guarapiranga', lat: -23.6717, lng: -46.7267, classe: 'especial' },
  { codigo: 'EF07', local: 'Reservatório Billings — Rio Grande', simqua: 11, subbacia: 'billings_tamanduatei', lat: -23.7692, lng: -46.5331, classe: '2' },
  { codigo: 'EF20', local: 'Reservatório Taiaçupeba', simqua: 18, subbacia: 'cabeceiras', lat: -23.5764, lng: -46.2894, classe: 'especial' },
  { codigo: 'EF09', local: 'Reservatório Águas Claras', simqua: 9, subbacia: 'juqueri_cantareira', lat: -23.3981, lng: -46.6586, classe: 'especial' },
  { codigo: 'EF10', local: 'Reservatório Billings — Braço do Taquacetuba', simqua: 8, subbacia: 'cabeceiras', lat: -23.8436, lng: -46.6558, classe: '2' },
  { codigo: 'EF01', local: 'Rio Tietê', simqua: 2, subbacia: 'cabeceiras', lat: -23.5458, lng: -46.1347 },
  { codigo: 'EF29', local: 'Rio Tietê', simqua: 25, subbacia: 'penha_pinheiros', lat: -23.5014, lng: -46.5419 },
];
/** Enquadramento CONAMA 357/05 do quadro "Atendimento ao padrão de qualidade" ("especial" usa os limites da classe 1). */
export const CONAMA = {
  especial: { od_min: 6, ph_min: 6, ph_max: 9, turbidez_max: 40 },
  '2': { od_min: 5, ph_min: 6, ph_max: 9, turbidez_max: 100 },
};
export const PARAMETROS_QUALIDADE: Record<Parametro, { label: string; unidade: string; cor: string }> = {
  ph: { label: 'pH', unidade: '', cor: '#1B4F72' },
  od: { label: 'Oxigênio Dissolvido', unidade: 'mg/L', cor: '#148F77' },
  condutividade: { label: 'Condutividade Elétrica', unidade: 'µS/cm', cor: '#B9770E' },
  turbidez: { label: 'Turbidez', unidade: 'NTU', cor: '#7D6608' },
  temperatura: { label: 'Temperatura da Água', unidade: '°C', cor: '#922B21' },
};

// --- Boletim Exutórios
/** Automático (SSD): Reservatório Billings — Compartimento Pedreira. Pirapora não existe no SSD: entrada manual. */
export const EXUTORIO_PEDREIRA = { nome: 'Reservatório Billings (Compartimento Pedreira)', chuva: 177, afluente: 179, efluente: 187, volume: 183 };
/** Posição aproximada das barragens no mapa de localização. */
export const EXUTORIOS_MAPA = [
  { nome: 'Pirapora', lat: -23.3969, lng: -46.9985 },
  { nome: 'Billings (Pedreira)', lat: -23.704, lng: -46.669 },
];

// --- Boletim Chuva-Vazão: postos fluviométricos (código = alt_prefix ou prefixo no SIBH),
// na ordem e no agrupamento da tabela "Estatísticas básicas" do modelo
export const FLUVIOMETRIA_TABELA: [sub: string, codigos: string[]][] = [
  ['Cabeceiras', ['105', '168', '103', '703']],
  ['Penha / Pinheiros', ['623', '346', '844', '591', '589', '11', '283', '730', '6', '405', '527', '277', '1000360', '1000847']],
  ['Pinheiros / Pirapora', ['1000817']],
  ['Juqueri / Cantareira', ['290', '534', '237']],
  ['Billings / Tamanduateí', ['280', '1000430', '1000839']],
];
/** Hidrogramas (chuva + nível): uma página por posto. */
export const HIDROGRAMAS = [
  { codigo: '168', titulo: 'Rio Tietê' },
  { codigo: '346', titulo: 'Rio Tietê (Penha)' },
  { codigo: '283', titulo: 'Rio Tamanduateí' },
  { codigo: '277', titulo: 'Rio Pinheiros (Cid. Univer.)' },
  { codigo: '237', titulo: 'Rio Juqueri' },
];

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

const p2 = (n: number) => String(n).padStart(2, '0');
export const anoMes = (ano: number, mes: number) => `${ano}-${p2(mes)}`;
export const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
export const diasDoMes = (ano: number, mes: number) => Array.from({ length: diasNoMes(ano, mes) }, (_, i) => `${anoMes(ano, mes)}-${p2(i + 1)}`);
const mesFechado = (ano: number, mes: number) => anoMes(ano, mes) < hojeSp().slice(0, 7);
/** Mês corrente ainda em formação: 30 min; mês fechado: 12 h. */
const ttlMes = (ano: number, mes: number) => (mesFechado(ano, mes) ? 12 * 3600 : 30 * 60);

/** Série diária do mês: data → valor (null onde falta). */
export type SerieMes = Record<string, number | null>;

/**
 * Prazo comum de uma montagem de boletim: as fontes lentas (SIBH na primeira
 * consulta de um mês) que não responderem a tempo ficam como pendência — a
 * consulta continua em segundo plano e entra no cache para a próxima vez.
 */
export type Coleta = { prazo: Promise<null>; pendencias: Set<string> };
export const novaColeta = (ms = 75_000): Coleta => ({ prazo: new Promise<null>((ok) => setTimeout(ok, ms, null)), pendencias: new Set() });

async function noPrazo<T>(c: Coleta, rotulo: string, tarefa: Promise<T | null>): Promise<T | null> {
  const r = await Promise.race([tarefa.catch(() => null), c.prazo]);
  if (r === null) c.pendencias.add(rotulo);
  return r;
}

// ---------------------------------------------------------------------------
// SSD SP Águas
// ---------------------------------------------------------------------------

/** Série de um mês completo, com todos os dias. null = SSD indisponível. */
async function ssdMes(id: number, ano: number, mes: number): Promise<SerieMes | null> {
  const dias = diasDoMes(ano, mes);
  const r = await serie(id, dias[0]!, dias.at(-1)!).catch(() => null);
  if (!r?.ok) return null;
  const porDia = new Map(r.dados.pontos.map((p) => [p.data, p.valor]));
  return Object.fromEntries(dias.map((d) => [d, porDia.get(d) ?? null]));
}

/** Médias mensais de uma série diária, de janeiro de `anoIni` até `mesLimite` de `anoFim`: AAAA-MM → média. */
async function ssdMediasMensais(id: number, anoIni: number, anoFim: number, mesLimite: number): Promise<Record<string, number | null>> {
  const anos = Array.from({ length: anoFim - anoIni + 1 }, (_, i) => anoIni + i);
  const series = await Promise.all(
    anos.map((a) => {
      const ultimo = a === anoFim ? mesLimite : 12;
      return serie(id, `${a}-01-01`, `${anoMes(a, ultimo)}-${p2(diasNoMes(a, ultimo))}`).catch(() => null);
    }),
  );
  const medias: Record<string, number | null> = {};
  anos.forEach((a, i) => {
    const porMes = new Map<string, number[]>();
    const r = series[i];
    for (const p of r?.ok ? r.dados.pontos : []) porMes.set(p.data.slice(0, 7), [...(porMes.get(p.data.slice(0, 7)) ?? []), p.valor]);
    for (let m = 1; m <= (a === anoFim ? mesLimite : 12); m++) {
      const v = porMes.get(anoMes(a, m));
      medias[anoMes(a, m)] = v?.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
    }
  });
  return medias;
}

// ---------------------------------------------------------------------------
// SIBH: cadastro
// ---------------------------------------------------------------------------

/** Postos em operação da UGRHI 6, por tipo (1 = fluviométrico, 2 = pluviométrico), já com a sub-bacia. */
async function postosSibh(tipo: 1 | 2): Promise<Posto[] | null> {
  const l = await lembrar('sibh_boletim', `cadastro-operacao-tipo-${tipo}`, 12 * 3600, async () => {
    const lista = await buscarSibh(`stations?serializer=complete&station_type_id=${tipo}`, 40_000);
    if (!Array.isArray(lista)) throw new Error('cadastro do SIBH em formato inesperado');
    return postosAtivos(lista, 'operacao');
  });
  return l?.valor ?? null;
}

/** Posto pelo código do boletim: prefixo do SIBH ou, com preferência, o código alternativo (o dos boletins antigos). */
export function postoPorCodigo(postos: Posto[], codigo: string): Posto | null {
  const c = codigo.toLowerCase();
  return postos.find((p) => p.alt_prefix.toLowerCase() === c) ?? postos.find((p) => p.codigo.toLowerCase() === c) ?? null;
}

// ---------------------------------------------------------------------------
// Chuva por sub-bacia (SIBH)
// ---------------------------------------------------------------------------

export type MediaSubbacia = { media: number; postos: number };
export type ChuvaMes = Record<string, MediaSubbacia>;

/** Chuva diária de cada posto no mês, descartando leitura negativa ou acima do plausível: posto → (data → mm). */
export function chuvaDiaria(medidas: Medicao[], ano: number, mes: number): Map<string, Map<string, number>> {
  const prefixo = anoMes(ano, mes);
  const porPosto = new Map<string, Map<string, number>>();
  for (const [id, quando, valor] of medidas) {
    const data = dataIso(quando);
    if (valor === null || valor < 0 || valor > CHUVA_MAX_DIARIA_MM || !data?.startsWith(prefixo)) continue;
    if (!porPosto.has(id)) porPosto.set(id, new Map());
    const dias = porPosto.get(id)!;
    dias.set(data, (dias.get(data) ?? 0) + valor);
  }
  return porPosto;
}

/** Média por sub-bacia = média dos acumulados mensais dos postos com dado (zero é dado). */
export function mediasPorSubbacia(postos: Posto[], diario: Map<string, Map<string, number>>): ChuvaMes {
  const acumulados = new Map<string, number[]>();
  for (const p of postos) {
    const dias = diario.get(p.id_sibh);
    if (!dias) continue;
    const total = Math.round([...dias.values()].reduce((a, b) => a + b, 0) * 10) / 10;
    acumulados.set(p.subbacia, [...(acumulados.get(p.subbacia) ?? []), total]);
  }
  return Object.fromEntries([...acumulados].map(([slug, v]) => [slug, { media: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100, postos: v.length }]));
}

/** Intervalo do mês no horário de Brasília (UTC−3), como o SIBH espera (em UTC). */
function intervaloMes(ano: number, mes: number): { ini: number; fim: number } {
  return { ini: Date.UTC(ano, mes - 1, 1, 3), fim: Date.UTC(ano, mes, 1, 2, 59) };
}

/** Medições diárias de chuva de todos os postos do mês (lotes de 10). Lança se algum lote falhar, para não guardar média incompleta. */
async function medicoesChuvaMes(postos: Posto[], ano: number, mes: number): Promise<Medicao[]> {
  const { ini, fim } = intervaloMes(ano, mes);
  const ids = postos.map((p) => Number(p.id_sibh)).filter((n) => Number.isInteger(n) && n > 0);
  const pedidos: Record<string, Pedido> = {};
  for (let i = 0; i < ids.length; i += 10) {
    const lote = ids.slice(i, i + 10);
    pedidos[`chuva:${anoMes(ano, mes)}:${lote.join('-')}`] = { ids: lote, ini, fim, grupo: 'day', ttlSeg: ttlMes(ano, mes), timeoutMs: 120_000 };
  }
  const respostas = Object.values(await medicoes('sibh_boletim', pedidos));
  if (respostas.some((r) => r === null)) throw new Error('lotes do SIBH sem resposta');
  return respostas.flatMap((r) => r!);
}

const SEMENTE = historicoChuva as unknown as Record<string, Record<string, [media: number, postos: number]>>;

/**
 * Chuva média de cada sub-bacia num mês. Meses fechados já calculados pelo
 * sistema anterior vêm de src/conteudo/ugrhi6-chuva-historica.json (mesma
 * regra, mesma fonte); os demais são calculados no SIBH e guardados por
 * 30 dias (mês fechado) ou 30 min (mês corrente).
 */
export async function chuvaSubbaciasMes(ano: number, mes: number): Promise<ChuvaMes | null> {
  const semente = mesFechado(ano, mes) ? SEMENTE[anoMes(ano, mes)] : undefined;
  if (semente) return Object.fromEntries(Object.entries(semente).map(([slug, [media, postos]]) => [slug, { media, postos }]));
  const l = await lembrar('sibh_boletim', `chuva-subbacias:${anoMes(ano, mes)}`, mesFechado(ano, mes) ? 30 * 86_400 : 30 * 60, async () => {
    const postos = await postosSibh(2);
    if (!postos) throw new Error('cadastro do SIBH indisponível');
    return mediasPorSubbacia(postos, chuvaDiaria(await medicoesChuvaMes(postos, ano, mes), ano, mes));
  });
  return l?.valor ?? null;
}

export type LinhaChuva = { slug: string; nome: string; atual: number | null; minima: number | null; media: number | null; maxima: number | null };

/**
 * Linha da tabela de chuva de uma sub-bacia: o mês do boletim e a mínima, a
 * média e a máxima do mesmo mês em toda a série do SIBH (desde 2015).
 */
export function linhaChuva(slug: string, atual: ChuvaMes | null, porAno: Map<number, ChuvaMes>): LinhaChuva {
  const serie = [...porAno.values()].map((subs) => subs[slug]?.media).filter((v): v is number => v !== undefined);
  return {
    slug, nome: SUBBACIAS[slug]!.replace(/[–-]/g, '/'), atual: atual?.[slug]?.media ?? null,
    minima: serie.length ? Math.min(...serie) : null,
    media: serie.length ? serie.reduce((a, b) => a + b, 0) / serie.length : null,
    maxima: serie.length ? Math.max(...serie) : null,
  };
}

// ---------------------------------------------------------------------------
// Nível e vazão (SIBH, leituras de 10 min)
// ---------------------------------------------------------------------------

/** Leitura de 10 min: horário de Brasília ("AAAA-MM-DD HH:MM"), nível (m) e vazão (m³/s). */
export type Leitura = { t: string; nivel: number | null; vazao: number | null };
export type Estat = { media: number; maximo: number; minimo: number; quantidade: number };
export type Permanencia = Record<'normal' | 'atencao' | 'alerta' | 'emergencia' | 'extravasamento', number>;

/** Medições do SIBH (UTC, nível em cm) → leituras em metros e horário de Brasília, em ordem. */
export function leituras(medidas: Medicao[]): Leitura[] {
  return medidas
    .map(([, quando, valor, vazao]) => ({ ms: instante(quando), nivel: valor === null ? null : Math.round(valor * 10) / 1000, vazao }))
    .filter((l) => !Number.isNaN(l.ms))
    .sort((a, b) => a.ms - b.ms)
    .map(({ ms, nivel, vazao }) => ({ t: new Date(ms - 3 * 3_600_000).toISOString().slice(0, 16).replace('T', ' '), nivel, vazao }));
}

const estat = (v: number[]): Estat | null =>
  v.length ? { media: v.reduce((a, b) => a + b, 0) / v.length, maximo: v.reduce((a, b) => Math.max(a, b)), minimo: v.reduce((a, b) => Math.min(a, b)), quantidade: v.length } : null;

/** Estatísticas do mês: nível, vazão (quando o posto mede) e % do tempo em cada faixa das cotas de referência. */
export function estatisticasNivel(lista: Leitura[], cotas: Cotas | null): { nivel: Estat | null; vazao: Estat | null; permanencia: Permanencia | null } {
  const niveis = lista.map((l) => l.nivel).filter((v): v is number => v !== null);
  const vazoes = lista.map((l) => l.vazao).filter((v): v is number => v !== null);
  let permanencia: Permanencia | null = null;
  if (niveis.length && cotas && cotas.atencao !== null) {
    const cont: Permanencia = { normal: 0, atencao: 0, alerta: 0, emergencia: 0, extravasamento: 0 };
    for (const n of niveis) {
      if (cotas.extravasamento !== null && n >= cotas.extravasamento) cont.extravasamento++;
      else if (cotas.emergencia !== null && n >= cotas.emergencia) cont.emergencia++;
      else if (cotas.alerta !== null && n >= cotas.alerta) cont.alerta++;
      else if (n >= cotas.atencao) cont.atencao++;
      else cont.normal++;
    }
    permanencia = Object.fromEntries(Object.entries(cont).map(([k, v]) => [k, (v / niveis.length) * 100])) as Permanencia;
  }
  return { nivel: estat(niveis), vazao: estat(vazoes), permanencia };
}

export type ResumoChuva = { diario: Record<string, number>; acumulada: number | null; maxima_diaria: number | null; dias_com_chuva: number; media_dias_com_chuva: number | null };

/** Resumo da chuva diária do pluviômetro do mesmo local (quadro do hidrograma). */
export function resumoChuva(dias: Map<string, number> | undefined): ResumoChuva {
  const diario = Object.fromEntries([...(dias ?? [])].sort(([a], [b]) => (a < b ? -1 : 1)));
  const v = Object.values(diario);
  const comChuva = v.filter((x) => x > 0);
  const soma = (l: number[]) => l.reduce((a, b) => a + b, 0);
  return {
    diario, acumulada: v.length ? soma(v) : null, maxima_diaria: v.length ? Math.max(...v) : null,
    dias_com_chuva: comChuva.length, media_dias_com_chuva: comChuva.length ? soma(comChuva) / comChuva.length : null,
  };
}

// ---------------------------------------------------------------------------
// Dados de cada boletim
// ---------------------------------------------------------------------------

export type PostoFlu = {
  sub: string;
  codigo: string;
  posto: Posto | null;
  /** null = leituras ainda não chegaram do SIBH. */
  leituras: Leitura[] | null;
  cotas: Cotas | null;
};

export type DadosChuvaVazao = {
  /** `periodo`: anos da série usados na mínima, média e máxima (ex.: "2015 a 2026"). */
  chuva: { linhas: LinhaChuva[]; periodo: string };
  fluviometria: PostoFlu[];
  hidrogramas: { codigo: string; titulo: string; chuva: ResumoChuva }[];
  mapa: { pluviometria: Posto[]; fluviometria: Posto[] };
};

export async function dadosChuvaVazao(ano: number, mes: number, c: Coleta): Promise<DadosChuvaVazao> {
  const hoje = hojeSp();
  const anos: number[] = [];
  for (let a = INICIO_SERIE_SIBH; a <= Number(hoje.slice(0, 4)); a++) if (mesFechado(a, mes)) anos.push(a);

  const [pluviometros, fluviometros, atual, ...historico] = await Promise.all([
    noPrazo(c, 'cadastro de pluviômetros do SIBH', postosSibh(2)),
    noPrazo(c, 'cadastro de postos fluviométricos do SIBH', postosSibh(1)),
    noPrazo(c, `chuva de ${MESES[mes - 1]}/${ano} (SIBH)`, chuvaSubbaciasMes(ano, mes)),
    ...anos.map((a) => noPrazo(c, `chuva de ${MESES[mes - 1]} de ${a} (SIBH)`, chuvaSubbaciasMes(a, mes))),
  ]);
  const porAno = new Map<number, ChuvaMes>();
  anos.forEach((a, i) => historico[i] && porAno.set(a, historico[i]!));
  const rotulo = (l: number[]) => (l.length ? `${l[0]} a ${l.at(-1)}` : '—');
  const comDado = [...porAno.keys()];

  // Postos fluviométricos da tabela e pluviômetros dos hidrogramas
  const codigos = FLUVIOMETRIA_TABELA.flatMap(([sub, lista]) => lista.map((codigo) => ({ sub, codigo })));
  const localizados = codigos.map((x) => ({ ...x, posto: fluviometros ? postoPorCodigo(fluviometros, x.codigo) : null }));
  const ids = localizados.map((x) => Number(x.posto?.id_sibh)).filter((n) => Number.isInteger(n) && n > 0);
  const { ini, fim } = intervaloMes(ano, mes);
  const chave = (id: number | string) => `10min:${anoMes(ano, mes)}:${id}`;
  const pluvHidro = HIDROGRAMAS.map((h) => (pluviometros ? postoPorCodigo(pluviometros, h.codigo) : null));
  const idsPluv = pluvHidro.map((p) => Number(p?.id_sibh)).filter((n) => Number.isInteger(n) && n > 0);

  const [cotas, chuvaPostos, ...porPosto] = await Promise.all([
    ids.length ? noPrazo(c, 'cotas de referência (SIBH)', cotasAlerta('sibh_boletim', ids)) : null,
    idsPluv.length
      ? noPrazo(c, 'chuva dos postos dos hidrogramas (SIBH)', medicoes('sibh_boletim', { [`chuva-hidro:${anoMes(ano, mes)}`]: { ids: idsPluv, ini, fim, grupo: 'day', ttlSeg: ttlMes(ano, mes), timeoutMs: 120_000 } }).then((r) => Object.values(r)[0] ?? null))
      : null,
    // um posto por consulta: um mês de leituras de 10 min tem cerca de 2 MB
    ...ids.map((id) =>
      noPrazo(c, `leituras de 10 min do posto ${localizados.find((x) => x.posto?.id_sibh === String(id))?.codigo} (SIBH)`,
        medicoes('sibh_boletim', { [chave(id)]: { ids: [id], ini, fim, grupo: 'minute', ttlSeg: ttlMes(ano, mes), timeoutMs: 120_000 } }).then((r) => r[chave(id)] ?? null)),
    ),
  ]);
  const leiturasPorId = new Map(ids.map((id, i) => [String(id), porPosto[i] ? leituras(porPosto[i]!) : null]));
  const diario = chuvaDiaria(chuvaPostos ?? [], ano, mes);

  return {
    chuva: {
      linhas: ORDEM_SUBBACIAS.map((slug) => linhaChuva(slug, atual, porAno)),
      periodo: rotulo(comDado),
    },
    fluviometria: localizados.map((x) => ({
      ...x,
      leituras: x.posto ? (leiturasPorId.get(x.posto.id_sibh) ?? null) : null,
      cotas: (x.posto && cotas?.[x.posto.id_sibh]) || null,
    })),
    hidrogramas: HIDROGRAMAS.map((h, i) => ({ ...h, chuva: resumoChuva(pluvHidro[i] ? diario.get(pluvHidro[i]!.id_sibh) : undefined) })),
    mapa: { pluviometria: pluviometros ?? [], fluviometria: fluviometros ?? [] },
  };
}

export type SeriesReservatorio = Record<'chuva' | 'afluente' | 'efluente' | 'volume', SerieMes>;

export type DadosMananciais = {
  sistemas: { slug: string; nome: string; titulo: string; series: Record<'chuva' | 'qnat' | 'qjus' | 'volume', SerieMes | null> }[];
  historico: { anoIni: number; volume: Record<string, number | null>; producao: Record<string, number | null> };
  qualidade: { ponto: PontoQualidade; medias: MediasDiarias | null }[];
};

export async function dadosMananciais(ano: number, mes: number, c: Coleta): Promise<DadosMananciais> {
  const anoIni = ano - HISTORICO_PRODUTORES.anos + 1;
  const [sistemas, volume, producao, qualidade] = await Promise.all([
    Promise.all(
      Object.entries(MANANCIAIS).map(async ([slug, s]) => {
        const [chuva, qnat, qjus, vol] = await Promise.all([s.chuva, s.qnat, s.qjus, s.volume].map((id) => noPrazo(c, `${s.nome} (SSD)`, ssdMes(id, ano, mes))));
        return { slug, nome: s.nome, titulo: s.titulo, series: { chuva: chuva ?? null, qnat: qnat ?? null, qjus: qjus ?? null, volume: vol ?? null } };
      }),
    ),
    noPrazo(c, 'histórico de volume dos sistemas (SSD)', ssdMediasMensais(HISTORICO_PRODUTORES.volume, anoIni, ano, mes)),
    noPrazo(c, 'histórico de produção dos sistemas (SSD)', ssdMediasMensais(HISTORICO_PRODUTORES.producao, anoIni, ano, mes)),
    Promise.all(
      PONTOS_QUALIDADE.map(async (ponto) => {
        const r = await noPrazo(c, `qualidade em ${ponto.codigo} (SIMQUA)`, mediasDiarias(ponto.simqua, ano, mes).then((d) => (d.ok ? d.dados : null)));
        return { ponto, medias: r };
      }),
    ),
  ]);
  return { sistemas, historico: { anoIni, volume: volume ?? {}, producao: producao ?? {} }, qualidade };
}

/** Dados digitados dos exutórios (sem fonte automática). */
export type DiaReservatorio = Partial<Record<'chuva' | 'afluente' | 'efluente' | 'volume', number | null>>;
export type CargaMes = Partial<Record<'q_pinheiros' | 'q_tiete' | 'dbo_pinheiros' | 'dbo_tiete', number | null>>;
export type ManuaisExutorios = { pedreira: Record<string, DiaReservatorio>; pirapora: Record<string, DiaReservatorio>; cargas: Record<string, CargaMes> };

export type DadosExutorios = {
  /** Billings/Pedreira no SSD (null = sem dados no SSD para o mês). */
  pedreira: SeriesReservatorio | null;
  manuais: ManuaisExutorios;
};

export async function dadosExutorios(ano: number, mes: number, manuais: ManuaisExutorios, c: Coleta): Promise<DadosExutorios> {
  const e = EXUTORIO_PEDREIRA;
  const [chuva, afluente, efluente, volume] = await Promise.all([e.chuva, e.afluente, e.efluente, e.volume].map((id) => noPrazo(c, 'Billings/Pedreira (SSD)', ssdMes(id, ano, mes))));
  const series = chuva && afluente && efluente && volume ? { chuva, afluente, efluente, volume } : null;
  const temDado = series && Object.values(series).some((s) => Object.values(s).some((v) => v !== null));
  return { pedreira: temDado ? series : null, manuais };
}

/** Carga (t/dia) = vazão (m³/s) × DBO (mg/L) × 0,0864. */
export function cargaMes(m: CargaMes | undefined): { pinheiros: number | null; tiete: number | null; total: number | null } {
  const carga = (q?: number | null, dbo?: number | null) => (q == null || dbo == null ? null : q * dbo * 0.0864);
  const pinheiros = carga(m?.q_pinheiros, m?.dbo_pinheiros);
  const tiete = carga(m?.q_tiete, m?.dbo_tiete);
  return { pinheiros, tiete, total: pinheiros === null && tiete === null ? null : (pinheiros ?? 0) + (tiete ?? 0) };
}

export { PARAMETROS };

// ---------------------------------------------------------------------------
// Cadastro manual dos exutórios: leitura do que é colado da planilha
// ---------------------------------------------------------------------------

/** "1.234,5" / "12,3" / "12.3" → número; vazio ou inválido → null. */
export function numeroBr(v: string | null | undefined): number | null {
  let s = (v ?? '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
}

/**
 * Linhas "dd/mm/aaaa;chuva;afluente;efluente;volume" (ponto e vírgula ou
 * tabulação; vírgula decimal). Linhas de outro mês são ignoradas.
 */
export function interpretarReservatorio(texto: string, ano: number, mes: number): Record<string, DiaReservatorio> {
  const dias: Record<string, DiaReservatorio> = {};
  for (const linha of texto.split(/\r\n|\r|\n/)) {
    const c = linha.trim().split(/[;\t]/);
    if (c.length < 5) continue;
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(c[0]!.trim());
    const data = br ? `${br[3]}-${p2(Number(br[2]))}-${p2(Number(br[1]))}` : /^\d{4}-\d{2}-\d{2}$/.test(c[0]!.trim()) ? c[0]!.trim() : null;
    if (!data || !diasDoMes(ano, mes).includes(data)) continue;
    dias[data] = { chuva: numeroBr(c[1]), afluente: numeroBr(c[2]), efluente: numeroBr(c[3]), volume: numeroBr(c[4]) };
  }
  return dias;
}

/** Linhas "aaaa;mm;q_pinheiros;q_tiete;dbo_pinheiros;dbo_tiete" para importar o histórico de uma vez (campo vazio = sem amostragem). */
export function interpretarCargas(texto: string): Record<string, CargaMes> {
  const meses: Record<string, CargaMes> = {};
  for (const linha of texto.split(/\r\n|\r|\n/)) {
    const c = linha.trim().split(/[;\t]/).map((x) => x.trim());
    if (c.length < 6 || !/^\d{4}$/.test(c[0]!) || !/^\d{1,2}$/.test(c[1]!)) continue;
    const [ano, mes] = [Number(c[0]), Number(c[1])];
    if (ano < 2000 || mes < 1 || mes > 12) continue;
    meses[anoMes(ano, mes)] = { q_pinheiros: numeroBr(c[2]), q_tiete: numeroBr(c[3]), dbo_pinheiros: numeroBr(c[4]), dbo_tiete: numeroBr(c[5]) };
  }
  return meses;
}

/** Ano e mês pedidos (de `anoMin` até o ano corrente); fora disso, o padrão informado. */
export function periodoBoletim(ano: unknown, mes: unknown, padrao: { ano: number; mes: number }, anoMin = 2015): { ano: number; mes: number } {
  const inteiro = (v: unknown, min: number, max: number, p: number) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v) : NaN;
    return Number.isInteger(n) && n >= min && n <= max ? n : p;
  };
  return { ano: inteiro(ano, anoMin, Number(hojeSp().slice(0, 4)), padrao.ano), mes: inteiro(mes, 1, 12, padrao.mes) };
}

/** Último mês encerrado (o mês corrente ainda está incompleto). */
export function ultimoMesFechado(): { ano: number; mes: number } {
  const [a, m] = hojeSp().split('-').map(Number) as [number, number];
  return m === 1 ? { ano: a - 1, mes: 12 } : { ano: a, mes: m - 1 };
}
