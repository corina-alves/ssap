import grade from '../../conteudo/regionais-defesa-civil.json';

/**
 * Regionais da Defesa Civil do Estado (REPDEC). A grade (ponto → regional) e
 * os centros são gerados por scripts/regionais-defesa-civil.mjs a partir das
 * linhas de divisa de public/acesso/geo/regionais_defesa_civil.geojson.
 */

export type Regional = { nome: string; centro: [lat: number, lng: number] };

export const REGIONAIS = grade.regionais as Regional[];

/** Índice (em REGIONAIS) da regional onde o ponto cai; null fora do estado. */
export function regionalDoPonto(lat: number, lng: number): number | null {
  const i = Math.floor((lng - grade.lng0) / grade.passo);
  const j = Math.floor((lat - grade.lat0) / grade.passo);
  if (!Number.isFinite(i) || !Number.isFinite(j) || i < 0 || i >= grade.colunas || j < 0 || j >= grade.linhas) return null;
  const corridas = grade.corridas[j]!; // pares [quantas células, regional ou -1]
  for (let k = 0, fim = 0; k < corridas.length; k += 2) {
    fim += corridas[k]!;
    if (i < fim) return corridas[k + 1]! < 0 ? null : corridas[k + 1]!;
  }
  return null;
}
