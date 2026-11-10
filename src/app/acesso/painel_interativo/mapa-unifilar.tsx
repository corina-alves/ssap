'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { carregarLeaflet } from '@/components/graficos/mapa-sistemas';
import type { Diagrama } from '@/conteudo/diagramas-unifilares';
import areas from '@/conteudo/sistemas-produtores-areas.json';
import { BASES, type NomeBase } from './bases-mapa';
import { normalizar, planoNoMapa, type PlanoMapa, type Pt } from './posicoes-mapa';

/**
 * Diagrama unifilar sobre o mapa, no lugar real: os nós nas coordenadas deles
 * e os rios pelo traçado da hidrografia (posicoes-mapa.ts), com zoom e
 * arrastar. Embaixo, a área do sistema e a hidrografia principal dele (rios
 * com nome e represas; hidrografia-sistemas.json, carregada junto com o mapa:
 * serve também para traçar os rios). O desenho em si vem de `children`
 * (desenho-mapa.tsx), com o plano, o zoom (f = 2^zoom) e onde o mundo está na tela (t).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Leaflet = any;

/** Por sistema (chave do diagrama): rios (trechos [lon, lat] e ponto do nome) e represas (anéis [lon, lat]). */
type Hidrografia = { sistemas: Record<string, { rios: { n: string; c: [number, number][][]; r: [number, number] }[]; aguas: { n: string; c: [number, number][][] }[] }> };

const COR_RIO = '#1fa8ff';
const COR_AGUA = '#1fb2ff';

const ZOOM = { min: 8, max: 17, inicialMin: 9, inicialMax: 14 };

/** Escala dos símbolos (px por unidade do esquema): um pouco menor que a do esquema, para caberem no mapa. */
const escala = (d: Diagrama, w: number, h: number) => Math.max(0.45, Math.min(0.8, 0.8 * Math.min(w / d.largura, h / d.altura)));

/** O que o desenho precisa: o plano, o zoom (f = 2^zoom), onde o mundo está na tela (t) e a escala dos símbolos (s). */
export type VistaMapa = { plano: PlanoMapa; f: number; t: Pt; s: number };

