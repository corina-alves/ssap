import { lembrar, ultimoErro } from './cache';
import { somarDias } from './comum';
import { ErroFonte } from './http';
import { classificarErro, classificarStatus, registrarChamada, viaProxy } from './monitor';

/**
 * Dados horários das estruturas da EMAE (sistema Tietê-Pinheiros) lidos no SAISP,
 * no MESMO layout da planilha diária da EMAE (a do CSV manual dos sumários):
 * linha 1 = índice 0, coluna A = índice 0, horas 7…24, 1…7 na coluna A, níveis
 * no referencial EPUSP. Porte de sumario_executivo_cheias/emae_saisp.php (PHP
 * de referência, SSSP_limpo): é a fonte automática dos dados da EMAE.
 *
 * Fontes no SAISP (login SAISP_USUARIO / SAISP_SENHA):
 *   - Rede Observada Rio Tietê/Rio Pinheiros (produto 70): a própria planilha da
 *     EMAE, hora a hora (Pedreira, Traição, Retiro, Edgard de Souza, Pirapora,
 *     vazão do Guarapiranga);
 *   - Rede Telemétrica EMAE - Resolução Conjunta (produto 443): Rasgão, Porto Góes
 *     e a vazão da Billings (BRBP), leitura das HH:00;
 *   - Rede Telemétrica SABESP (produto 63): nível do Guarapiranga, leitura das HH:00.
 */

const PROCESSO = 'https://www.saisp.br/geral/processo.jsp';
const HORA = 3_600_000;
/** Brasília (sem horário de verão desde 2019): instante local = UTC − 3 h. */
const FUSO = -3 * HORA;
/** A planilha da EMAE vai das 07h às 07h do dia seguinte. */
export const HORA_INICIO = 7;
const DIAS_NA_LISTA = 7;
const DIAS_MAXIMO = 31;
const TTL_ABERTO = 120; // dia operacional em andamento (s)
const TTL_FECHADO = 6 * 3600; // dia já encerrado
const TIMEOUT_MS = 60_000;
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SSSP-sumario-executivo';

// O mesmo teste de saisp-telemetria.ts (que é server-only; este módulo é testado fora do Next).
const saispConfigurado = () => !!process.env.SAISP_USUARIO?.trim() && !!process.env.SAISP_SENHA?.trim();

/** Canal do SAISP → produto (rede) a que pertence. */
const CANAIS: Record<number, number> = {
  215: 70, // Retiro (CPI / Tietê, vazão)
  216: 70, // Traição (CPS / CPI, vazão descarregada / bombeada)
  217: 70, // Pedreira (Billings / CPS, vazão descarregada / bombeada)
  218: 70, // Edgard de Souza
  219: 70, // Pirapora
  6000001: 70, // Barragem Guarapiranga - Observado (vazão)
  559: 443, // PCH Rasgão Barramento
  557: 443, // PCH Porto Góes Barramento
  554: 443, // UHE Henry Borden Barramento Billings (vazão BRBP)
  1000849: 63, // Barragem Guarapiranga (nível, SABESP)
};

// Uma hora só entra quando a EMAE já lançou a rede observada (produto 70) dela; as
// redes telemétricas chegam antes e deixariam a última linha quase vazia.
const PRODUTO_REFERENCIA = 70;

/**
 * Coluna da planilha → [canal, grandeza]. Grandeza = cabeçalho da tabela do SAISP em
 * minúsculas e sem espaços; "#2" = segunda coluna com o mesmo nome. "vazao_bomba":
 * vazão descarregada, ou a bombeada com sinal negativo quando houver bombeamento
 * (como a EMAE lança na planilha).
 */
