import geojson from '@/conteudo/ugrhi6-subbacias.json';
import { lembrar } from '../integracoes/cache';
import { hojeSp } from '../integracoes/comum';
import { buscarSibh, medicoes, type Medicao } from '../integracoes/sibh-medicoes';

/**
 * Rede pluviométrica completa da UGRHI 6 — Alto Tietê (porte de
 * acesso/boletim_spaguas_cetesb/includes/rede_pluviometrica.php): cadastro
 * dinâmico dos postos ativos no SIBH, cada um associado à sub-bacia pelo
 * limite oficial (ponto no polígono), e o acumulado do mês a partir das
 * medições diárias. Tudo vem do SIBH; posto sem medição fica "sem dados",
 * nunca zero.
 */

export const SALA_CETESB = 'cetesb';
export const PERMISSAO_CETESB = 'criar_boletim';

/** Quantidade de postos ativos que a Sala toma como referência para a rede. */
export const POSTOS_ESPERADOS = 373;
const CAMINHO_ESTACOES = 'stations?serializer=complete&station_type_id=2';
const UGRHI = 6;
/** O SIBH aceita no máximo 10 postos por consulta; cada lote falha sozinho. */
const POSTOS_POR_LOTE = 10;
/** Quanto a consulta do mês espera pelos lotes antes de responder com o que já chegou. */
const PRAZO_MS = 90_000;

/** Sub-bacias da UGRHI 6, na ordem do boletim. */
export const SUBBACIAS: Record<string, string> = {
  cabeceiras: 'Cabeceiras',
  juqueri_cantareira: 'Juqueri–Cantareira',
  penha_pinheiros: 'Penha–Pinheiros',
  pinheiros_pirapora: 'Pinheiros–Pirapora',
  cotia_guarapiranga: 'Cotia–Guarapiranga',
  billings_tamanduatei: 'Billings–Tamanduateí',
};

// ---------------------------------------------------------------------------
// Sub-bacia de um ponto (limite oficial, simplificado a ~30 m)
// ---------------------------------------------------------------------------

type Anel = number[][];
type Area = { slug: string; poligonos: Anel[][]; minX: number; maxX: number; minY: number; maxY: number };

/** Nome da sub-bacia no arquivo de limites → identificador usado no boletim. */
function slugDoNome(nome: string): string | null {
  const n = nome.toLowerCase();
  if (n.includes('cabece')) return 'cabeceiras';
  if (n.includes('cotia') && n.includes('guarap')) return 'cotia_guarapiranga';
  if (n.includes('juqueri') && n.includes('cantar')) return 'juqueri_cantareira';
  if (n.includes('penha') && n.includes('pinheiros')) return 'penha_pinheiros';
  if (n.includes('pinheiros') && n.includes('pirapora')) return 'pinheiros_pirapora';
  if (n.includes('billings') && n.includes('tamandu')) return 'billings_tamanduatei';
  return null;
}

let indice: Area[] | undefined;
function areas(): Area[] {
  if (indice) return indice;
  indice = [];
  type Feicao = { properties: { nome_dashboard?: string; SRH_NM?: string }; geometry: { type: string; coordinates: unknown } };
  for (const f of (geojson as unknown as { features: Feicao[] }).features) {
    const slug = slugDoNome(f.properties.nome_dashboard ?? f.properties.SRH_NM ?? '');
    if (!slug) continue;
    const poligonos = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []) as Anel[][];
    const pontos = poligonos.flat(2);
    if (!pontos.length) continue;
    const xs = pontos.map((p) => p[0]!);
    const ys = pontos.map((p) => p[1]!);
    const [minX, maxX, minY, maxY] = [xs, ys].flatMap((v) => v.reduce(([a, b], n) => [Math.min(a!, n), Math.max(b!, n)], [Infinity, -Infinity])) as [number, number, number, number];
    indice.push({ slug, poligonos, minX, maxX, minY, maxY });
  }
  return indice;
}

