import { z } from 'zod';
import { lembrar, TTL } from './cache';
import { comoDado, type Dado } from './comum';
import { arred, buscarJson, numero } from './http';

/**
 * SIBH / SP Águas — rede pluviométrica, "chuva agora" (última hora).
 *   GET https://apps.spaguas.sp.gov.br/sibh/api/v2/measurements/now
 *       ?station_type_id=2&hours=1&show_all=false&serializer=complete&public=true
 * Resposta grande (~700 KB, ~1100 postos): o cache guarda só o necessário.
 */

const URL_CHUVA_AGORA =
  'https://apps.spaguas.sp.gov.br/sibh/api/v2/measurements/now?station_type_id=2&hours=1&show_all=false&serializer=complete&public=true';
export const FONTE = 'SIBH — SP Águas';

export type PostoChuva = {
  prefixo: string;
  nome: string;
  municipio: string | null;
  ugrhi: string | null;
  lat: number | null;
  lon: number | null;
  chuvaMm: number;
};

const esquema = z.object({
  measurements: z.array(
    z.looseObject({
      prefix: z.union([z.string(), z.number()]).nullable().optional(),
      station_name: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      ugrhi_name: z.string().nullable().optional(),
      latitude: z.union([z.string(), z.number()]).nullable().optional(),
      longitude: z.union([z.string(), z.number()]).nullable().optional(),
      value: z.union([z.string(), z.number()]).nullable().optional(),
    }),
  ),
});

/** Todos os postos com leitura na última hora (do cache de 10 min). */
export async function postosUltimaHora() {
  return lembrar('sibh', 'chuva_agora_1h', TTL.tempoReal, async () => {
    const r = esquema.safeParse(await buscarJson(URL_CHUVA_AGORA, { timeoutMs: 15_000 }));
    if (!r.success) throw new Error('formato inesperado do SIBH');
    const postos: PostoChuva[] = [];
    for (const m of r.data.measurements) {
      const v = numero(m.value);
      if (v === null || v < 0) continue;
      postos.push({
        prefixo: String(m.prefix ?? ''),
        nome: (m.station_name ?? '').trim() || 'Posto pluviométrico',
        municipio: m.city ?? null,
        ugrhi: m.ugrhi_name ?? null,
        lat: numero(m.latitude),
        lon: numero(m.longitude),
        chuvaMm: arred(v, 1),
      });
    }
    return postos.length ? postos : null;
  });
}

export type ResumoChuvaAgora = {
  postosMonitorados: number;
  postosComChuva: number;
  maximaMm: number;
  mediaMm: number;
  maiores: PostoChuva[];
};

/**
 * Resumo para o card "chuva agora". `limiarMm`: o que conta como "posto com
 * chuva" (a Home do PHP usa 0,2 mm; o SibhService usava 0,5 mm).
 */
export async function chuvaAgora(limiarMm = 0.2): Promise<Dado<ResumoChuvaAgora>> {
  const l = await postosUltimaHora();
  if (!l) return comoDado(FONTE, null);
  const postos = [...l.valor].sort((a, b) => b.chuvaMm - a.chuvaMm);
  const comChuva = postos.filter((p) => p.chuvaMm > limiarMm);
  const soma = postos.reduce((s, p) => s + p.chuvaMm, 0);
  return comoDado(FONTE, {
    ...l,
    valor: {
      postosMonitorados: postos.length,
      postosComChuva: comChuva.length,
      maximaMm: postos[0]?.chuvaMm ?? 0,
      mediaMm: postos.length ? arred(soma / postos.length, 1) : 0,
      maiores: comChuva.slice(0, 5),
    },
  });
}
