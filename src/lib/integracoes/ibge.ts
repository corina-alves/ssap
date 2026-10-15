import { z } from 'zod';
import { lembrar, TTL } from './cache';
import { comoDado, type Dado } from './comum';
import { buscarJson } from './http';

/**
 * IBGE — municípios do Estado de São Paulo (UF 35). Cache de 30 dias e reserva
 * de até 1 ano: a lista praticamente não muda.
 */
const URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/35/municipios';
export const FONTE = 'IBGE — Localidades';

export type Municipio = { codigoIbge: number; nome: string };

export async function municipiosSP(): Promise<Dado<Municipio[]>> {
  const l = await lembrar(
    'ibge',
    'municipios:35',
    TTL.cadastro,
    async () => {
      const r = z.array(z.looseObject({ id: z.number(), nome: z.string() })).safeParse(await buscarJson(URL, { timeoutMs: 15_000 }));
      if (!r.success || r.data.length < 600) throw new Error('lista de municípios inesperada');
      return r.data.map((m) => ({ codigoIbge: m.id, nome: m.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },
    { validadeMaxSeg: 365 * 24 * 60 * 60 },
  );
  return comoDado(FONTE, l);
}

const URL_CONTORNO =
  'https://servicodados.ibge.gov.br/api/v3/malhas/estados/35?formato=application/vnd.geo%2Bjson&qualidade=intermediaria';

/** Polígonos do contorno do Estado de SP: [polígono][anel][ponto] = [lon, lat]. */
export type Contorno = [number, number][][][];

/** Contorno oficial do Estado (malha do IBGE), para recortar mapas. Cache de 30 dias. */
export async function contornoSP(): Promise<Dado<Contorno>> {
  const ponto = z.tuple([z.number(), z.number()]);
  const l = await lembrar(
    'ibge',
    'contorno:35',
    TTL.cadastro,
    async () => {
      const r = z
        .object({
          features: z
            .array(
              z.object({
                geometry: z.discriminatedUnion('type', [
                  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(ponto)) }),
                  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(ponto))) }),
                ]),
              }),
            )
            .min(1),
        })
        .safeParse(await buscarJson(URL_CONTORNO, { timeoutMs: 15_000 }));
      if (!r.success) throw new Error('contorno do IBGE em formato inesperado');
      const g = r.data.features[0]!.geometry;
      return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Contorno;
    },
    { validadeMaxSeg: 365 * 24 * 60 * 60 },
  );
  return comoDado(FONTE, l);
}

const URL_MALHA =
  'https://servicodados.ibge.gov.br/api/v3/malhas/estados/35?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio';

/** Limite de um município: código do IBGE e anéis [lon, lat]. */
export type MalhaMunicipio = { codigo: number; aneis: [number, number][][] };

/** Malha dos municípios de SP (IBGE, qualidade mínima), para mapas por município. Cache de 30 dias. */
export async function malhaMunicipiosSP(): Promise<Dado<MalhaMunicipio[]>> {
  const ponto = z.tuple([z.number(), z.number()]);
  const l = await lembrar(
    'ibge',
    'malha-municipios:35',
    TTL.cadastro,
    async () => {
      const r = z
        .object({
          features: z
            .array(
              z.object({
                properties: z.looseObject({ codarea: z.string() }),
                geometry: z.discriminatedUnion('type', [
                  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(ponto)) }),
                  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(ponto))) }),
                ]),
              }),
            )
            .min(600),
        })
        .safeParse(await buscarJson(URL_MALHA, { timeoutMs: 30_000 }));
      if (!r.success) throw new Error('malha de municípios do IBGE em formato inesperado');
      return r.data.features.map((f) => ({
        codigo: Number(f.properties.codarea),
        aneis: (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat()) as [number, number][][],
      }));
    },
    { validadeMaxSeg: 365 * 24 * 60 * 60 },
  );
  return comoDado(FONTE, l);
}