function noAnel(lng: number, lat: number, anel: Anel): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i] as [number, number];
    const [xj, yj] = anel[j] as [number, number];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) dentro = !dentro;
  }
  return dentro;
}

/**
 * Sub-bacia do ponto: a do polígono que o contém; se nenhum contém (posto
 * limítrofe), a de centro mais próximo — `metodo` diz qual das duas.
 */
export function subbaciaDoPonto(lng: number, lat: number): { slug: string; metodo: 'poligono' | 'mais_proxima' } | null {
  let proxima: string | null = null;
  let menor = Infinity;
  for (const a of areas()) {
    // o teste caro (ponto no polígono) só roda dentro da caixa da sub-bacia
    if (lng >= a.minX && lng <= a.maxX && lat >= a.minY && lat <= a.maxY) {
      const dentro = a.poligonos.some((p) => p[0] && noAnel(lng, lat, p[0]) && !p.slice(1).some((buraco) => noAnel(lng, lat, buraco)));
      if (dentro) return { slug: a.slug, metodo: 'poligono' };
    }
    const d = (lng - (a.minX + a.maxX) / 2) ** 2 + (lat - (a.minY + a.maxY) / 2) ** 2;
    if (d < menor) [menor, proxima] = [d, a.slug];
  }
  return proxima ? { slug: proxima, metodo: 'mais_proxima' } : null;
}

// ---------------------------------------------------------------------------
// Cadastro dos postos ativos
// ---------------------------------------------------------------------------

export type Posto = {
  id_sibh: string;
  codigo: string;
  nome: string;
  municipio: string;
  proprietario: string;
  /** Código alternativo do posto no SIBH (o que os boletins antigos usavam). */
  alt_prefix: string;
  situacao_posto: 'ativo';
  subbacia: string;
  subbacia_nome: string;
  lat: number;
  lng: number;
  classificacao_espacial: 'poligono' | 'mais_proxima';
};

