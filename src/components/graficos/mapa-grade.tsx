import { CLASSES_CHUVA, classeChuva } from '@/lib/hidrologia/previsao';
import type { Contorno } from '@/lib/integracoes/ibge';
import { Dica } from './dica';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Legenda da escala sequencial de chuva (classes em mm). */
export function LegendaChuva() {
  return (
    <ul className="legenda legenda-escala" aria-label="Escala de chuva prevista, em mm">
      {CLASSES_CHUVA.map(([, rotulo], i) => (
        <li key={rotulo}>
          <span className={`chave chave-barra seq-${i}`} />
          {rotulo}
        </li>
      ))}
      <li>mm</li>
    </ul>
  );
}

/**
 * Mapa da chuva prevista: células da grade recortadas pelo contorno do Estado
 * (IBGE). Projeção equiretangular com correção de cos(latitude média).
 */
export function MapaGrade({
  titulo,
  contorno,
  pontos,
  passoLat,
  passoLon,
  marcador,
}: {
  titulo: string;
  contorno: Contorno | null;
  pontos: { lat: number; lon: number; chuvaMm: number | null }[];
  passoLat: number;
  passoLon: number;
  marcador?: { nome: string; lat: number; lon: number } | null;
}) {
  const lats = contorno ? contorno.flat(2).map((p) => p[1]) : pontos.map((p) => p.lat);
  const lons = contorno ? contorno.flat(2).map((p) => p[0]) : pontos.map((p) => p.lon);
  const [latMin, latMax, lonMin, lonMax] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const k = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  const L = 800;
  const escala = L / ((lonMax - lonMin) * k);
  const A = Math.round((latMax - latMin) * escala);
  const x = (lon: number) => (lon - lonMin) * k * escala;
  const y = (lat: number) => (latMax - lat) * escala;
  const caminho = contorno
    ?.map((poligono) =>
      poligono.map((anel) => anel.map(([lo, la], i) => `${i ? 'L' : 'M'}${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join('') + 'Z').join(''),
    )
    .join('');
  const w = passoLon * k * escala;
  const h = passoLat * escala;

  return (
    <figure className="grafico">
      <figcaption className="sr-only">{titulo}</figcaption>
      <Dica>
        <svg viewBox={`0 0 ${L} ${A}`} className="mapa" role="img" aria-label={titulo}>
          {caminho && (
            <defs>
              <clipPath id="recorte-sp">
                <path d={caminho} />
              </clipPath>
            </defs>
          )}
          <g clipPath={caminho ? 'url(#recorte-sp)' : undefined}>
            {pontos.map((p) => {
              const c = classeChuva(p.chuvaMm);
              const texto = p.chuvaMm === null ? 'sem dado' : `${fmt(p.chuvaMm)} mm`;
              return (
                <rect
                  key={`${p.lat},${p.lon}`}
                  className={c < 0 ? 'seq-vazio' : `seq-${c}`}
                  x={x(p.lon) - w / 2}
                  y={y(p.lat) - h / 2}
                  width={w + 0.5}
                  height={h + 0.5}
                  data-dica-valor={texto}
                  data-dica-rotulo={`${Math.abs(p.lat).toFixed(2)}° S, ${Math.abs(p.lon).toFixed(2)}° O`}
                />
              );
            })}
          </g>
          {caminho && <path d={caminho} className="mapa-contorno" />}
          {marcador && (
            <g>
              <circle cx={x(marcador.lon)} cy={y(marcador.lat)} r={6} className="mapa-marcador" />
              <text x={x(marcador.lon) + 10} y={y(marcador.lat) + 5} className="mapa-rotulo">
                {marcador.nome}
              </text>
            </g>
          )}
        </svg>
      </Dica>
      <LegendaChuva />
    </figure>
  );
}
