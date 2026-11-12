import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Cotas } from '../integracoes/sibh-medicoes';
import { erroSeguro, log } from '../log';

/**
 * Cotas de referência dos postos fluviométricos (atenção, alerta, emergência e
 * extravasamento, em m) da planilha mantida pela equipe em
 * public/acesso/plan/Cotas_extravasamento.csv (UGRHI;Prefixo;Município;Nome do
 * posto;Atenção;Alerta;Emergência;Extravasamento — ponto e vírgula, vírgula decimal).
 *
 * Completa as cotas do SIBH: o SIBH vale quando tem a cota; a planilha preenche
 * as que faltam. O posto é achado pelo prefixo do SIBH (o código antigo repete
 * entre postos: o 346 da planilha é Pirapora Jusante, não a Penha).
 */

export type LinhaCotas = { ugrhi: number; prefixo: string; municipio: string; nome: string; cotas: Cotas };

const ARQUIVO = join(process.cwd(), 'public', 'acesso', 'plan', 'Cotas_extravasamento.csv');
const ORDEM = ['atencao', 'alerta', 'emergencia', 'extravasamento'] as const;

/** "1.234,56" / "734,5" → número; vazio ou inválido → null. */
const numero = (t: string | undefined) => {
  const s = (t ?? '').trim().replace(/\./g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

/** Linhas da planilha com prefixo e ao menos uma cota (a 1ª ocorrência de cada UGRHI + prefixo). */
export function lerCotasCsv(texto: string): LinhaCotas[] {
  const vistas = new Set<string>();
  const linhas: LinhaCotas[] = [];
  for (const l of texto.replace(/^﻿/, '').split(/\r?\n/).slice(1)) {
    const c = l.split(';');
    const ugrhi = Number(c[0]);
    const prefixo = (c[1] ?? '').trim();
    if (!Number.isInteger(ugrhi) || !prefixo) continue;
    const cotas: Cotas = { atencao: numero(c[4]), alerta: numero(c[5]), emergencia: numero(c[6]), extravasamento: numero(c[7]) };
    if (ORDEM.every((k) => cotas[k] === null) || vistas.has(`${ugrhi}|${prefixo}`)) continue;
    vistas.add(`${ugrhi}|${prefixo}`);
    linhas.push({ ugrhi, prefixo, municipio: (c[2] ?? '').trim(), nome: (c[3] ?? '').trim(), cotas });
  }
  return linhas;
}

/**
 * Cotas do SIBH completadas pelas da planilha. Uma cota da planilha só entra se
 * mantiver a ordem atenção ≤ alerta ≤ emergência ≤ extravasamento com as demais
 * (a planilha tem erros de digitação, como uma emergência de 746,60 entre 723,60 e 725,60).
 */
export function combinarCotas(sibh: Cotas | null, planilha: Cotas | null): Cotas | null {
  if (!planilha) return sibh;
  const c: Cotas = { atencao: null, alerta: null, emergencia: null, extravasamento: null, ...sibh };
  for (const k of ORDEM) {
    const v = planilha[k];
    if (c[k] !== null || v === null) continue;
    const i = ORDEM.indexOf(k);
    const antes = ORDEM.slice(0, i).map((x) => c[x]).filter((x): x is number => x !== null);
    const depois = ORDEM.slice(i + 1).map((x) => c[x]).filter((x): x is number => x !== null);
    if (antes.every((x) => x <= v) && depois.every((x) => x >= v)) c[k] = v;
  }
  return ORDEM.every((k) => c[k] === null) ? null : c;
}

let guardado: { mtime: number; linhas: LinhaCotas[] } | null = null;

/** Cotas da planilha de uma UGRHI, por prefixo do SIBH. Relida quando o arquivo muda; sem arquivo, vazio. */
export async function cotasDaPlanilha(ugrhi = 6): Promise<Map<string, Cotas>> {
  try {
    const { mtimeMs } = await stat(/*turbopackIgnore: true*/ ARQUIVO);
    if (guardado?.mtime !== mtimeMs) guardado = { mtime: mtimeMs, linhas: lerCotasCsv(await readFile(/*turbopackIgnore: true*/ ARQUIVO, 'utf8')) };
    return new Map(guardado.linhas.filter((l) => l.ugrhi === ugrhi).map((l) => [l.prefixo.toUpperCase(), l.cotas]));
  } catch (e) {
    log.warn('cotas_planilha_indisponivel', { arquivo: ARQUIVO, erro: erroSeguro(e) });
    return new Map();
  }
}
