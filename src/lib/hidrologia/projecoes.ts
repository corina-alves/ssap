import { ErroValidacao } from '../graficos-tabela';

/**
 * Projeções do volume útil (simulações do SSD Sabesp) × regra da GDN — porte de
 * ProjecaoService.php e config/projecoes.php (adaptação do Kit_Atualizar_Graficos).
 * Aqui fica só o cálculo: leitura dos CSVs, consolidação, marcação da GDN e os
 * dados dos gráficos (desenhados em public/acesso/js/projecoes.js). As rodadas
 * gravadas em arquivo ficam em projecoes-rodadas.ts.
 *
 * Regra da GDN (igual ao kit): a retomada é marcada no mês subsequente ao
 * primeiro fechamento mensal com volume útil projetado abaixo do limite da
 * Faixa 2.
 */

/**
 * FAIXAS DE ATUAÇÃO — Tabela 3 da Nota Informativa Conjunta SP-ÁGUAS/ARSESP,
 * ciclo 2026-2027. A curva é única (deslocamentos da Curva de Contingência do
 * SIM) e a Nota a aplica ao SIM e ao Sistema Cantareira. Meses que não estão
 * na tabela usam o mesmo mês do ano anterior (ex.: mai–set/2027 = mai–set/2026).
 *
 * Novo ciclo: substitua `faixas` pelos valores da nova Nota (AAAA-MM → [Faixa 7 ... Faixa 1]).
 */
export const CONFIG = {
  // Faixa usada na regra da GDN.
  faixa_gdn: 2,
  fonte_faixas: 'Nota Informativa Conjunta SP-ÁGUAS/ARSESP — ciclo 2026-2027, Tabela 3',
  // AAAA-MM → [Faixa 7, Faixa 6, Faixa 5, Faixa 4, Faixa 3, Faixa 2, Faixa 1] (% do volume útil)
  faixas: {
    '2026-04': [11.9, 21.9, 29.9, 37.9, 45.9, 53.9, 61.9],
    '2026-05': [9.8, 19.8, 27.8, 35.8, 43.8, 51.8, 59.8],
    '2026-06': [7.2, 17.2, 25.2, 33.2, 41.2, 49.2, 57.2],
    '2026-07': [2.3, 12.3, 20.3, 28.3, 36.3, 44.3, 52.3],
    '2026-08': [-3.5, 6.5, 14.5, 22.5, 30.5, 38.5, 46.5],
    '2026-09': [-8.4, 1.6, 9.6, 17.6, 25.6, 33.6, 41.6],
    '2026-10': [-10.6, -0.6, 7.4, 15.4, 23.4, 31.4, 39.4],
    '2026-11': [-12.0, -2.0, 6.0, 14.0, 22.0, 30.0, 38.0],
    '2026-12': [-9.4, 0.6, 8.6, 16.6, 24.6, 32.6, 40.6],
    '2027-01': [-2.1, 7.9, 15.9, 23.9, 31.9, 39.9, 47.9],
    '2027-02': [5.2, 15.2, 23.2, 31.2, 39.2, 47.2, 55.2],
    '2027-03': [10.7, 20.7, 28.7, 36.7, 44.7, 52.7, 60.7],
    '2027-04': [10.9, 20.9, 28.9, 36.9, 44.9, 52.9, 60.9],
  } as Record<string, number[]>,
  // Cenários padrão da grade de envio (podem ser alterados na tela).
  esi_padrao: [29, 30, 31],
  qn_padrao: [100, 70, 50],
  cores_qn: { 100: '#255C8D', 70: '#E8912D', 50: '#B33A3A' } as Record<number, string>,
  cenario_rotulo: 'Retirada na ESI',
  cenario_unidade: 'm³/s',
  rodape: 'Fonte: Sala de Situação Alfredo Pisani / SP-Águas.',
};

