import { classeChuva } from '@/lib/hidrologia/previsao';
import type { Contorno } from '@/lib/integracoes/ibge';
import { Dica } from './dica';
import { LegendaChuva } from './mapa-grade';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Centroide [lon, lat] do maior polígono da área: é onde fica o rótulo. */
export function centroArea(area: Contorno): [number, number] | null {
  let maior = 0;
  let centro: [number, number] | null = null;
  for (const [anel] of area) {
    if (!anel) continue;
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const k = anel[j]![0] * anel[i]![1] - anel[i]![0] * anel[j]![1];
      a += k;
      cx += (anel[j]![0] + anel[i]![0]) * k;
      cy += (anel[j]![1] + anel[i]![1]) * k;
    }
    if (Math.abs(a) > maior) {
      maior = Math.abs(a);
      centro = [cx / (3 * a), cy / (3 * a)];
    }
  }
  return centro;
}

/**
 * Sistemas produtores sobre o contorno do Estado, enquadrados numa janela em
 * volta deles. Com `area` (polígonos GeoJSON da área de drenagem) desenha a
 * área; sem ela, um ponto. Cor = classe de chuva.
 */
export function MapaPontos({
  titulo,
  contorno,
  pontos,
  margemGraus = 0.45,
}: {
  titulo: string;
  contorno: Contorno | null;
  pontos: { nome: string; lat: number; lon: number; chuvaMm: number | null; area?: Contorno | null; dica?: { valor: string; rotulo: string } }[];
  margemGraus?: number;
}) {
  const coords = pontos.flatMap((p) => (p.area?.length ? p.area.flat(2) : [[p.lon, p.lat] as [number, number]]));
  const latMin = Math.min(...coords.map((p) => p[1])) - margemGraus;
  const latMax = Math.max(...coords.map((p) => p[1])) + margemGraus;
  const lonMin = Math.min(...coords.map((p) => p[0])) - margemGraus;
  const lonMax = Math.max(...coords.map((p) => p[0])) + margemGraus;
  const k = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  const L = 640;
  const escala = L / ((lonMax - lonMin) * k);
  const A = Math.round((latMax - latMin) * escala);
  const x = (lon: number) => (lon - lonMin) * k * escala;
  const y = (lat: number) => (latMax - lat) * escala;
  const tracar = (c: Contorno) =>
    c.map((pol) => pol.map((anel) => anel.map(([lo, la], i) => `${i ? 'L' : 'M'}${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join('') + 'Z').join('')).join('');
  const caminho = contorno && tracar(contorno);

  return (
    <figure className="grafico">
      <figcaption className="sr-only">{titulo}</figcaption>
      <Dica>
        <svg viewBox={`0 0 ${L} ${A}`} className="mapa mapa-pontos" role="img" aria-label={titulo}>
          <rect x={0} y={0} width={L} height={A} className="mapa-mar" />
          {caminho && <path d={caminho} className="mapa-terra" />}
          {pontos.map((p) => {
            const c = classeChuva(p.chuvaMm);
            const cor = c < 0 ? 'seq-vazio' : `seq-${c}`;
            const area = p.area?.length ? p.area : null;
            const [lon, lat] = (area && centroArea(area)) ?? [p.lon, p.lat];
            return (
              <g
                key={p.nome}
                data-dica-valor={p.dica?.valor ?? (p.chuvaMm === null ? 'sem dado' : `${fmt(p.chuvaMm)} mm`)}
                data-dica-rotulo={p.dica?.rotulo ?? `${p.nome} · 7 dias`}
                tabIndex={0}
              >
                {area ? (
                  <path d={tracar(area)} fillRule="evenodd" className={`${cor} mapa-area`} />
                ) : (
                  <circle cx={x(lon)} cy={y(lat)} r={16} className={`${cor} mapa-ponto`} />
                )}
                <text x={x(lon)} y={area ? y(lat) + 4 : y(lat) - 22} textAnchor="middle" className="mapa-rotulo mapa-rotulo-pequeno">
                  {p.nome}
                </text>
              </g>
            );
          })}
        </svg>
      </Dica>
      <LegendaChuva />
    </figure>
  );
}
