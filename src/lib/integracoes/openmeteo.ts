import { z } from 'zod';
import { lembrar, TTL } from './cache';
import { comoDado, type Dado } from './comum';
import { arred, buscarJson } from './http';

/**
 * Open-Meteo — previsão (forecast) e geocodificação.
 * A forecast aceita várias coordenadas numa chamada: devolve um objeto para 1
 * ponto e uma lista para vários.
 */

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
export const FONTE = 'Open-Meteo';

/** Centroides aproximados dos sistemas produtores da RMSP (da referência). */
export const CENTROIDES_SISTEMAS = [
  { sistema: 'Cantareira', lat: -22.75, lon: -46.35 },
  { sistema: 'Alto Tietê', lat: -23.55, lon: -46.2 },
  { sistema: 'Guarapiranga', lat: -23.72, lon: -46.73 },
  { sistema: 'Cotia', lat: -23.63, lon: -46.95 },
  { sistema: 'Rio Grande', lat: -23.79, lon: -46.42 },
  { sistema: 'Rio Claro', lat: -23.51, lon: -45.95 },
  { sistema: 'São Lourenço', lat: -23.75, lon: -47.15 },
] as const;

/** Limites aproximados do Estado de São Paulo, para a grade do mapa. */
export const BBOX_SP = { latMin: -25.4, latMax: -19.7, lonMin: -53.2, lonMax: -44.1 } as const;

const diario = z.looseObject({
  latitude: z.number(),
  longitude: z.number(),
  daily: z.looseObject({
    time: z.array(z.string()),
    precipitation_sum: z.array(z.number().nullable()).optional(),
    precipitation_probability_max: z.array(z.number().nullable()).optional(),
    temperature_2m_max: z.array(z.number().nullable()).optional(),
    temperature_2m_min: z.array(z.number().nullable()).optional(),
  }),
});

export type PrevisaoDiaria = {
  lat: number;
  lon: number;
  datas: string[];
  chuvaMm: (number | null)[];
  probabilidade: (number | null)[];
  tmax: (number | null)[];
  tmin: (number | null)[];
};

const r1 = (v: number | null) => (v === null ? null : arred(v, 1));

/** Previsão diária para vários pontos numa só chamada. */
async function previsaoPontos(pontos: { lat: number; lon: number }[], dias: number, completa: boolean): Promise<PrevisaoDiaria[] | null> {
  const campos = completa
    ? 'precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min'
    : 'precipitation_sum';
  const url =
    `${FORECAST}?latitude=${pontos.map((p) => p.lat).join(',')}&longitude=${pontos.map((p) => p.lon).join(',')}` +
    `&daily=${campos}&forecast_days=${dias}&timezone=America%2FSao_Paulo`;
  const json = await buscarJson(url, { timeoutMs: 20_000 });
  const r = z.array(diario).safeParse(Array.isArray(json) ? json : [json]);
  if (!r.success || r.data.length !== pontos.length) throw new Error('formato inesperado da Open-Meteo');
  return r.data.map((p) => ({
    lat: p.latitude,
    lon: p.longitude,
    datas: p.daily.time,
    chuvaMm: (p.daily.precipitation_sum ?? []).map(r1),
    probabilidade: p.daily.precipitation_probability_max ?? [],
    tmax: (p.daily.temperature_2m_max ?? []).map(r1),
    tmin: (p.daily.temperature_2m_min ?? []).map(r1),
  }));
}

const limitarDias = (d: number) => Math.max(1, Math.min(16, Math.trunc(d) || 1));

/** Previsão para os sistemas produtores (chuva, probabilidade, temperaturas). */
export async function previsaoSistemas(dias = 7): Promise<Dado<(PrevisaoDiaria & { sistema: string })[]>> {
  const n = limitarDias(dias);
  const l = await lembrar('previsao', `sistemas:${n}`, TTL.hora, async () => {
    const r = await previsaoPontos([...CENTROIDES_SISTEMAS], n, true);
    return r && r.map((p, i) => ({ ...p, sistema: CENTROIDES_SISTEMAS[i]!.sistema }));
  });
  return comoDado(FONTE, l);
}

/** Previsão para um ponto (ex.: sede de município). */
export async function previsaoPonto(lat: number, lon: number, dias = 7): Promise<Dado<PrevisaoDiaria>> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('Coordenadas inválidas.');
  }
  const n = limitarDias(dias);
  const la = arred(lat, 3);
  const lo = arred(lon, 3);
  const l = await lembrar('previsao', `ponto:${la}:${lo}:${n}`, TTL.hora, async () => (await previsaoPontos([{ lat: la, lon: lo }], n, true))?.[0] ?? null);
  return comoDado(FONTE, l);
}

/** Chuva diária prevista (mm) em vários pontos, numa só chamada. `chave` identifica o conjunto de pontos no cache. */
export async function chuvaPontos(chave: string, pontos: { lat: number; lon: number }[], dias = 7): Promise<Dado<PrevisaoDiaria[]>> {
  const n = limitarDias(dias);
  return comoDado(FONTE, await lembrar('previsao', `chuva:${chave}:${n}`, TTL.hora, () => previsaoPontos(pontos, n, false)));
}

export type PontoGrade = { lat: number; lon: number; chuvaMm: number | null };