const COLUNAS: [number, number, string][] = [
  [1, 217, 'flu(m)-epusp'], // B  Billings (Pedreira, lado Billings)
  [2, 217, 'flu(m)-epusp#2'], // C  Pedreira CPS
  [3, 217, 'vazao_bomba'], // D  Pedreira m³/s
  [4, 216, 'flu(m)-epusp'], // E  Traição CPS (Pinheiros Superior)
  [5, 216, 'flu(m)-epusp#2'], // F  Traição CPI (Pinheiros Inferior)
  [6, 216, 'vazao_bomba'], // G  Traição m³/s
  [7, 215, 'flu(m)-epusp'], // H  Retiro CPI
  [8, 215, 'flu(m)-epusp#2'], // I  Retiro Tietê (Barragem Móvel)
  [9, 215, 'vaz.descarg(m3/s)'], // J  Retiro m³/s
  [12, 218, 'flu(m)-epusp'], // M  Edgard de Souza
  [13, 218, 'vaz.descarg(m3/s)'], // N
  [14, 219, 'flu(m)-epusp'], // O  Pirapora
  [15, 219, 'vaz.descarg(m3/s)'], // P
  [16, 559, 'flu(m)-epusp'], // Q  Rasgão
  [17, 559, 'q(m3/s)'], // R
  [18, 557, 'flu(m)-epusp'], // S  Porto Góes
  [19, 557, 'q(m3/s)'], // T
  [20, 1000849, 'flu(m)'], // U  Guarapiranga
  [21, 6000001, 'vaz.descarg(m3/s)'], // V
  [24, 554, 'q(m3/s)'], // Y  Billings m³/s (BRBP)
];

/** Cabeçalho (2 linhas) igual ao da planilha da EMAE. */
const CABECALHO: string[][] = [
  ['h', 'PEDREIRA', '', 'B', 'SÃO PAULO', '', 'B', 'RETIRO', '', '', 'PTE PIQUERÍ', '', 'E. SOUZA', '', 'PIRAPORA', '', 'RASGÃO', '', 'P.GÓES', '', 'GUARAPIRANGA', '', '', 'R. GRANDE', 'BRBP'],
  ['', 'Billings', 'CPS', 'm³/s', 'CPS', 'CPI', 'm³/s', 'CPI', 'TIETÊ', 'm³/s', 'TIETÊ', '', 'TIETÊ-Mon', 'm³/s', 'TIETÊ-Mon', 'm³/s', 'TIETÊ-Mon', 'm³/s', 'TIETÊ-Mon', 'm³/s', 'Montante', 'm³/s', '', 'm', 'm³/s'],
];

/** Resposta no formato do emae_saisp.php (o JavaScript do sumário lê estes campos). */
export type PlanilhaEmae = {
  ok: true;
  origem: 'saisp';
  /** Dia operacional (dd/mm/aaaa). */
  aba: string;
  abas: string[];
  /** Hora do último dado da rede observada (dd/mm/aaaa HH:MM). */
  salva_em: string | null;
  linhas: string[][];
  /** Dia operacional anterior, no mesmo layout (base da variação de 24 h). */
  linhas_anterior: string[][];
  /** O SAISP não respondeu agora: são os últimos dados obtidos. */
  desatualizado: boolean;
};
export type FalhaEmae = { ok: false; erro: string; detalhe: string; status: number };

// ---------------------------------------------------------------- datas (instante local = UTC − 3 h)

const local = (t: number) => t + FUSO;
const iso = (l: number) => new Date(l).toISOString();
/** "2026-11-10 09:00" (chave das leituras). */
const chaveHora = (l: number) => iso(l).slice(0, 16).replace('T', ' ');
/** "10/11/2026 09:00" (DI / DF do SAISP e salva_em). */
const dmyHora = (l: number) => {
  const s = iso(l);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
};
const dmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
/** 07h (local) do dia AAAA-MM-DD. */
const as07 = (ymd: string) => Date.parse(`${ymd}T${String(HORA_INICIO).padStart(2, '0')}:00:00Z`);

