'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Contorno } from '@/lib/integracoes/ibge';

export type SistemaMapa = {
  nome: string;
  area: Contorno;
  /** Onde fica o rótulo com o nome: [lat, lon]. */
  centro: [number, number];
  /** Classe de chuva em 7 dias (índice da escala seq-N; negativo = sem dado). */
  classe: number;
  /** Linhas do popup: [horizonte, valor já formatado]. */
  linhas: [string, string][];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Leaflet = any;

const SCRIPT = '/acesso/vendor/leaflet/leaflet.js';

/** Carrega o Leaflet (o mesmo da área /acesso) uma única vez. */
export function carregarLeaflet(): Promise<Leaflet | null> {
  const w = window as unknown as { L?: Leaflet };
  if (w.L) return Promise.resolve(w.L);
  return new Promise((ok) => {
    const s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`) ?? document.body.appendChild(Object.assign(document.createElement('script'), { src: SCRIPT }));
    s.addEventListener('load', () => ok(w.L ?? null));
    s.addEventListener('error', () => ok(null));
  });
}

function no(tag: string, texto?: string): HTMLElement {
  const e = document.createElement(tag);
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/**
 * Áreas de drenagem dos sistemas produtores sobre o mapa base (OpenStreetMap),
 * como no previsao-reservatorios.php. `children` é o mapa em SVG: fica no lugar
 * enquanto o Leaflet não carrega (ou sem JavaScript).
 */
export function MapaSistemas({ titulo, sistemas, children }: { titulo: string; sistemas: SistemaMapa[]; children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    carregarLeaflet().then((L) => {
      if (L && !cancelado) setPronto(true);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    const L = (window as unknown as { L?: Leaflet }).L;
    if (!pronto || !L || !caixa.current) return;
    const mapa = L.map(caixa.current, { scrollWheelZoom: true, minZoom: 6, maxZoom: 12 }).setView([-23.4, -46.6], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; colaboradores do OpenStreetMap',
      maxZoom: 19,
      opacity: 0.6,
    }).addTo(mapa);
    L.control.scale({ imperial: false }).addTo(mapa);

    const grupo = L.featureGroup().addTo(mapa);
    for (const s of sistemas) {
      const popup = no('div');
      popup.append(no('strong', s.nome));
      for (const [rotulo, valor] of s.linhas) popup.append(no('div', `${rotulo}: ${valor}`));
      // ao passar o mouse: chuva de hoje (1ª linha) e o acumulado que dá a cor (última)
      const dica = no('div');
      dica.append(no('strong', s.nome));
      for (const [rotulo, valor] of [s.linhas[0]!, s.linhas.at(-1)!]) dica.append(no('div', `${rotulo}: ${valor}`));
      L.geoJSON(
        { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: s.area } },
        { className: `${s.classe < 0 ? 'seq-vazio' : `seq-${s.classe}`} mapa-area`, style: { fillOpacity: 0.75 } },
      )
        .bindTooltip(dica, { sticky: true })
        .bindPopup(popup)
        .addTo(grupo);
      L.tooltip({ permanent: true, direction: 'center', className: 'prevrsv-tip' }).setLatLng(s.centro).setContent(s.nome).addTo(grupo);
    }
    if (sistemas.length) mapa.fitBounds(grupo.getBounds(), { padding: [24, 24] });
    return () => {
      mapa.remove();
    };
  }, [pronto, sistemas]);

  return (
    <div className={`prevrsv-mapa-wrap${pronto ? ' is-leaflet' : ''}`}>
      <div id="prevRsvMapa" ref={caixa} role="img" aria-label={titulo} />
      {children}
    </div>
  );
}
