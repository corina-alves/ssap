import { z } from 'zod';
import { lembrar, TTL } from './cache';
import { comoDado, hojeSp, normalizar, somarDias, ttlPorData, type Dado } from './comum';
import { arred, buscarJson, numero } from './http';

/**
 * ANA — Sistema de Acompanhamento de Reservatórios (SAR).
 *   retornaMedicoes?data=<Wed Sep 30 2026 00:00:00 GMT-0300>&siglaUf=&tipoSistema=3
 *     → reservatórios do Cantareira + linhas agregadas "Sistema Cantareira" e
 *       "Sistema Equivalente" (campo `estado`).
 *   retornaMedicoesSIN?data=...&tipoSistema=2&bacia=90 → Paraíba do Sul (Jaguari etc.),
 *     publicado com ~1 dia de atraso.
 *
 * Regra da Sala: o volume do Cantareira nos cards vem da ANA ("Dado: ANA").
 */

const BASE = 'https://www.ana.gov.br/sar/restportal/api/';
export const FONTE = 'ANA — SAR';

/** Data no formato textual que o SAR espera. */
export function dataSar(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dias[d.getUTCDay()]} ${meses[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')} ${d.getUTCFullYear()} 00:00:00 GMT-0300`;
}

export type MedicaoAna = {
  estado: string | null;
  bacia: string | null;
  reservatorio: string | null;
  volumeUtil: number | null;
  data: string | null;
};

const esquema = z.array(
  z.looseObject({
    estado: z.string().nullable().optional(),
    bacia: z.string().nullable().optional(),
    reservatorio: z.string().nullable().optional(),
    volumeUtil: z.union([z.string(), z.number()]).nullable().optional(),
    data: z.string().nullable().optional(),
  }),
);

function normalizarLista(json: unknown): MedicaoAna[] | null {
  const r = esquema.safeParse(json);
  if (!r.success) throw new Error('formato inesperado do SAR/ANA');
  if (!r.data.length) return null; // dia ainda não publicado
  return r.data.map((m) => ({
    estado: m.estado ?? null,
    bacia: m.bacia ?? null,
    reservatorio: m.reservatorio ?? null,
    volumeUtil: numero(m.volumeUtil),
    data: m.data ?? null,
  }));
}

function medicoes(ymd: string) {
  const url = `${BASE}retornaMedicoes?data=${encodeURIComponent(dataSar(ymd))}&siglaUf=&tipoSistema=3`;
  return lembrar('ana', `medicoes:${ymd}`, ttlPorData(ymd, TTL.hora, TTL.historico), async () => normalizarLista(await buscarJson(url)), {
    esperaFalhaSeg: 10 * 60,
  });
}

function medicoesSin(ymd: string, bacia: number) {
  const url = `${BASE}retornaMedicoesSIN?data=${encodeURIComponent(dataSar(ymd))}&tipoSistema=2&bacia=${bacia}`;
  return lembrar('ana', `sin:${bacia}:${ymd}`, ttlPorData(ymd, TTL.hora, TTL.historico), async () => normalizarLista(await buscarJson(url)), {
    esperaFalhaSeg: 10 * 60,
  });
}

/** Percentual 0–100 (o SAR às vezes manda 0–1). */
function pct(v: number | null): number | null {
  if (v === null) return null;
  const p = v > 0 && v <= 1 ? v * 100 : v;
  return p >= 0 && p <= 100 ? arred(p, 2) : null;
}

export type VolumeAna = { volumePct: number; data: string };

/** Volume útil (%) do Sistema Cantareira, no dia ou no anterior. */
export async function volumeCantareira(ymd = hojeSp()): Promise<Dado<VolumeAna>> {
  const datas = [ymd, somarDias(ymd, -1)];
  const rs = await Promise.all(datas.map(medicoes));
  for (const [i, r] of rs.entries()) {
    const linha = r?.valor.find((m) => normalizar(m.estado ?? '').includes('CANTAREIRA'));
    const v = pct(linha?.volumeUtil ?? null);
    if (r && v !== null) return comoDado(FONTE, { ...r, valor: { volumePct: v, data: datas[i]! } });
  }
  return comoDado(FONTE, null);
}

/**
 * Volume útil (%) do Sistema Cantareira em cada dia pedido (séries: curva de
 * contingência). Só entram os dias que a ANA publicou. Busca em lotes de 10;
 * dia passado fica em cache para sempre.
 */
export async function volumesCantareira(datas: string[]): Promise<Map<string, number>> {
  const saida = new Map<string, number>();
  for (let i = 0; i < datas.length; i += 10) {
    const lote = datas.slice(i, i + 10);
    const rs = await Promise.all(lote.map(medicoes));
    rs.forEach((r, j) => {
      const v = pct(r?.valor.find((m) => normalizar(m.estado ?? '').includes('CANTAREIRA'))?.volumeUtil ?? null);
      if (v !== null) saida.set(lote[j]!, v);
    });
  }
  return saida;
}

/** Volume útil (%) do reservatório Jaguari (Paraíba do Sul), recuando até 7 dias. */
export async function volumeJaguari(ymd = hojeSp()): Promise<Dado<VolumeAna>> {
  const datas = Array.from({ length: 7 }, (_, i) => somarDias(ymd, -i));
  const rs = await Promise.all(datas.map((d) => medicoesSin(d, 90)));
  for (const [i, r] of rs.entries()) {
    const linha = r?.valor.find((m) => normalizar(m.reservatorio ?? '') === 'JAGUARI');
    if (r && linha?.volumeUtil != null) return comoDado(FONTE, { ...r, valor: { volumePct: arred(linha.volumeUtil, 2), data: datas[i]! } });
  }
  return comoDado(FONTE, null);
}

/** Reservatórios da bacia do Paraíba do Sul (SIN, bacia 90), dia mais recente. */
export async function reservatoriosParaiba(ymd = hojeSp()): Promise<Dado<{ data: string; reservatorios: MedicaoAna[] }>> {
  const datas = Array.from({ length: 7 }, (_, i) => somarDias(ymd, -i));
  const rs = await Promise.all(datas.map((d) => medicoesSin(d, 90)));
  const i = rs.findIndex((r) => r && r.valor.length);
  const r = i >= 0 ? rs[i]! : null;
  return comoDado(FONTE, r && { ...r, valor: { data: datas[i]!, reservatorios: r.valor } });
}