/** Grade de chuva prevista (soma do horizonte) cobrindo o Estado, para o mapa. */
export async function gradeEstado(dias = 1): Promise<Dado<PontoGrade[]>> {
  const n = Math.max(1, Math.min(7, Math.trunc(dias) || 1));
  const pontos: { lat: number; lon: number }[] = [];
  for (let la = BBOX_SP.latMin; la <= BBOX_SP.latMax + 1e-9; la += 0.55) {
    for (let lo = BBOX_SP.lonMin; lo <= BBOX_SP.lonMax + 1e-9; lo += 0.65) pontos.push({ lat: arred(la, 2), lon: arred(lo, 2) });
  }
  const l = await lembrar('previsao', `grade:${n}:${pontos.length}`, TTL.hora, async () => {
    const r = await previsaoPontos(pontos, n, false);
    return (
      r &&
      r.map((p, i) => ({
        lat: pontos[i]!.lat,
        lon: pontos[i]!.lon,
        chuvaMm: p.chuvaMm.some((v) => v !== null) ? arred(p.chuvaMm.reduce<number>((s, v) => s + (v ?? 0), 0), 1) : null,
      }))
    );
  });
  return comoDado(FONTE, l);
}

export type Lugar = { nome: string; lat: number; lon: number; regiao: string | null };

/** Geocodificação de município paulista (cache de 30 dias). */
export async function geocodificar(nome: string): Promise<Dado<Lugar[]>> {
  const termo = nome.trim().slice(0, 80);
  if (termo.length < 2) return { ok: true, dados: [], fonte: FONTE, obtidoEm: new Date(), desatualizado: false };
  const l = await lembrar('geocoding', `sp:${termo.toLowerCase()}`, TTL.cadastro, async () => {
    const json = await buscarJson(`${GEOCODING}?name=${encodeURIComponent(termo)}&count=10&language=pt&country=BR`);
    const r = z
      .looseObject({
        results: z
          .array(z.looseObject({ name: z.string(), latitude: z.number(), longitude: z.number(), admin1: z.string().optional(), admin2: z.string().optional() }))
          .optional(),
      })
      .safeParse(json);
    if (!r.success) throw new Error('formato inesperado da geocodificação');
    return (r.data.results ?? [])
      .filter((x) => x.admin1 === 'São Paulo')
      .map((x) => ({ nome: x.name, lat: x.latitude, lon: x.longitude, regiao: x.admin2 ?? null }));
  });
  return comoDado(FONTE, l);
}

// ---------------------------------------------------------------------------
// Previsão completa por município (página /previsao)
// ---------------------------------------------------------------------------

/** Condição do tempo pelo código WMO da Open-Meteo. */
export function condicao(codigo: number | null): string {
  if (codigo === null) return '—';
  if (codigo === 0) return 'Céu limpo';
  if (codigo <= 2) return 'Poucas nuvens';
  if (codigo === 3) return 'Nublado';
  if (codigo === 45 || codigo === 48) return 'Neblina';
  if (codigo >= 51 && codigo <= 57) return 'Garoa';
  if (codigo >= 61 && codigo <= 67) return codigo >= 65 ? 'Chuva forte' : 'Chuva';
  if (codigo >= 71 && codigo <= 77) return 'Neve';
  if (codigo >= 80 && codigo <= 82) return codigo === 82 ? 'Pancadas fortes' : 'Pancadas de chuva';
  if (codigo >= 95) return 'Tempestade';
  return '—';
}

export type DiaPrevisto = {
  data: string;
  codigo: number | null;
  chuvaMm: number | null;
  probabilidade: number | null;
  tmax: number | null;
  tmin: number | null;
  ventoKmh: number | null;
};

export type PrevisaoMunicipio = { lat: number; lon: number; umidadeAtual: number | null; dias: DiaPrevisto[] };

/** 7 dias: chuva, probabilidade, temperaturas, vento, condição + umidade atual. */
export async function previsaoMunicipio(lat: number, lon: number): Promise<Dado<PrevisaoMunicipio>> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Coordenadas inválidas.');
  const la = arred(lat, 3);
  const lo = arred(lon, 3);
  const l = await lembrar('previsao', `municipio:${la}:${lo}`, TTL.hora, async () => {
    const url =
      `${FORECAST}?latitude=${la}&longitude=${lo}&current=relative_humidity_2m` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max' +
      '&forecast_days=7&timezone=America%2FSao_Paulo';
    const nulo = z.array(z.number().nullable());
    const r = z
      .looseObject({
        latitude: z.number(),
        longitude: z.number(),
        current: z.looseObject({ relative_humidity_2m: z.number().nullable().optional() }).optional(),
        daily: z.looseObject({
          time: z.array(z.string()),
          weather_code: nulo,
          temperature_2m_max: nulo,
          temperature_2m_min: nulo,
          precipitation_sum: nulo,
          precipitation_probability_max: nulo,
          wind_speed_10m_max: nulo,
        }),
      })
      .safeParse(await buscarJson(url));
    if (!r.success) throw new Error('formato inesperado da Open-Meteo');
    const d = r.data.daily;
    return {
      lat: r.data.latitude,
      lon: r.data.longitude,
      umidadeAtual: r.data.current?.relative_humidity_2m ?? null,
      dias: d.time.map((data, i) => ({
        data,
        codigo: d.weather_code[i] ?? null,
        chuvaMm: r1(d.precipitation_sum[i] ?? null),
        probabilidade: d.precipitation_probability_max[i] ?? null,
        tmax: r1(d.temperature_2m_max[i] ?? null),
        tmin: r1(d.temperature_2m_min[i] ?? null),
        ventoKmh: r1(d.wind_speed_10m_max[i] ?? null),
      })),
    };
  });
  return comoDado(FONTE, l);
}
