import { z } from 'zod';
import { lembrar, TTL } from './cache';
import { buscarJson } from './http';
import { registrarChamada } from './monitor';

/**
 * Protocolo de Escassez Hídrica da SP Águas — o mesmo serviço do mapa público
 * (https://apps.spaguas.sp.gov.br/protocolo/): GeoServer da SP Águas, camada
 * `protocol_indicators_subugrhi`, uma feição por subUGRHI e mês, com a situação
 * geral (`general_status`) e os indicadores. Verificado em 03/11/2026:
 *   WFS GetFeature (dados) e WMS GetMap (mapa com o estilo oficial), filtrados
 *   por `year` e `month` (CQL_FILTER).
 */

const OWS = 'https://geodados.daee.sp.gov.br/geoserver/ows';
const CAMADA = 'protocol_indicators_subugrhi';
export const FONTE = 'SP Águas — Protocolo de Escassez Hídrica';
export const LINK = 'https://apps.spaguas.sp.gov.br/protocolo/';

/** Cores dos estágios no mapa oficial (estilo da camada no GeoServer). */
export const ESTAGIOS: { valor: number; rotulo: string; cor: string }[] = [
  { valor: 0, rotulo: 'Estágio 0', cor: '#b3f53f' },
  { valor: 1, rotulo: 'Estágio 1', cor: '#ffff1f' },
  { valor: 2, rotulo: 'Estágio 2', cor: '#ffa31f' },
  { valor: 3, rotulo: 'Estágio 3', cor: '#ff2020' },
  { valor: 4, rotulo: 'Estágio 4', cor: '#9b1fd6' },
];

const wfs = (params: Record<string, string>) =>
  `${OWS}?${new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: CAMADA, outputFormat: 'application/json', ...params })}`;

const esquema = z.object({ features: z.array(z.object({ properties: z.looseObject({ year: z.number(), month: z.number(), general_status: z.number().nullable().optional() }) })) });

/** Mês mais recente publicado até `ate` ("AAAA-MM"), ou null. */
export async function ultimoMes(ate: string): Promise<{ ano: number; mes: number } | null> {
  const [a, m] = ate.split('-').map(Number) as [number, number];
  const r = await lembrar('protocolo', `ultimo:${ate}`, TTL.hora, async () => {
    const j = esquema.parse(
      await buscarJson(wfs({ propertyName: 'year,month', CQL_FILTER: `year < ${a} OR (year = ${a} AND month <= ${m})`, sortBy: 'year D,month D', count: '1' }), { timeoutMs: 30_000 }),
    );
    const p = j.features[0]?.properties;
    return p ? { ano: p.year, mes: p.month } : null;
  });
  return r?.valor ?? null;
}

/** Quantas subUGRHIs em cada estágio no mês (situação geral). */
export async function contagem(ano: number, mes: number): Promise<Record<number, number> | null> {
  const r = await lembrar('protocolo', `contagem:${ano}-${mes}`, TTL.hora, async () => {
    const j = esquema.parse(await buscarJson(wfs({ propertyName: 'year,month,general_status', CQL_FILTER: `year = ${ano} AND month = ${mes}` }), { timeoutMs: 30_000 }));
    if (!j.features.length) return null;
    const c: Record<number, number> = {};
    for (const f of j.features) {
      const s = f.properties.general_status;
      if (typeof s === 'number') c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  });
  return r?.valor ?? null;
}

/** Mapa oficial do mês (PNG), com o estilo do GeoServer. Guardado em base64 no cache. */
export async function mapaPng(ano: number, mes: number): Promise<Uint8Array | null> {
  const url = `${OWS}?${new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: CAMADA,
    styles: '',
    format: 'image/png',
    transparent: 'true',
    srs: 'EPSG:4326',
    bbox: '-53.2,-25.4,-44.1,-19.7',
    width: '1200',
    height: '814',
    CQL_FILTER: `year = ${ano} AND month = ${mes}`,
  })}`;
  const r = await lembrar('protocolo', `mapa:${ano}-${mes}`, TTL.historico, async () => {
    const inicio = performance.now();
    const resp = await fetch(url, { signal: AbortSignal.timeout(60_000), cache: 'no-store' });
    const tipo = resp.headers.get('content-type') ?? '';
    void registrarChamada({ url, inicio, status: resp.status, ...(resp.ok && tipo.startsWith('image/png') ? {} : { falha: 'resposta_invalida' as const }) });
    if (!resp.ok || !tipo.startsWith('image/png')) throw new Error(`GeoServer respondeu ${resp.status} ${tipo}`);
    return Buffer.from(await resp.arrayBuffer()).toString('base64');
  });
  return r ? new Uint8Array(Buffer.from(r.valor, 'base64')) : null;
}
