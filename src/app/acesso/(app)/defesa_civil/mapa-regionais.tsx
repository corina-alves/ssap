'use client';

import { useEffect, useRef, useState } from 'react';

export type RegionalMapa = {
  nome: string;
  centro: [lat: number, lng: number];
  /** Pior situação entre os pontos da regional (null: nenhum ponto monitorado). */
  pior: string | null;
  total: number;
  fora: number;
};
export type PostoMapa = { id: string; rotulo: string; cidade: string; lat: number; lng: number; situacao: string; regional: string | null };

type Linhas = { linhas: [number, number][][] };
/* eslint-disable @typescript-eslint/no-explicit-any */
type Leaflet = any;

const ROTULOS: Record<string, string> = { extravasamento: 'Extravasamento', emergencia: 'Emergência', alerta: 'Alerta', atencao: 'Atenção', normal: 'Normal' };
const ORDEM = Object.keys(ROTULOS);
const ARQUIVO = '/acesso/geo/regionais_defesa_civil_linhas.json';

/** O Leaflet é carregado pela página (ScriptsLegado); espera ele chegar. */
function esperarLeaflet(): Promise<Leaflet | null> {
  return new Promise((ok) => {
    let n = 0;
    const olhar = () => {
      const L = (window as unknown as { L?: Leaflet }).L;
      if (L) ok(L);
      else if (++n > 150) ok(null);
      else setTimeout(olhar, 100);
    };
    olhar();
  });
}

function no(tag: string, classe: string, texto?: string): HTMLElement {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/**
 * Mapa do estado com as divisas das regionais da Defesa Civil
 * (regionais_defesa_civil.geojson) e os pontos monitorados, na cor da situação.
 * O rótulo de cada regional mostra quantos pontos estão fora do normal.
 */
export function MapaRegionais({ regionais, postos }: { regionais: RegionalMapa[]; postos: PostoMapa[] }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let mapa: Leaflet = null;
    let cancelado = false;
    (async () => {
      const [L, dados] = await Promise.all([
        esperarLeaflet(),
        fetch(ARQUIVO).then((r) => (r.ok ? (r.json() as Promise<Linhas>) : null), () => null),
      ]);
      if (cancelado || !caixa.current) return;
      if (!L || !dados) return setErro('Não foi possível montar o mapa das regionais.');

      mapa = L.map(caixa.current, { zoomSnap: 0.25 });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        attribution: 'Base: &copy; Esri, HERE, Garmin, USGS, colaboradores do OpenStreetMap',
      }).addTo(mapa);
      mapa.attributionControl.setPrefix('Leaflet');
      mapa.createPane('rotulos').style.zIndex = 640;

      const divisas = L.featureGroup(dados.linhas.map((l) => L.polyline(l, { color: '#0a4677', weight: 2, opacity: 0.85, interactive: false }))).addTo(mapa);
      mapa.fitBounds(divisas.getBounds(), { padding: [10, 10] });

      // pontos: os normais por baixo, os mais graves por cima
      for (const p of [...postos].sort((a, b) => ORDEM.indexOf(b.situacao) - ORDEM.indexOf(a.situacao))) {
        const grave = p.situacao !== 'normal';
        const popup = no('div', 'dc-popup');
        popup.append(no('strong', '', p.rotulo), no('div', '', p.cidade), no('div', '', `${ROTULOS[p.situacao] ?? p.situacao}${p.regional ? ` · Regional ${p.regional}` : ''}`));
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: `dc-mk-flu dc-mk-flu--${p.situacao}${grave ? ' dc-mk-flu--grande' : ''}`, iconSize: grave ? [17, 16] : [11, 10] }),
          zIndexOffset: grave ? 1000 - ORDEM.indexOf(p.situacao) * 100 : 0,
        })
          .bindPopup(popup)
          .addTo(mapa);
      }

      for (const r of regionais) {
        const rotulo = no('span', `dc-reg dc-reg--${r.pior ?? 'vazia'}`);
        rotulo.append(no('b', '', r.nome));
        if (r.fora) rotulo.append(no('i', '', String(r.fora)));
        const popup = no('div', 'dc-popup');
        popup.append(
          no('strong', '', `Regional ${r.nome}`),
          no('div', '', r.total ? `${r.total} ${r.total === 1 ? 'ponto monitorado' : 'pontos monitorados'}` : 'Sem ponto monitorado agora'),
          no('div', '', r.fora ? `${r.fora} fora do normal` : r.total ? 'Todos em condição normal' : ''),
        );
        L.marker(r.centro, { pane: 'rotulos', icon: L.divIcon({ className: 'dc-reg-icone', html: rotulo, iconSize: [0, 0] }) })
          .bindPopup(popup)
          .addTo(mapa);
      }

      const legenda = L.control({ position: 'bottomleft' });
      legenda.onAdd = () => {
        const div = no('div', 'dc-legenda');
        const usadas = new Set(postos.map((p) => p.situacao));
        for (const s of ORDEM) {
          if (!usadas.has(s)) continue;
          const linha = no('div', 'dc-legenda__item');
          linha.append(no('span', `dc-mk-flu dc-mk-flu--${s}`), no('span', '', `Ponto — ${ROTULOS[s]!.toLowerCase()}`));
          div.append(linha);
        }
        const linha = no('div', 'dc-legenda__item');
        linha.append(no('span', 'dc-legenda__divisa'), no('span', '', 'Divisa das regionais'));
        div.append(linha);
        L.DomEvent.disableClickPropagation(div);
        return div;
      };
      legenda.addTo(mapa);
    })();
    return () => {
      cancelado = true;
      mapa?.remove();
    };
  }, [regionais, postos]);

  return (
    <>
      <div className="dc-mapa dc-mapa--regionais" ref={caixa} role="img" aria-label="Mapa das regionais da Defesa Civil com os pontos monitorados" />
      {erro && <p className="small text-danger mt-1 mb-0">{erro}</p>}
    </>
  );
}