export function MapaUnifilar({ d, base, hidro, children }: { d: Diagrama; base: NomeBase; hidro: boolean; children: (v: VistaMapa) => ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const Lf = useRef<Leaflet>(null);
  const mapa = useRef<Leaflet>(null);
  const bases = useRef<Record<string, Leaflet>>({});
  const area = useRef<Leaflet>(null);
  const camadaHidro = useRef<Leaflet>(null);
  const telasHidro = useRef<{ rios: Leaflet; aguas: Leaflet } | null>(null);
  const [pronto, setPronto] = useState(false);
  // hidrografia de todos os sistemas: traça os rios do diagrama e desenha a camada "Hidrografia"
  const [hidrografia, setHidrografia] = useState<Hidrografia | null>(null);
  const plano = useMemo(() => hidrografia && planoNoMapa(d, hidrografia.sistemas[d.chave]?.rios ?? [], hidrografia.sistemas[d.chave]?.aguas ?? []), [d, hidrografia]);
  // `plano` junto: ao trocar de sistema, a vista antiga (de outro diagrama) não serve
  const [vista, setVista] = useState<VistaMapa | null>(null);
  const sistema = d.titulo.replace(/^Sistema /, '');

  // onde o mundo está na tela; no zoom animado, já onde estará no fim da animação
  const alvoZoom = useRef<{ centro: Leaflet; zoom: number } | null>(null);
  const atualizar = useRef<() => void>(() => {});
  atualizar.current = () => {
    const m = mapa.current;
    const t = m?.getSize();
    if (!m || !plano || !t.x || !t.y) return;
    const a = alvoZoom.current;
    const z = a ? a.zoom : m.getZoom();
    const c = m.project(a ? a.centro : m.getCenter(), z);
    setVista({ plano, f: 2 ** z, t: [t.x / 2 - c.x, t.y / 2 - c.y], s: escala(d, t.x, t.y) });
  };

  /** Vista inicial: o desenho todo na caixa, com folga para os símbolos. */
  const enquadrar = useRef<() => void>(() => {});
  // até alguém arrastar ou dar zoom, a vista inicial é refeita quando o mapa muda de tamanho
  const mexeu = useRef(false);
  enquadrar.current = () => {
    const m = mapa.current;
    const t = m?.getSize();
    if (!m || !plano || !t.x || !t.y) return;
    mexeu.current = false;
    const [x0, y0, x1, y1] = plano.caixa;
    // folga em volta do desenho para os símbolos e nomes dos pontos da borda
    const folga = 2 * 95 * escala(d, t.x, t.y);
    const util = (v: number) => (v > 2 * folga ? v - folga : v);
    const z = Math.log2(Math.min(util(t.x) / Math.max(x1 - x0, 1e-9), util(t.y) / Math.max(y1 - y0, 1e-9)));
    m.setView(m.unproject([(x0 + x1) / 2, (y0 + y1) / 2], 0), Math.max(ZOOM.inicialMin, Math.min(ZOOM.inicialMax, Math.floor(z * 4) / 4)), { animate: false });
    atualizar.current();
  };

  // monta o mapa uma vez
  useEffect(() => {
    let vivo = true;
    let observador: ResizeObserver | null = null;
    let quadro = 0;
    carregarLeaflet().then((L) => {
      if (!vivo || !L || !caixa.current) return;
      Lf.current = L;
      // vista provisória (o Leaflet não calcula posições sem centro e zoom); a de verdade vem do enquadrar
      const m = L.map(caixa.current, { zoomSnap: 0.25, zoomDelta: 0.5, scrollWheelZoom: false, minZoom: ZOOM.min, maxZoom: ZOOM.max }).setView([-23.5, -46.6], 10);
      mapa.current = m;
      // rolagem do mouse só depois de clicar no mapa (para não prender a rolagem da página), como no mapa do SIM
      m.on('focus', () => m.scrollWheelZoom.enable());
      m.on('blur', () => m.scrollWheelZoom.disable());
      for (const [nome, z] of [['un-area', 405], ['un-aguas', 410], ['un-rios', 415], ['un-rios-nomes', 420]] as const) m.createPane(nome).style.zIndex = String(z);
      for (const b of BASES) bases.current[b.nome] = L.tileLayer(b.camadas[0], { maxZoom: ZOOM.max, maxNativeZoom: 16, attribution: b.atribuicao });
      area.current = L.featureGroup().addTo(m);
      telasHidro.current = { rios: L.canvas({ pane: 'un-rios', padding: 0.3 }), aguas: L.canvas({ pane: 'un-aguas', padding: 0.3 }) };

      // botão de voltar à vista inicial, abaixo do zoom
      const Enquadrar = L.Control.extend({
        onAdd: () => {
          const barra = L.DomUtil.create('div', 'leaflet-bar');
          const a = L.DomUtil.create('a', 'un-mapa-enquadrar', barra);
          a.href = '#';
          a.title = 'Voltar à vista inicial';
          a.setAttribute('role', 'button');
          a.setAttribute('aria-label', 'Voltar à vista inicial');
          a.innerHTML = '<i class="bi bi-arrows-fullscreen" aria-hidden="true"></i>';
          L.DomEvent.disableClickPropagation(barra);
          L.DomEvent.on(a, 'click', (e: Event) => {
            L.DomEvent.preventDefault(e);
            enquadrar.current();
          });
          return barra;
        },
      });
      new Enquadrar({ position: 'topleft' }).addTo(m);

      const agendar = () => {
        if (!quadro) quadro = requestAnimationFrame(() => ((quadro = 0), atualizar.current()));
      };
      m.on('move zoom viewreset resize', agendar);
      m.on('zoomanim', (e: Leaflet) => {
        alvoZoom.current = { centro: e.center, zoom: e.zoom };
        atualizar.current();
      });
      m.on('zoomend', () => {
        alvoZoom.current = null;
        atualizar.current();
      });
      for (const ev of ['dragstart', 'boxzoomstart', 'dblclick']) m.on(ev, () => (mexeu.current = true));
      L.DomEvent.on(caixa.current, 'wheel', () => (mexeu.current = true));
      m.on('zoomstart', (e: Leaflet) => e.originalEvent !== undefined && (mexeu.current = true));
      L.DomEvent.on(m.zoomControl.getContainer(), 'click', () => (mexeu.current = true));
      observador = new ResizeObserver(() => {
        m.invalidateSize({ pan: false });
        if (mexeu.current) agendar();
        else enquadrar.current();
      });
      observador.observe(caixa.current);
      setPronto(true);
    });
    // sem a hidrografia, os rios do diagrama vão em linha reta entre os pontos
    import('@/conteudo/hidrografia-sistemas.json').then(
      (mod) => vivo && setHidrografia((mod.default ?? mod) as unknown as Hidrografia),
      () => vivo && setHidrografia({ sistemas: {} }),
    );
    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
      observador?.disconnect();
      mapa.current?.remove();
      mapa.current = null;
      bases.current = {};
    };
  }, []);

  // área do sistema
  useEffect(() => {
    const m = mapa.current;
    if (!m || !pronto) return;
    area.current.clearLayers();
    const f = areas.features.find((x) => x.properties.sistema === sistema);
    if (f)
      Lf.current
        .geoJSON(f, { pane: 'un-area', interactive: false, style: { color: '#9c7478', weight: 1, opacity: 0.6, fillColor: '#7a5458', fillOpacity: 0.3 } })
        .addTo(area.current);
  }, [sistema, pronto]);

  // vista inicial (de novo ao trocar de sistema)
  useEffect(() => {
    if (pronto && plano) enquadrar.current();
  }, [plano, pronto]);

  // mapa base escolhido
  useEffect(() => {
    const m = mapa.current;
    if (!m || !pronto) return;
    for (const [nome, camada] of Object.entries(bases.current)) {
      if (nome === base) camada.addTo(m);
      else camada.remove();
    }
  }, [base, pronto]);

  // camada "Hidrografia": rios principais do sistema com o nome e as represas
  useEffect(() => {
    const m = mapa.current;
    const L = Lf.current;
    const h = hidrografia?.sistemas[d.chave];
    if (!m || !pronto || !hidro || !h) return;
    const grupo = L.featureGroup([], { attribution: 'Hidrografia: IBGE (BC250) e © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
    const { rios: telaRios, aguas: telaAguas } = telasHidro.current!;
    const latLon = (c: [number, number][]) => c.map(([lon, lat]) => [lat, lon]);
    // nomes que o diagrama já escreve junto da linha dele ("Rio Cotia → Rio Tietê": os dois)
    const noDesenho = new Set(
      [...d.ligacoes.map((l) => l.rotulo?.texto), ...(d.textos ?? []).filter((t) => !t.semMapa).map((t) => t.texto)].flatMap((t) => (t ? t.split('→').map(normalizar) : [])),
    );
    for (const a of h.aguas) {
      L.polygon(a.c.map(latLon), { renderer: telaAguas, color: COR_AGUA, weight: 0.6, opacity: 0.9, fillColor: COR_AGUA, fillOpacity: 0.85 })
        .bindTooltip(a.n, { sticky: true, className: 'mu-dica' })
        .addTo(grupo);
    }
    for (const r of h.rios) {
      // rio em azul com tracejado claro por cima, mais fino que as linhas do diagrama (que seguem em destaque)
      for (const c of r.c) {
        L.polyline(latLon(c), { renderer: telaRios, color: COR_RIO, weight: 1.8, opacity: 0.7 }).bindTooltip(r.n, { sticky: true, className: 'mu-dica' }).addTo(grupo);
        L.polyline(latLon(c), { renderer: telaRios, color: '#e8f6ff', weight: 0.8, opacity: 0.6, dashArray: '5 7', interactive: false }).addTo(grupo);
      }
      if (noDesenho.has(normalizar(r.n))) continue;
      L.marker([r.r[1], r.r[0]], {
        pane: 'un-rios-nomes',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'un-rio-nome', html: `<span>${r.n}</span>`, iconSize: null }),
      }).addTo(grupo);
    }
    camadaHidro.current = grupo.addTo(m);
    return () => {
      camadaHidro.current?.remove();
      camadaHidro.current = null;
    };
  }, [hidro, pronto, d, hidrografia]);

  return (
    <div className="un-mapa" ref={caixa} style={{ aspectRatio: `${d.largura} / ${d.altura}` }}>
      {pronto && vista && vista.plano === plano && caixa.current && createPortal(<div className="un-mapa-desenho">{children(vista)}</div>, caixa.current)}
    </div>
  );
}