const texto = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const coordenada = (v: unknown) => (texto(v) === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Postos pluviométricos ativos do Alto Tietê, a partir do cadastro completo do
 * SIBH: ativo é o posto com transmissão "ok"; entra o que é da UGRHI 6 (ou,
 * sem UGRHI no cadastro, o que cai dentro de um polígono de sub-bacia). Com
 * o critério "operacao" vale a regra dos boletins mensais: posto em operação
 * no cadastro (transmitindo ou não) e dentro de um polígono de sub-bacia.
 */
export function postosAtivos(cadastro: unknown[], criterio: 'transmissao' | 'operacao' = 'transmissao'): Posto[] {
  const postos: Posto[] = [];
  const vistos = new Set<string>();
  for (const bruto of cadastro) {
    if (!bruto || typeof bruto !== 'object') continue;
    const e = bruto as Record<string, unknown>;
    if (criterio === 'operacao') {
      // regra dos boletins mensais: posto em operação no cadastro, com ou sem transmissão em dia
      if (texto(e.operation_status) !== '1') continue;
    } else {
      const transmissao = texto(e.transmission_status).toLowerCase();
      if (transmissao !== '' && transmissao !== 'ok') continue;
      if (['0', 'false', 'nao', 'não'].includes(texto(e.operation_status).toLowerCase())) continue;
    }
    const lat = coordenada(e.latitude);
    const lng = coordenada(e.longitude);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const ugrhi = texto(e.ugrhi_cod);
    if (ugrhi !== '' && Number(ugrhi) !== UGRHI) continue;
    const sub = subbaciaDoPonto(lng, lat);
    if (!sub || ((ugrhi === '' || criterio === 'operacao') && sub.metodo !== 'poligono')) continue;
    const id = texto(e.id);
    const codigo = texto(e.prefix) || id;
    const unico = id ? `id:${id}` : `geo:${codigo}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
    if (vistos.has(unico)) continue;
    vistos.add(unico);
    postos.push({
      id_sibh: id, codigo, nome: texto(e.name) || codigo || 'Posto SIBH', municipio: texto(e.city_name), proprietario: texto(e.station_owner),
      alt_prefix: texto(e.alt_prefix), situacao_posto: 'ativo', subbacia: sub.slug, subbacia_nome: SUBBACIAS[sub.slug]!, lat, lng, classificacao_espacial: sub.metodo,
    });
  }
  return postos.sort((a, b) => (a.subbacia_nome < b.subbacia_nome ? -1 : a.subbacia_nome > b.subbacia_nome ? 1 : a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Consolidação mensal
// ---------------------------------------------------------------------------

export type PostoMensal = Posto & {
  acumulado_mensal: number | null;
  registros_validos: number;
  dias_com_dados: number;
  dias_com_chuva: number;
  maior_chuva_diaria: number | null;
  data_maior_chuva: string | null;
  media_diaria: number | null;
  situacao_dados: 'completo' | 'parcial' | 'sem_dados';
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** "2026/10/05" (agrupamento diário do SIBH), ISO ou "05/10/2026" → AAAA-MM-DD. */
export function dataIso(valor: string): string | null {
  let m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(valor.trim());
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(valor.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Junta as medições diárias aos postos: acumulado, maior chuva diária, dias com dado e situação. */
export function consolidar(postos: Posto[], medidas: Medicao[], ano: number, mes: number): PostoMensal[] {
  const prefixoMes = `${ano}-${String(mes).padStart(2, '0')}`;
  const diarios = new Map<string, Map<string, number[]>>();
  for (const [id, quando, valor] of medidas) {
    const data = dataIso(quando);
    if (valor === null || valor < 0 || data === null || !data.startsWith(prefixoMes)) continue;
    if (!diarios.has(id)) diarios.set(id, new Map());
    const dias = diarios.get(id)!;
    dias.set(data, [...(dias.get(data) ?? []), valor]);
  }
  const total = diasNoMes(ano, mes);
  return postos.map((p): PostoMensal => {
    const dias = p.id_sibh ? diarios.get(p.id_sibh) : undefined;
    if (!dias) {
      return { ...p, acumulado_mensal: null, registros_validos: 0, dias_com_dados: 0, dias_com_chuva: 0, maior_chuva_diaria: null, data_maior_chuva: null, media_diaria: null, situacao_dados: 'sem_dados' };
    }
    let acumulado = 0;
    let registros = 0;
    let comChuva = 0;
    let maior: number | null = null;
    let dataMaior: string | null = null;
    for (const [data, valores] of dias) {
      const dia = valores.reduce((a, b) => a + b, 0);
      registros += valores.length;
      acumulado += dia;
      if (dia > 0) comChuva++;
      if (maior === null || dia > maior) [maior, dataMaior] = [dia, data];
    }
    return {
      ...p, acumulado_mensal: r1(acumulado), registros_validos: registros, dias_com_dados: dias.size, dias_com_chuva: comChuva,
      maior_chuva_diaria: maior === null ? null : r1(maior), data_maior_chuva: dataMaior, media_diaria: r1(acumulado / dias.size),
      situacao_dados: dias.size >= total ? 'completo' : 'parcial',
    };
  });
}

/** Indicadores de um conjunto de postos; só entram na média, mínima e máxima os que têm dado (zero é dado). */
export function estatisticas(postos: PostoMensal[]) {
  const validos = postos.filter((p) => p.acumulado_mensal !== null);
  const soma = validos.reduce((a, p) => a + p.acumulado_mensal!, 0);
  let min: PostoMensal | null = null;
  let max: PostoMensal | null = null;
  for (const p of validos) {
    if (!min || p.acumulado_mensal! < min.acumulado_mensal!) min = p;
    if (!max || p.acumulado_mensal! > max.acumulado_mensal!) max = p;
  }
  const ref = (p: PostoMensal | null) => (p ? { codigo: p.codigo, nome: p.nome } : null);
  return {
    postos_total: postos.length,
    postos_com_dados: validos.length,
    postos_sem_dados: postos.length - validos.length,
    cobertura_percentual: postos.length ? r1((validos.length * 100) / postos.length) : 0,
    media: validos.length ? r1(soma / validos.length) : null,
    minima: min ? r1(min.acumulado_mensal!) : null,
    posto_minimo: ref(min),
    maxima: max ? r1(max.acumulado_mensal!) : null,
    posto_maximo: ref(max),
    total_rede: r1(soma),
  };
}

// ---------------------------------------------------------------------------
// Consulta ao SIBH
// ---------------------------------------------------------------------------

/** Ano (2015 até o corrente) e mês pedidos; fora disso, o ano e o mês de hoje. */
export function periodoPedido(ano: string | null, mes: string | null): { ano: number; mes: number } {
  const hoje = hojeSp();
  const [anoAtual, mesAtual] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))];
  const inteiro = (v: string | null, min: number, max: number, padrao: number) => {
    const n = v !== null && /^\d{1,4}$/.test(v.trim()) ? Number(v) : NaN;
    return n >= min && n <= max ? n : padrao;
  };
  return { ano: inteiro(ano, 2015, anoAtual, anoAtual), mes: inteiro(mes, 1, 12, mesAtual) };
}

/** Rede do mês: postos com o acumulado, indicadores da bacia e de cada sub-bacia, e avisos de conferência. */
export async function redeMensal(ano: number, mes: number) {
  const cadastro = await lembrar('sibh_rede', 'cadastro-ugrhi6', 6 * 3600, async () => {
    const lista = await buscarSibh(CAMINHO_ESTACOES, 30_000);
    if (!Array.isArray(lista)) throw new Error('cadastro do SIBH em formato inesperado');
    return postosAtivos(lista);
  });
  if (!cadastro) throw new Error('Cadastro do SIBH indisponível.');
  const postos = cadastro.valor;

  // Mês corrente ainda em formação: 30 min; mês fechado: 12 h.
  const mesCorrente = hojeSp().startsWith(`${ano}-${String(mes).padStart(2, '0')}`);
  const ini = Date.UTC(ano, mes - 1, 1);
  const fim = Date.UTC(ano, mes, 1) - 1000;
  const ids = postos.map((p) => Number(p.id_sibh)).filter((n) => Number.isInteger(n) && n > 0);
  const pedidos: Record<string, { ids: number[]; ini: number; fim: number; grupo: 'day'; ttlSeg: number; timeoutMs: number }> = {};
  for (let i = 0; i < ids.length; i += POSTOS_POR_LOTE) {
    const lote = ids.slice(i, i + POSTOS_POR_LOTE);
    pedidos[`${ano}-${mes}:${lote.join('-')}`] = { ids: lote, ini, fim, grupo: 'day', ttlSeg: mesCorrente ? 30 * 60 : 12 * 3600, timeoutMs: 120_000 };
  }
  // A primeira consulta de um mês leva ~12 s por lote no SIBH (depois ele guarda a resposta).
  // Passado o prazo, devolve o que chegou; os lotes pendentes terminam em segundo plano e
  // ficam no cache para a próxima atualização da página.
  const prazo = new Promise<null>((ok) => setTimeout(ok, PRAZO_MS, null));
  const respostas = await Promise.all(
    Object.entries(pedidos).map(([chave, p]) => Promise.race([medicoes('sibh_rede', { [chave]: p }).then((r) => r[chave] ?? null), prazo])),
  );
  const respondidos = respostas.filter((r) => r !== null).length;

  const mensais = consolidar(postos, respostas.flatMap((r) => r ?? []), ano, mes);
  const dias = diasNoMes(ano, mes);
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}`;
  const metadados = {
    fonte: 'SP-Águas/SIBH API v2',
    consultado_em: cadastro.obtidoEm.toISOString(),
    postos_encontrados: postos.length,
    postos_esperados: POSTOS_ESPERADOS,
    divergencia: postos.length !== POSTOS_ESPERADOS,
    postos_associados_por_proximidade: postos.filter((p) => p.classificacao_espacial !== 'poligono').length,
    ano, mes, inicio: `${prefixo}-01`, fim: `${prefixo}-${String(dias).padStart(2, '0')}`,
    lotes_total: respostas.length, lotes_respondidos: respondidos, consulta_parcial: respondidos < respostas.length,
  };
  const avisos: string[] = [];
  if (metadados.divergencia) avisos.push(`Foram identificados ${postos.length} postos ativos; o esperado é ${POSTOS_ESPERADOS}.`);
  if (metadados.consulta_parcial) {
    avisos.push(
      `O SIBH respondeu ${respondidos} de ${respostas.length} lotes de medições até agora (a primeira consulta de um mês leva alguns minutos). ` +
        'Os postos dos lotes pendentes aparecem como "sem dados"; clique em Atualizar daqui a pouco para completar.',
    );
  }
  return {
    ok: true,
    periodo: { ano, mes, dias },
    metadados,
    estatisticas: estatisticas(mensais),
    subbacias: Object.entries(SUBBACIAS).map(([slug, nome]) => ({ slug, nome, estatisticas: estatisticas(mensais.filter((p) => p.subbacia === slug)) })),
    postos: mensais,
    avisos,
  };
}

export type RedeMensal = Awaited<ReturnType<typeof redeMensal>>;

/** Planilha da rede (CSV com ponto e vírgula e vírgula decimal, como o Excel em português abre). */
export function csvRede(d: RedeMensal): string {
  const celula = (v: string | number | null) => {
    const t = typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '');
    return /[;"\s]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const linhas = [
    ['Código', 'Nome', 'Município', 'Sub-bacia', 'Latitude', 'Longitude', 'Situação do posto', 'Acumulado mensal (mm)', 'Maior chuva diária (mm)', 'Data da maior chuva', 'Dias com dados', 'Dias com chuva', 'Registros válidos', 'Situação dos dados'],
    ...d.postos.map((p) => [p.codigo, p.nome, p.municipio, p.subbacia_nome, p.lat, p.lng, p.situacao_posto, p.acumulado_mensal, p.maior_chuva_diaria, p.data_maior_chuva, String(p.dias_com_dados), String(p.dias_com_chuva), String(p.registros_validos), p.situacao_dados]),
  ];
  return `﻿${linhas.map((l) => l.map(celula).join(';')).join('\n')}\n`;
}

/** Conferência operacional da rede (api/validacao_pluviometria.php). */
export function validacaoRede(d: RedeMensal) {
  const ids = d.postos.map((p) => p.id_sibh).filter(Boolean);
  const somaSubs = d.subbacias.reduce((a, s) => a + s.estatisticas.postos_total, 0);
  return {
    ok: true,
    periodo: d.periodo,
    validacao: {
      cadastro_esperado: POSTOS_ESPERADOS, cadastro_encontrado: d.postos.length, quantidade_confere: d.postos.length === POSTOS_ESPERADOS,
      ids_duplicados: ids.length - new Set(ids).size, todos_associados_subbacia: true, postos_sem_subbacia: 0,
      soma_postos_subbacias: somaSubs, subbacias_conferem_com_total: somaSubs === d.postos.length,
      postos_com_dados: d.estatisticas.postos_com_dados, postos_sem_dados: d.estatisticas.postos_sem_dados,
      zero_diferenciado_de_sem_dados: true, periodo_inicio: d.metadados.inicio, periodo_fim: d.metadados.fim,
      lotes_total: d.metadados.lotes_total, lotes_respondidos: d.metadados.lotes_respondidos,
    },
    observacao: 'Tabela e gráficos consomem a mesma coleção de postos da API chuvas_pontos.php.',
  };
}
