import { lembrar, TTL } from './cache';
import { hojeSp, somarDias } from './comum';
import { buscarTexto, numero } from './http';

/**
 * ONS — Dados Abertos: dados hidráulicos por reservatório, base diária (conjunto
 * "dados-hidrologicos-res"). Um CSV por ano com todo o SIN (~9 MB):
 *   https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/dados_hidrologicos_di/DADOS_HIDROLOGICOS_RES_{ano}.csv
 * Atualizado às 9h15, 14h15 e 17h; o último dia publicado é o de ontem. São os
 * mesmos números do SAR da ANA e do boletim "Acompanhamento do Sistema Hidráulico
 * Paraíba do Sul" (dados consistidos: o ONS ainda pode revisá-los). Do arquivo,
 * guardamos só a bacia pedida (~600 KB por ano no Paraíba do Sul).
 */

const BASE = 'https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/dados_hidrologicos_di/DADOS_HIDROLOGICOS_RES_';
export const FONTE = 'ONS — Dados abertos';

/** Valores de um reservatório num dia (m, %, m³/s); null = o ONS não informou. */
export type DiaOns = {
  nivel: number | null;
  volumePct: number | null;
  afluente: number | null;
  defluente: number | null;
  turbinada: number | null;
  vertida: number | null;
  /** bombeada/transferida para fora da calha (Santa Cecília → Guandu, Tocos → Lajes…) */
  transferida: number | null;
  natural: number | null;
};

/** id do reservatório no ONS (ex.: PBPARA) → dia (AAAA-MM-DD) → valores. */
export type AnoOns = Record<string, Record<string, DiaOns>>;

const COLUNAS: Record<keyof DiaOns, string> = {
  nivel: 'val_nivelmontante',
  volumePct: 'val_volumeutilcon',
  afluente: 'val_vazaoafluente',
  defluente: 'val_vazaodefluente',
  turbinada: 'val_vazaoturbinada',
  vertida: 'val_vazaovertida',
  transferida: 'val_vazaotransferida',
  natural: 'val_vazaonatural',
};

/** Linhas de uma bacia (nom_bacia, sem diferença de maiúsculas e espaços) do CSV anual do ONS. */
export function lerCsvOns(csv: string, bacia: string): AnoOns {
  const linhas = csv.split(/\r?\n/);
  const cab = (linhas[0] ?? '')
    .replace(/^﻿/, '')
    .split(';')
    .map((c) => c.trim().toLowerCase());
  const col = (c: string) => cab.indexOf(c);
  const [iBacia, iId, iDia] = [col('nom_bacia'), col('id_reservatorio'), col('din_instante')];
  if (iBacia < 0 || iId < 0 || iDia < 0) throw new Error('CSV do ONS sem as colunas esperadas');
  const campos = (Object.entries(COLUNAS) as [keyof DiaOns, string][]).map(([k, c]) => [k, col(c)] as const);
  const alvo = bacia.trim().toUpperCase();
  const saida: AnoOns = {};
  for (let n = 1; n < linhas.length; n++) {
    const c = linhas[n]!.split(';');
    if ((c[iBacia] ?? '').trim().toUpperCase() !== alvo) continue;
    const id = (c[iId] ?? '').trim();
    const dia = (c[iDia] ?? '').trim().slice(0, 10);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    const v = {} as DiaOns;
    for (const [k, i] of campos) v[k] = i < 0 ? null : numero(c[i]?.trim());
    (saida[id] ??= {})[dia] = v;
  }
  return saida;
}

/**
 * Ano fechado (anterior ao atual, depois de janeiro, quando o ONS ainda revisa
 * dezembro): guardado de vez. Ano corrente: refeito a cada hora.
 */
function ttlAno(ano: number): number {
  const hoje = hojeSp();
  return ano < Number(hoje.slice(0, 4)) && hoje.slice(5, 7) !== '01' ? TTL.historico : TTL.hora;
}

/** Dados diários de uma bacia num ano (null: ONS fora e sem cópia guardada). */
export async function anoBacia(ano: number, bacia: string) {
  return lembrar('ons', `hidro-dia:${bacia.trim().toUpperCase()}:${ano}`, ttlAno(ano), async () => {
    const csv = await buscarTexto(`${BASE}${ano}.csv`, { timeoutMs: 90_000 });
    const dados = lerCsvOns(csv, bacia);
    return Object.keys(dados).length ? dados : null;
  }, { esperaFalhaSeg: 10 * 60 });
}

/** Juntando os anos necessários: dias de `de` a `ate` de cada reservatório da bacia. */
export async function periodoBacia(bacia: string, de: string, ate: string) {
  const anos = Array.from({ length: Number(ate.slice(0, 4)) - Number(de.slice(0, 4)) + 1 }, (_, i) => Number(de.slice(0, 4)) + i);
  const rs = await Promise.all(anos.map((a) => anoBacia(a, bacia)));
  const ok = rs.filter((r) => r !== null);
  if (!ok.length) return null;
  const dados: AnoOns = {};
  for (const r of ok)
    for (const [id, dias] of Object.entries(r.valor))
      for (const [dia, v] of Object.entries(dias)) if (dia >= de && dia <= ate) (dados[id] ??= {})[dia] = v;
  return { valor: dados, obtidoEm: new Date(Math.min(...ok.map((r) => r.obtidoEm.getTime()))), desatualizado: ok.some((r) => r.desatualizado) || ok.length < rs.length };
}

/** Último dia (até `ate`) em que o reservatório tem algum valor, recuando até `maxDias`. */
export function ultimoDia(dias: Record<string, DiaOns> | undefined, ate: string, maxDias = 7): string | null {
  for (let i = 0; i <= maxDias; i++) {
    const d = somarDias(ate, -i);
    const v = dias?.[d];
    if (v && Object.values(v).some((x) => x !== null)) return d;
  }
  return null;
}
