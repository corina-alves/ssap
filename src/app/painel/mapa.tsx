'use client';

import { useEffect, useRef, useState } from 'react';
import { carregarLeaflet } from '@/components/graficos/mapa-sistemas';
import capital from '@/conteudo/capital-sao-paulo.json';
import type { Contorno } from '@/lib/integracoes/ibge';

/** Marco Zero da cidade de São Paulo (Praça da Sé). */
const MARCO_ZERO: [number, number] = [-23.5503, -46.634];

export type SistemaPainel = {
  nome: string;
  area: Contorno;
  /** Cor do estágio do Protocolo de Escassez. */
  cor: string;
  /** Linhas do popup: [rótulo, valor já formatado]. */
  linhas: [string, string][];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Leaflet = any;

function no(tag: string, classe?: string, texto?: string): HTMLElement {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/**
 * Sistemas produtores sobre o mapa base (OpenStreetMap, escurecido por CSS),
 * coloridos pelo estágio; o popup traz volume, chuva, vazão e outorga.
 */
export function MapaPainel({ sistemas, chave }: { sistemas: SistemaPainel[]; chave: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [pronto, setPronto] = useState(false);
  const sistemasRef = useRef(sistemas);
  sistemasRef.current = sistemas;

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
    const mapa = L.map(caixa.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: true, dragging: true, zoomSnap: 0.25 }).setView([-23.2, -46.4], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, className: 'pnl-tiles' }).addTo(mapa);

    const grupo = L.featureGroup().addTo(mapa);
    for (const s of sistemasRef.current) {
      const popup = no('div', 'pnl-pop');
      popup.append(no('h4', undefined, s.nome));
      for (const [rotulo, valor] of s.linhas) {
        const lin = no('div', 'lin');
        lin.append(no('span', undefined, rotulo), no('b', undefined, valor));
        popup.append(lin);
      }
      const estilo = { color: '#ffffff', weight: 1.2, fillColor: s.cor, fillOpacity: 0.78 };
      const camada = L.geoJSON({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: s.area } }, { style: estilo })
        .bindPopup(popup)
        .bindTooltip(s.nome, { permanent: true, direction: 'center', className: 'pnl-tip' })
        .addTo(grupo);
      camada.on('mouseover', () => camada.setStyle({ weight: 2.4, fillOpacity: 0.92 }));
      camada.on('mouseout', () => camada.setStyle(estilo));
    }
    // Destaque da capital: contorno do município (por cima dos sistemas, sem capturar o clique,
    // para os popups continuarem) e o Marco Zero, na Praça da Sé, com o rótulo.
    L.geoJSON({ type: 'Feature', properties: {}, geometry: { type: capital.tipo, coordinates: capital.coordenadas } }, {
      style: { color: '#ffd166', weight: 2.6, dashArray: '6 4', fillColor: '#ffd166', fillOpacity: 0.08 },
      interactive: false,
    }).addTo(mapa);
    L.marker(MARCO_ZERO, {
      icon: L.divIcon({ className: 'pnl-capital', html: '<i class="bi bi-star-fill"></i>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      keyboard: false,
      zIndexOffset: 1000,
    })
      .bindTooltip('São Paulo — Capital', { permanent: true, direction: 'top', offset: [0, -10], className: 'pnl-tip pnl-tip--capital' })
      .addTo(mapa);

    // A caixa muda de tamanho com a grade do painel: reenquadra os sistemas a cada mudança.
    const enquadrar = () => {
      mapa.invalidateSize();
      if (sistemasRef.current.length) mapa.fitBounds(grupo.getBounds(), { padding: [4, 4] });
    };
    enquadrar();
    const observador = new ResizeObserver(enquadrar);
    observador.observe(caixa.current);
    return () => {
      observador.disconnect();
      mapa.remove();
    };
  }, [pronto, chave]);

  return <div id="pnlMapa" ref={caixa} role="img" aria-label="Mapa dos sistemas produtores da RMSP, coloridos pelo estágio do Protocolo de Escassez" />;
}