/** Dia operacional atual (AAAA-MM-DD): antes das 07h ainda é o dia anterior. */
export function diaOperacional(agora = Date.now()): string {
  const l = local(agora);
  const dia = iso(l).slice(0, 10);
  return new Date(l).getUTCHours() < HORA_INICIO ? somarDias(dia, -1) : dia;
}

/** "dd/mm/aaaa" válido → AAAA-MM-DD; senão null. */
function ymdDe(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  const ymd = `${m[3]}-${m[2]}-${m[1]}`;
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== ymd ? null : ymd;
}

const MESES: Record<string, string> = { JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06', JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12' };

/** "10 NOV 2026 09:00" → "2026-11-10 09:00". */
function dataSaisp(texto: string): string | null {
  const m = /(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})/.exec(texto.toUpperCase());
  const mes = m && MESES[m[2]!];
  return m && mes ? `${m[3]}-${mes}-${m[1]!.padStart(2, '0')} ${m[4]}:${m[5]}` : null;
}

// ---------------------------------------------------------------- leitura da tabela de um canal

const ENTIDADES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTIDADES[e.toLowerCase()] ?? m),
  );

type LinhaHtml = { classe: string; celulas: string[] };

/**
 * Linhas (tr) do HTML com o texto de cada célula (td/th) filha direta, como o
 * textContent do DOM: o texto de uma tabela aninhada entra na célula de fora.
 */