/** slug → nome, título do gráfico e se mostra o limite da Faixa 2 / GDN. */
export const SISTEMAS: Record<string, { nome: string; titulo: string; gdn: boolean }> = {
  cantareira: { nome: 'Sistema Cantareira', titulo: 'Projeção do volume útil do Sistema Cantareira', gdn: true },
  sim: { nome: 'SIM', titulo: 'Projeção do volume útil do SIM', gdn: true },
  'alto-tiete': { nome: 'Sistema Alto Tietê', titulo: 'Projeção do volume útil do Sistema Alto Tietê', gdn: true },
  guarapiranga: { nome: 'Sistema Guarapiranga', titulo: 'Projeção do volume útil do Sistema Guarapiranga', gdn: true },
  cotia: { nome: 'Sistema Cotia', titulo: 'Projeção do volume útil do Sistema Cotia', gdn: true },
  'rio-grande': { nome: 'Sistema Rio Grande', titulo: 'Projeção do volume útil do Sistema Rio Grande', gdn: true },
  'rio-claro': { nome: 'Sistema Rio Claro', titulo: 'Projeção do volume útil do Sistema Rio Claro', gdn: true },
  'sao-lourenco': { nome: 'Sistema São Lourenço', titulo: 'Projeção do volume útil do Sistema São Lourenço', gdn: true },
};

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MAX_LINHAS_CSV = 20_000;

/** Fechamento de um mês de uma simulação. `esi` no formato de formatarEsi ("29", "29.5"). */
export type Registro = { mes: string; esi: string; qn: number; valor: number };

// ---------------------------------------------------------------------------
// Faixas / GDN
// ---------------------------------------------------------------------------

/** Limite de uma faixa no mês (AAAA-MM); sem o mês na tabela, usa o mesmo mês de até 3 anos antes. */
export function limiteFaixa(anoMes: string, faixa: number = CONFIG.faixa_gdn): number | null {
  const indice = 7 - faixa; // colunas: Faixa 7 ... Faixa 1
  const [a, m] = anoMes.split('-').map(Number) as [number, number];
  for (let volta = 0; volta <= 3; volta++) {
    const v = CONFIG.faixas[`${String(a - volta).padStart(4, '0')}-${String(m).padStart(2, '0')}`]?.[indice];
    if (v !== undefined) return v;
  }
  return null;
}

export function rotuloMes(anoMes: string): string {
  return `${MESES[Number(anoMes.slice(5, 7)) - 1]}/${anoMes.slice(2, 4)}`;
}

