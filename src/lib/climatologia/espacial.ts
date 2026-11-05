/**
 * Média espacial da chuva nas UGRHIs — puro (sem banco nem rede).
 *
 * Thiessen numa grade: cada UGRHI (limite oficial, src/conteudo/ugrhi.json) vira
 * células de PASSO_GRAUS (~2 km); cada célula fica com o posto válido mais
 * próximo, e o peso do posto é a área das células dele. É o mesmo resultado dos
 * polígonos de Thiessen, na resolução da grade, refeito a cada mês só com os
 * postos que têm o mês válido — a rede muda ao longo dos anos. Postos de fora
 * da UGRHI entram quando são os mais próximos de uma célula (como no Thiessen).
 *
 * Cobertura: % da área da UGRHI a até RAIO_KM de um posto válido.
 */

export const PASSO_GRAUS = 0.02;
/** Postos candidatos guardados por célula (os mais próximos); sem nenhum válido entre eles, a célula fica descoberta. */
export const CANDIDATOS = 40;
export const RAIO_KM = 20;
/** Cobertura mínima para o mês da UGRHI entrar na climatologia. */
export const COBERTURA_MIN = 70;

type Anel = number[][];
type Feicao = { properties: { codigo: number; nome: string }; geometry: { type: string; coordinates: unknown } };
export type Limites = { features: Feicao[] };

export type PostoGeo = { id: number; lat: number; lon: number; ugrhi: number | null };

function noAnel(x: number, y: number, a: Anel): boolean {
  let dentro = false;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    const [xi, yi] = a[i] as [number, number];
    const [xj, yj] = a[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) dentro = !dentro;
  }
  return dentro;
}

type Area = { codigo: number; nome: string; poligonos: Anel[][]; caixa: [number, number, number, number] };

function areas(limites: Limites): Area[] {
  return limites.features.map((f) => {
    const poligonos = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Anel[][];
    const pts = poligonos.flat(2);
    const xs = pts.map((p) => p[0]!);
    const ys = pts.map((p) => p[1]!);
    return { codigo: f.properties.codigo, nome: f.properties.nome, poligonos, caixa: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  });
}

const dentroDe = (a: Area, x: number, y: number) =>
  x >= a.caixa[0] && x <= a.caixa[2] && y >= a.caixa[1] && y <= a.caixa[3] && a.poligonos.some((p) => p[0] && noAnel(x, y, p[0]) && !p.slice(1).some((buraco) => noAnel(x, y, buraco)));

/** Classificador de pontos pela UGRHI do limite oficial (null = fora das 22). */
export function classificadorUgrhi(limites: Limites): (lon: number, lat: number) => number | null {
  const as = areas(limites);
  return (lon, lat) => as.find((a) => dentroDe(a, lon, lat))?.codigo ?? null;
}

/** Distância aproximada em km (equirretangular: erro desprezível nestas distâncias). */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dx = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)) * 111.32;
  const dy = (lat2 - lat1) * 110.57;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Células de uma UGRHI: peso (área relativa) e, para cada célula, os postos mais próximos em ordem de distância. */
export type CelulasUgrhi = { codigo: number; nome: string; n: number; area: Float64Array; candidatos: Int32Array; distancias: Float32Array; k: number };

export function montarGrade(limites: Limites, postos: readonly PostoGeo[], passo = PASSO_GRAUS, k = CANDIDATOS): Map<number, CelulasUgrhi> {
  const grade = new Map<number, CelulasUgrhi>();
  const kk = Math.min(k, postos.length);
  for (const a of areas(limites)) {
    const celulas: [number, number][] = [];
    for (let y = Math.floor(a.caixa[1] / passo) * passo + passo / 2; y < a.caixa[3]; y += passo) {
      for (let x = Math.floor(a.caixa[0] / passo) * passo + passo / 2; x < a.caixa[2]; x += passo) if (dentroDe(a, x, y)) celulas.push([x, y]);
    }
    const n = celulas.length;
    const area = new Float64Array(n);
    const candidatos = new Int32Array(n * kk).fill(-1);
    const distancias = new Float32Array(n * kk).fill(Infinity);
    celulas.forEach(([x, y], c) => {
      area[c] = Math.cos(y * (Math.PI / 180)); // área da célula em graus² é proporcional ao cosseno da latitude
      const base = c * kk;
      for (let p = 0; p < postos.length; p++) {
        const d = distanciaKm(y, x, postos[p]!.lat, postos[p]!.lon);
        if (d >= distancias[base + kk - 1]!) continue;
        let i = kk - 1; // inserção ordenada entre os k mais próximos
        while (i > 0 && distancias[base + i - 1]! > d) {
          distancias[base + i] = distancias[base + i - 1]!;
          candidatos[base + i] = candidatos[base + i - 1]!;
          i--;
        }
        distancias[base + i] = d;
        candidatos[base + i] = p;
      }
    });
    grade.set(a.codigo, { codigo: a.codigo, nome: a.nome, n, area, candidatos, distancias, k: kk });
  }
  return grade;
}

export type ResultadoRegional = {
  /** Chuva média ponderada (mm); null sem nenhuma célula com posto válido. */
  chuva: number | null;
  /** Peso de cada posto (índice em `postos`), somando 1. */
  pesos: Map<number, number>;
  /** % da área a até `raioKm` de um posto válido. */
  cobertura: number;
};

/**
 * Média de Thiessen do mês: `valor[p]` é a chuva do posto p, ou NaN se o mês dele
 * não é válido. Células sem posto válido entre os candidatos ficam de fora da
 * média e contam como descobertas.
 */
export function thiessen(u: CelulasUgrhi, valor: Float64Array, raioKm = RAIO_KM): ResultadoRegional {
  const pesos = new Map<number, number>();
  let total = 0;
  let coberta = 0;
  let atribuida = 0;
  for (let c = 0; c < u.n; c++) {
    const base = c * u.k;
    total += u.area[c]!;
    for (let i = 0; i < u.k; i++) {
      const p = u.candidatos[base + i]!;
      if (p < 0) break;
      if (Number.isNaN(valor[p]!)) continue;
      pesos.set(p, (pesos.get(p) ?? 0) + u.area[c]!);
      atribuida += u.area[c]!;
      if (u.distancias[base + i]! <= raioKm) coberta += u.area[c]!;
      break;
    }
  }
  if (!atribuida) return { chuva: null, pesos: new Map(), cobertura: 0 };
  let chuva = 0;
  for (const [p, w] of pesos) {
    pesos.set(p, w / atribuida);
    chuva += (w / atribuida) * valor[p]!;
  }
  return { chuva, pesos, cobertura: (100 * coberta) / total };
}