export function linhasHtml(html: string): LinhaHtml[] {
  const linhas: LinhaHtml[] = [];
  const trs: LinhaHtml[] = []; // linhas abertas
  const tds: { l: LinhaHtml; i: number }[] = []; // células abertas (de qualquer linha)
  const re = /<(\/?)(tr|td|th)\b([^>]*)>|<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\4\s*>|<[^>]*>|([^<]+)/gi;
  for (const m of html.matchAll(re)) {
    if (m[5] !== undefined) {
      const t = decodificar(m[5]);
      for (const c of tds) c.l.celulas[c.i] += t;
      continue;
    }
    const tag = m[2]?.toLowerCase();
    if (!tag) continue;
    if (tag === 'tr') {
      if (m[1]) {
        const l = trs.pop();
        while (l && tds.length && tds.at(-1)!.l === l) tds.pop();
      } else {
        const l = { classe: /\bclass\s*=\s*["']([^"']*)/i.exec(m[3] ?? '')?.[1] ?? '', celulas: [] };
        linhas.push(l);
        trs.push(l);
      }
      continue;
    }
    const l = trs.at(-1);
    if (!l) continue;
    if (tds.at(-1)?.l === l) tds.pop(); // fecha a célula anterior da mesma linha (com ou sem </td>)
    if (!m[1]) {
      l.celulas.push('');
      tds.push({ l, i: l.celulas.length - 1 });
    }
  }
  return linhas;
}

/** Leituras de um canal: "2026-11-10 09:00" → { "flu(m)-epusp": 714.75, "flu(m)-epusp#2": 712.93, … }. */
export function lerTabelaCanal(html: string): Map<string, Record<string, number>> {
  const dados = new Map<string, Record<string, number>>();
  const ini = html.indexOf('id="tbDadosTelem"');
  const linhas = linhasHtml(ini < 0 ? html : html.slice(Math.max(0, html.lastIndexOf('<table', ini))));
  // Cabeçalho: a linha cuja 1ª célula é "Data"
  const cab = linhas.find((l) => l.celulas.length >= 2 && l.celulas[0]!.trim() === 'Data');
  if (!cab) return dados;
  const vistas = new Map<string, number>();
  const chaves = cab.celulas.map((c, i) => {
    if (!i) return '';
    const k = c.replace(/\s+/g, '').toLowerCase();
    const n = (vistas.get(k) ?? 0) + 1;
    vistas.set(k, n);
    return n > 1 ? `${k}#${n}` : k;
  });
  for (const l of linhas) {
    if (!/(^|\s)ln(\s|$)/.test(l.classe) || l.celulas.length < 2) continue;
    const quando = dataSaisp(l.celulas[0]!);
    if (!quando) continue;
    const valores: Record<string, number> = {};
    for (let i = 1; i < chaves.length && i < l.celulas.length; i++) {
      const t = l.celulas[i]!.replace(/\s+/g, ' ').trim();
      if (/^-?\d+(?:[.,]\d+)?$/.test(t)) valores[chaves[i]!] = Number(t.replace(',', '.'));
    }
    dados.set(quando, valores);
  }
  return dados;
}

// ---------------------------------------------------------------- montagem no layout da planilha

const numeroLimpo = (n: number) => String(Number(n.toFixed(6)));

function valorDaColuna(leitura: Record<string, number> | undefined, grandeza: string): number | null {
  if (!leitura) return null;
  if (grandeza !== 'vazao_bomba') return leitura[grandeza] ?? null;
  const bombeada = leitura['vaz.bombeada(m3/s)'] ?? null;
  const descarga = leitura['vaz.descarg(m3/s)'] ?? null;
  if (bombeada !== null && bombeada > 0) return -bombeada; // bombeamento: negativo, como na planilha
  return descarga ?? bombeada;
}

type Series = Map<number, Map<string, Record<string, number>>>;

/** Linhas (layout da planilha) do dia operacional que começa às 07h de `dia`, e o instante local do último dado da rede observada. */
export function linhasDoDia(series: Series, dia: string): { linhas: string[][]; ultimo: number | null } {
  const inicio = as07(dia);
  const linhas = CABECALHO.map((l) => [...l]);
  let ultimo: number | null = null;
  for (let i = 0; i <= 24; i++) {
    const t = inicio + i * HORA;
    const quando = chaveHora(t);
    const hora = new Date(t).getUTCHours();
    const linha = [hora === 0 ? '24' : String(hora)];
    const temReferencia = Object.entries(CANAIS).some(([c, p]) => p === PRODUTO_REFERENCIA && Object.keys(series.get(Number(c))?.get(quando) ?? {}).length > 0);
    if (temReferencia) {
      ultimo = t;
      for (const [col, canal, grandeza] of COLUNAS) {
        const v = valorDaColuna(series.get(canal)?.get(quando), grandeza);
        while (linha.length < col) linha.push('');
        linha[col] = v === null ? '' : numeroLimpo(v);
      }
    }
    linhas.push(linha);
  }
  return { linhas, ultimo };
}

// ---------------------------------------------------------------- download (todos os canais em paralelo)

/** Endereço da tabela de um canal entre `di` e `df` (instantes locais); `passo` em minutos ('' = todas as leituras). */
function urlCanal(canal: number, produto: number, di: number, df: number, passo = ''): string {
  const q = new URLSearchParams({
    AUTOUPDATE: '0',
    COMBOFILTROGRUPO: 'TELEM',
    OVLCODE: 'G_ESP',
    PRODUTO: String(produto),
    WHICHCHANNEL: String(canal),
    WHICHCODE: '100',
    STEP: passo,
    DI: dmyHora(di),
    DF: dmyHora(df),
  });
  return `${PROCESSO}?${q}`;
}

class ErroLogin extends ErroFonte {}

async function baixar(url: string): Promise<string> {
  const inicio = performance.now();
  const auth = `Basic ${Buffer.from(`${process.env.SAISP_USUARIO?.trim()}:${process.env.SAISP_SENHA?.trim()}`).toString('base64')}`;
  let r: Response;
  try {
    r = await fetch(url, {
      headers: { Authorization: auth, 'User-Agent': NAVEGADOR, Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9', Referer: 'https://www.saisp.br/app/index.html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (e) {
    void registrarChamada({ url, inicio, falha: classificarErro(e, viaProxy(url)), erro: e });
    throw new ErroFonte((e as Error).name === 'TimeoutError' ? 'tempo esgotado' : 'falha de conexão');
  }
  void registrarChamada({ url, inicio, status: r.status, falha: r.ok ? null : classificarStatus(r.status) });
  if (r.status === 401) throw new ErroLogin('O SAISP recusou o login (usuário ou senha inválidos).', 401);
  if (!r.ok) {
    await r.body?.cancel();
    throw new ErroFonte(`HTTP ${r.status}`, r.status);
  }
  // Erro no meio da transferência lança aqui: o HTML cortado perderia as horas mais antigas sem aviso.
  const texto = await r.text();
  if (/acesso negado/i.test(texto)) throw new ErroLogin('O SAISP recusou o login (usuário ou senha inválidos).');
  return texto;
}

/** Séries de todos os canais entre `de` e `ate` (instantes locais). */
async function baixarSeries(de: number, ate: number, agora: number): Promise<Series> {
  // Rede observada (produto 70, já horária): janela mais larga que o período, porque ela
  // devolve o período deslocado em 3 h em relação ao pedido (DI 04:00 → dados a partir das
  // 07:00). As horas mostradas batem com a planilha da EMAE; filtra-se depois pela hora.
  const di70 = de - 4 * HORA;
  const df70 = ate + HORA;
  // Redes telemétricas (leitura a cada 10 min): só a leitura horária (STEP=60). O passo conta
  // a partir do fim do período quando há leitura nele, por isso o fim é uma hora cheia já
  // passada (com 20 min de folga para a leitura chegar ao SAISP); se ainda não chegou, o passo
  // sai desalinhado e o canal é lido de novo sem passo.
  const folga = local(agora) - 20 * 60_000;
  const limite = folga - (folga % HORA);
  const diTel = de - HORA;
  const dfTel = Math.min(ate, limite);
  const dfTelCompleto = ate + HORA;

  let urls = new Map<number, string>(
    Object.entries(CANAIS).map(([c, p]) => [Number(c), p === PRODUTO_REFERENCIA ? urlCanal(Number(c), p, di70, df70) : urlCanal(Number(c), p, diTel, dfTel, '60')]),
  );
  const series: Series = new Map();
  const erros = new Map<number, string>();
  for (let tentativa = 1; urls.size && tentativa <= 3; tentativa++) {
    const refazer = new Map<number, string>();
    const pares = [...urls];
    const respostas = await Promise.allSettled(pares.map(([, url]) => baixar(url)));
    respostas.forEach((r, i) => {
      const [canal, url] = pares[i]!;
      if (r.status === 'rejected') {
        if (r.reason instanceof ErroLogin) throw r.reason;
        erros.set(canal, (r.reason as Error).message);
        refazer.set(canal, url);
        return;
      }
      const serie = lerTabelaCanal(r.value);
      if (serie.size && ![...serie.keys()].some((k) => k.endsWith(':00')) && url.includes('STEP=60')) {
        // O passo não caiu nas horas cheias (faltou a leitura do fim do período): todas as leituras
        refazer.set(canal, urlCanal(canal, CANAIS[canal]!, diTel, dfTelCompleto));
        return;
      }
      series.set(canal, serie);
      erros.delete(canal);
    });
    urls = refazer;
  }
  if (erros.size === Object.keys(CANAIS).length) {
    throw new ErroFonte(`Não foi possível acessar o SAISP: ${[...erros].map(([c, e]) => `${c} (${e})`).join('; ')}`);
  }
  return series;
}

type DiaMontado = Pick<PlanilhaEmae, 'aba' | 'salva_em' | 'linhas' | 'linhas_anterior'>;

/** O dia pedido e o anterior numa só leva de consultas; `podeVoltar`: sem nenhuma hora lançada, usa o dia anterior. */
async function montar(dia: string, podeVoltar: boolean, agora: number): Promise<DiaMontado> {
  const doDia = async (d: string) => {
    const inicio = as07(d);
    const series = await baixarSeries(inicio - 24 * HORA, inicio + 24 * HORA, agora);
    return { dia: d, ...linhasDoDia(series, d), anterior: linhasDoDia(series, somarDias(d, -1)).linhas };
  };
  let r = await doDia(dia);
  if (r.ultimo === null && podeVoltar) r = await doDia(somarDias(dia, -1));
  return { aba: dmy(r.dia), salva_em: r.ultimo === null ? null : dmyHora(r.ultimo), linhas: r.linhas, linhas_anterior: r.anterior };
}

/**
 * Dados da EMAE do dia operacional `aba` (dd/mm/aaaa, até 31 dias atrás) ou, sem
 * ele, do dia atual (antes de a EMAE lançar a 1ª hora de hoje, o anterior).
 * Guardados 2 min (dia em andamento) ou 6 h (dia encerrado).
 */
export async function emaeSaisp(aba = '', agora = Date.now()): Promise<PlanilhaEmae | FalhaEmae> {
  const falha = (status: number, erro: string, detalhe = ''): FalhaEmae => ({ ok: false, erro, detalhe, status });
  if (!saispConfigurado()) return falha(503, 'Login do SAISP não configurado.', 'Defina SAISP_USUARIO e SAISP_SENHA no ambiente do servidor.');
  const diaAtual = diaOperacional(agora);
  const abas = Array.from({ length: DIAS_NA_LISTA }, (_, i) => dmy(somarDias(diaAtual, -i)));

  const pedida = aba.trim();
  let dia = diaAtual;
  if (pedida) {
    const ymd = ymdDe(pedida);
    if (!ymd) return falha(400, 'Dia inválido: use dd/mm/aaaa.');
    if (ymd > diaAtual || ymd < somarDias(diaAtual, -DIAS_MAXIMO)) return falha(400, `Dia fora do período disponível (últimos ${DIAS_MAXIMO} dias).`);
    dia = ymd;
  }
  const fechado = pedida !== '' && dia < somarDias(diaAtual, -1);
  const chave = pedida ? dia : `atual:${diaAtual}`;
  const l = await lembrar('emae_saisp', chave, fechado ? TTL_FECHADO : TTL_ABERTO, () => montar(dia, !pedida, agora), {
    esperaFalhaSeg: 60,
    validadeMaxSeg: fechado ? undefined : 6 * 3600,
  });
  if (!l) return falha(502, ultimoErro('emae_saisp', chave) ?? 'Não foi possível acessar o SAISP.');
  return { ok: true, origem: 'saisp', ...l.valor, abas, desatualizado: l.desatualizado };
}

// ---------------------------------------------------------------- leitura das linhas (para quem usa no servidor)

/** Número de uma célula da planilha, ou null. */
export const numeroPlanilha = (t: string | undefined) => {
  const s = String(t ?? '')
    .trim()
    .replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

/**
 * As 25 linhas horárias do dia operacional, na ordem da planilha (posição 0 = 07h,
 * 1 = 08h, …, 17 = 24h, 18 = 01h, …, 24 = 07h do dia seguinte), sem o cabeçalho e
 * com as horas ainda em branco, para a posição de cada hora não mudar.
 */
export const slotsHorarios = (linhas: string[][]) => linhas.slice(2).filter((l) => /^\d{1,2}$/.test(String(l[0] ?? '').trim())).slice(0, 25);

/** Hora já lançada: ao menos um valor numérico na linha. */
export const linhaPreenchida = (l: string[] | undefined) => !!l && l.slice(1, 30).some((c) => numeroPlanilha(c) !== null);

/** Dia operacional "dd/mm/aaaa" + posição (0 = 07h) → instante (ms, UTC). */
export function instanteDaPosicao(aba: string, posicao: number): number {
  const ymd = ymdDe(aba);
  return ymd ? as07(ymd) - FUSO + posicao * HORA : Number.NaN;
}