function mesSeguinte(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

export type Retomada = { analise: string; retomada: string; volume: number; limite: number };

/** Retomada da GDN por QN, para uma ESI. `porQn`: qn → (AAAA-MM → volume). */
export function retomadas(porQn: Map<number, Map<string, number>>): Map<number, Retomada> {
  const r = new Map<number, Retomada>();
  for (const [qn, meses] of porQn) {
    for (const ym of [...meses.keys()].sort()) {
      const v = meses.get(ym)!;
      const lim = limiteFaixa(ym);
      if (lim !== null && v < lim) {
        r.set(qn, { analise: ym, retomada: mesSeguinte(ym), volume: v, limite: lim });
        break;
      }
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Leitura dos CSVs
// ---------------------------------------------------------------------------

/** Bytes do arquivo → texto: UTF-8 (com ou sem BOM) ou, se não for válido, Windows-1252. */
export function decodificar(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "2026-09-30 03:00", "2026-09-30T03:00:00", "30/09/2026", "30/09/26 03:00" → AAAA-MM-DD */
export function data(s: string): string | null {
  s = s.replace(/^[ \t"']+|[ \t"']+$/g, '');
  let a: number, mes: number, d: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s))) {
    [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (a < 100) a += 2000;
  } else {
    return null;
  }
  if (a < 1900 || a > 2200 || mes < 1 || mes > 12 || d < 1 || d > new Date(Date.UTC(a, mes, 0)).getUTCDate()) return null;
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "40,13716" / "40.13716" / "1.234,5" → número */
export function numero(s: string | null | undefined): number | null {
  let t = (s ?? '').replace(/[ % ]/g, '');
  if (!/^[+-]?[\d.,]+$/.test(t)) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : null;
}

/** 29 → "29"; 29.5 → "29.5"; 29.25 → "29.25" */
export function formatarEsi(e: number): string {
  return String(Number(e.toFixed(2)));
}

/** "29, 30, 31", "29;30;31" ou "29,5 30" → lista sem repetição (ESIs formatadas ou QNs inteiros). */
export function listaNumeros(texto: string, inteiro: boolean): string[] {
  // vírgula como separador só entre inteiros; senão é vírgula decimal
  const t = /^\s*\d+(\s*,\s*\d+)+\s*$/.test(texto) ? texto.replace(/,/g, ' ') : texto.replace(/, /g, ' ');
  const r: string[] = [];
  for (const p of t.split(/[\s;]+/)) {
    const n = numero(p.trim());
    if (n !== null && n > 0 && n < 1000) r.push(inteiro ? String(Math.round(n)) : formatarEsi(n));
  }
  return [...new Set(r)];
}

function separador(linhas: string[]): string {
  const amostra = linhas.filter((l) => l.trim() !== '').slice(0, 20).join('\n');
  const conta = (c: string) => amostra.split(c).length - 1;
  // Vírgula decimal ("40,1") não deve vencer ; ou tab.
  if (conta(';') > 0 || conta('\t') > 0) return conta(';') >= conta('\t') ? ';' : '\t';
  return ',';
}

/** Células de uma linha de CSV (aspas duplas protegem o separador; "" é uma aspa). */
function celulas(linha: string, sep: string): string[] {
  const r: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]!;
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { r.push(atual.trim()); atual = ''; }
    else atual += c;
  }
  r.push(atual.trim());
  return r;
}

/** Índice da coluna: primeiro a que é igual ou começa com um dos nomes; depois a que contém. */
function coluna(cab: string[], nomes: string[]): number | null {
  for (const n of nomes) {
    const i = cab.findIndex((c) => c === n || c.startsWith(n));
    if (i >= 0) return i;
  }
  for (const n of nomes) {
    const i = cab.findIndex((c) => c.includes(n));
    if (i >= 0) return i;
  }
  return null;
}

const esiDoNome = (nome: string) => {
  const m = /esi[\s_-]*(\d{1,2}(?:[.,]\d+)?)/i.exec(nome);
  return m ? formatarEsi(Number(m[1]!.replace(',', '.'))) : null;
};
const qnDoNome = (nome: string) => {
  const m = /qn[\s_-]*(\d{2,3})/i.exec(nome);
  return m ? Number(m[1]) : null;
};

/** Fica com o último valor de cada mês (fechamento). `mensal`: "esi|qn" → (AAAA-MM → volume). */
function achatar(mensal: Map<string, Map<string, number>>, nomeArquivo: string): Registro[] {
  const r: Registro[] = [];
  for (const [chave, meses] of mensal) {
    const [esi, qn] = chave.split('|') as [string, string];
    for (const ym of [...meses.keys()].sort()) r.push({ mes: ym, esi, qn: Number(qn), valor: meses.get(ym)! });
  }
  if (!r.length) throw new ErroValidacao([`${nomeArquivo}: nenhuma linha com data e volume útil foi reconhecida.`]);
  return r;
}

/**
 * Lê um CSV enviado. Formatos aceitos:
 *  - consolidado do kit: colunas data, esi, qn, volume (cabeçalho com "esi" e "qn");
 *  - simulação do SSD: uma coluna de data e o volume útil (ESI e QN vêm do
 *    formulário ou do nome do arquivo, ex.: "QN70_ESI29.csv").
 * Dados diários são reduzidos ao fechamento do mês (último valor de cada mês).
 */
export function lerCsv(texto: string, nomeArquivo = '', esi: string | null = null, qn: number | null = null): Registro[] {
  if (texto.startsWith('﻿')) texto = texto.slice(1);
  const linhas = texto.split(/\r\n|\r|\n/);
  if (linhas.length > MAX_LINHAS_CSV) throw new ErroValidacao([`${nomeArquivo}: arquivo grande demais (mais de ${MAX_LINHAS_CSV} linhas).`]);
  const sep = separador(linhas);
  const tabela = linhas.filter((l) => l.trim() !== '').map((l) => celulas(l, sep));
  if (!tabela.length) throw new ErroValidacao([`${nomeArquivo}: arquivo vazio.`]);

  const mensal = new Map<string, Map<string, number>>();
  const guardar = (chave: string, d: string, v: number) => {
    if (!mensal.has(chave)) mensal.set(chave, new Map());
    mensal.get(chave)!.set(d.slice(0, 7), v); // linhas em ordem de data: a última do mês fica
  };

  // Consolidado (cabeçalho com esi e qn)
  const cab = tabela[0]!.map((c) => semAcento(c).toLowerCase());
  const iEsi = coluna(cab, ['esi']);
  const iQn = coluna(cab, ['qn']);
  if (iEsi !== null && iQn !== null) {
    const iData = coluna(cab, ['data', 'date']) ?? 0;
    const iVal = coluna(cab, ['volume', 'valor', 'vu']);
    if (iVal === null) throw new ErroValidacao([`${nomeArquivo}: não achei a coluna do volume útil.`]);
    for (const l of tabela.slice(1)) {
      const d = data(l[iData] ?? '');
      const v = numero(l[iVal]);
      const e = numero((l[iEsi] ?? '').replace(/[^0-9.,]/g, ''));
      const q = numero((l[iQn] ?? '').replace(/[^0-9.,]/g, ''));
      if (d === null || v === null || e === null || q === null) continue;
      guardar(`${formatarEsi(e)}|${Math.round(q)}`, d, v);
    }
    return achatar(mensal, nomeArquivo);
  }

  // Simulação: data + volume
  esi ??= esiDoNome(nomeArquivo);
  qn ??= qnDoNome(nomeArquivo);
  if (esi === null || qn === null) {
    throw new ErroValidacao([`${nomeArquivo}: informe a ESI e o QN deste arquivo (ou use um nome como QN70_ESI29.csv).`]);
  }
  const iVal = coluna(cab, ['volume util final', 'volume util', 'volume', 'valor']);
  for (const l of tabela) {
    const iData = l.findIndex((c) => data(c) !== null);
    if (iData < 0) continue; // cabeçalho, metadados
    const d = data(l[iData]!)!;
    let v: number | null = null;
    if (iVal !== null && iVal !== iData) {
      v = numero(l[iVal]);
    } else {
      for (const c of l.slice(iData + 1)) {
        if ((v = numero(c)) !== null) break;
      }
    }
    if (v !== null) guardar(`${esi}|${qn}`, d, v);
  }
  return achatar(mensal, nomeArquivo);
}

/** CSV consolidado da rodada (mesmo formato do dados_consolidados.csv do kit), com BOM. */
export function csvConsolidado(registros: Registro[]): string {
  const ordenados = [...registros].sort((a, b) => Number(a.esi) - Number(b.esi) || b.qn - a.qn || a.mes.localeCompare(b.mes));
  let csv = 'data,esi_m3s,qn,volume_util_pct\n';
  for (const r of ordenados) {
    const [a, m] = r.mes.split('-').map(Number) as [number, number];
    const fim = `${r.mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
    csv += `${fim},${r.esi},QN ${r.qn}%,${Number(r.valor.toFixed(5))}\n`;
  }
  return `﻿${csv}`;
}

// ---------------------------------------------------------------------------
// Gráficos e resumo
// ---------------------------------------------------------------------------

/** esi → qn → (AAAA-MM → volume), com as ESIs em ordem crescente e os QNs em ordem decrescente. */
function agrupar(registros: Registro[]): [string, Map<number, Map<string, number>>][] {
  const porEsi = new Map<string, Map<number, Map<string, number>>>();
  for (const r of registros) {
    if (!porEsi.has(r.esi)) porEsi.set(r.esi, new Map());
    const porQn = porEsi.get(r.esi)!;
    if (!porQn.has(r.qn)) porQn.set(r.qn, new Map());
    porQn.get(r.qn)!.set(r.mes, r.valor);
  }
  return [...porEsi]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([esi, porQn]) => [esi, new Map([...porQn].sort(([a], [b]) => b - a))]);
}

/** Configuração de um gráfico, como public/acesso/js/projecoes.js espera em data-projecao. */
export type GraficoProjecao = {
  esi: string;
  titulo: string;
  subtitulo: string;
  rotulos: string[];
  series: { nome: string; cor: string | null; valores: (number | null)[] }[];
  limite: { nome: string; valores: (number | null)[] } | null;
  marcas: { de: number; ate: number; texto: string; cenarios: string }[];
  y_min: number;
  y_max: number;
  rodape: string;
  arquivo: string;
};

/** Um gráfico por ESI e os avisos de conferência. */
export function graficos(sistema: string, registros: Registro[]): { graficos: GraficoProjecao[]; avisos: string[] } {
  const sis = SISTEMAS[sistema];
  if (!sis) throw new Error('Sistema inválido.');
  const avisos: string[] = [];
  const lista: GraficoProjecao[] = [];
  for (const [esi, porQn] of agrupar(registros)) {
    for (const [qn, ms] of porQn) {
      if (ms.size !== 13) avisos.push(`ESI ${esi} / QN ${qn}%: ${ms.size} meses (o kit espera 13).`);
    }
    const meses = [...new Set([...porQn.values()].flatMap((ms) => [...ms.keys()]))].sort();
    const indice = new Map(meses.map((m, i) => [m, i]));
    const valores = [...porQn.values()].flatMap((ms) => [...ms.values()]);

    // Retomadas no mesmo mês viram um bloco só (como no kit).
    const blocos = new Map<string, { qns: string[]; analise: string }>();
    if (sis.gdn) {
      for (const [qn, info] of retomadas(porQn)) {
        const b = blocos.get(info.retomada) ?? { qns: [], analise: info.analise };
        b.qns.push(`QN ${qn}%`);
        b.analise = info.analise;
        blocos.set(info.retomada, b);
      }
    }
    const marcas: GraficoProjecao['marcas'] = [];
    for (const ret of [...blocos.keys()].sort()) {
      const b = blocos.get(ret)!;
      const de = indice.get(b.analise);
      if (de === undefined) continue;
      marcas.push({ de, ate: indice.get(ret) ?? de + 1, texto: `Retomada da GDN: ${rotuloMes(ret)}`, cenarios: `(${b.qns.join(' e ')})` });
    }

    lista.push({
      esi,
      titulo: sis.titulo,
      subtitulo: `${CONFIG.cenario_rotulo}: ${esi.replace('.', ',')} ${CONFIG.cenario_unidade}`,
      rotulos: meses.map(rotuloMes),
      series: [...porQn].map(([qn, ms]) => ({
        nome: `QN ${qn}%`,
        cor: CONFIG.cores_qn[qn] ?? null,
        valores: meses.map((m) => (ms.has(m) ? Math.round(ms.get(m)! * 100) / 100 : null)),
      })),
      limite: sis.gdn ? { nome: `Limite da Faixa ${CONFIG.faixa_gdn}`, valores: meses.map((m) => limiteFaixa(m)) } : null,
      marcas,
      y_min: Math.min(0, Math.floor(Math.min(...valores) / 10) * 10),
      y_max: Math.max(80, Math.ceil(Math.max(...valores) / 10) * 10),
      rodape: CONFIG.rodape,
      arquivo: `projecao_${semAcento(sis.nome).replace(/[^A-Za-z0-9]+/g, '_')}_ESI_${esi.replace('.', '_')}.png`,
    });
  }
  return { graficos: lista, avisos };
}

/** Resumo da marcação da GDN (mesmo texto do resumo_marcacao_GDN.txt do kit). */
export function resumo(sistema: string, registros: Registro[]): string {
  const sis = SISTEMAS[sistema];
  if (!sis) throw new Error('Sistema inválido.');
  const pct = (v: number) => v.toFixed(2).replace('.', ',');
  const l = [
    `CRITÉRIO DA MARCAÇÃO DA GDN — ${sis.nome}`,
    '',
    'A retomada foi marcada no mês subsequente ao primeiro fechamento mensal',
    `com volume útil projetado abaixo do limite da Faixa ${CONFIG.faixa_gdn}.`,
    '',
  ];
  for (const [esi, porQn] of agrupar(registros)) {
    l.push(`ESI ${esi} m³/s:`);
    const ret = retomadas(porQn);
    for (const qn of porQn.keys()) {
      const i = ret.get(qn);
      l.push(
        i
          ? `  QN ${qn}%: ${rotuloMes(i.analise)} fecha em ${pct(i.volume)}% (< ${pct(i.limite)}%); retomada em ${rotuloMes(i.retomada)}`
          : `  QN ${qn}%: sem retomada identificada no período analisado`,
      );
    }
    l.push('');
  }
  l.push(`Limites: ${CONFIG.fonte_faixas}.`, 'Meses fora da tabela usam o limite do mesmo mês do ano anterior.');
  return l.join('\n');
}
