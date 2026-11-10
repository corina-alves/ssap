'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { carregarLeaflet } from '@/components/graficos/mapa-sistemas';
import type { Diagrama } from '@/conteudo/diagramas-unifilares';
import areas from '@/conteudo/sistemas-produtores-areas.json';
import { BASES, type NomeBase } from './bases-mapa';
import { planoNoMapa, type Pt, type Tela } from './posicoes-mapa';

/**
 * Diagrama unifilar sobre o mapa: o mesmo esquema do "Sem mapa", posto sobre
 * a região do sistema pelas represas (o centro e o espalhamento delas no
 * esquema casam com os do mapa). Cada ponto do esquema tem lugar fixo no mapa:
 * com zoom e arrastar, o desenho acompanha o mapa sem se deformar
 * (posicoes-mapa.ts). Embaixo, a área do sistema e a hidrografia principal
 * dele (rios com nome e represas; hidrografia-sistemas.json). O desenho em si
 * vem de `children`, já nas posições da tela.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Leaflet = any;

/** Por sistema (chave do diagrama): rios (trechos [lon, lat] e ponto do nome) e represas (anéis [lon, lat]). */
type Hidrografia = { sistemas: Record<string, { rios: { n: string; c: [number, number][][]; r: [number, number] }[]; aguas: { n: string; c: [number, number][][] }[] }> };

const COR_RIO = '#1fa8ff';
const COR_AGUA = '#1fb2ff';

const ZOOM = { min: 8, max: 17, inicialMin: 9, inicialMax: 14 };

/** Escala dos símbolos (px por unidade do desenho): a mesma do "Sem mapa" (.un-svg: no máximo 1120 px de largura e 70vh de altura). */
const escala = (d: Diagrama, w: number, h: number) => Math.min(Math.min(w, 1120) / d.largura, Math.min(h, 0.7 * window.innerHeight) / d.altura);

const ptDe = (p: { x: number; y: number }): Pt => [p.x, p.y];
const media = (ps: Pt[]): Pt => [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
const espalho = (ps: Pt[]) => {
  const [mx, my] = media(ps);
  return Math.sqrt(ps.reduce((a, p) => a + (p[0] - mx) ** 2 + (p[1] - my) ** 2, 0));
};

/** Lugar do esquema no mapa: o ponto p do esquema fica em c + u·p, em px do mundo no zoom 0 (`project(ll, 0)` do Leaflet). */
type Lugar = { u: number; c: Pt };

export function MapaUnifilar({ d, base, hidro, children }: { d: Diagrama; base: NomeBase; hidro: boolean; children: (d: Diagrama) => ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const Lf = useRef<Leaflet>(null);
  const mapa = useRef<Leaflet>(null);
  const bases = useRef<Record<string, Leaflet>>({});
  const area = useRef<Leaflet>(null);
  const camadaHidro = useRef<Leaflet>(null);
  const telasHidro = useRef<{ rios: Leaflet; aguas: Leaflet } | null>(null);
  const [pronto, setPronto] = useState(false);
  const aplicar = useMemo(() => planoNoMapa(d), [d]);
  const lugar = useRef<Lugar | null>(null);
  // `aplicar` junto: ao trocar de sistema, a tela antiga (de outro esquema) não serve
  const [tela, setTela] = useState<(Tela & { w: number; h: number; aplicar: typeof aplicar }) | null>(null);
  const sistema = d.titulo.replace(/^Sistema /, '');

  // onde o esquema está na tela; no zoom animado, já onde estará no fim da animação
  const alvoZoom = useRef<{ centro: Leaflet; zoom: number } | null>(null);
  const atualizar = useRef<() => void>(() => {});
  atualizar.current = () => {
    const m = mapa.current;
    if (!m) return;
    const t = m.getSize();
    if (!t.x || !t.y) return;
    if (!lugar.current) return enquadrar.current();
    const a = alvoZoom.current;
    const z = a ? a.zoom : m.getZoom();
    const meio = m.project(a ? a.centro : m.getCenter(), z).subtract(t.divideBy(2));
    const f = 2 ** z;
    const { u, c } = lugar.current;
    const k = u * f;
    // afastado além da vista inicial, o desenho todo encolhe junto (símbolos inclusive)
    setTela({ s: Math.min(escala(d, t.x, t.y), k), k, t: [c[0] * f - meio.x, c[1] * f - meio.y], w: t.x, h: t.y, aplicar });
  };

  /**
   * Vista inicial e lugar do esquema no mapa: o centro das represas no esquema
   * vai para o centro delas no mapa, num zoom em que o espalhamento delas é
   * parecido com o do esquema; nesse zoom o desenho fica do tamanho do "Sem mapa".
   */
  const enquadrar = useRef<() => void>(() => {});
  enquadrar.current = () => {
    const m = mapa.current;
    if (!m) return;
    const t = m.getSize();
    if (!t.x || !t.y) return;
    const s = escala(d, t.x, t.y);
    const represas = d.nos.filter((n) => n.ll);
    let z = d.zoomMapa ?? 12;
    let noMapa: Pt;
    let noEsquema: Pt;
    if (represas.length) {
      const p0 = represas.map((n) => ptDe(m.project(n.ll, 0)));
      const n0 = represas.map(ptDe);
      if (represas.length >= 2) z = Math.log2((s * espalho(n0)) / espalho(p0));
      [noMapa, noEsquema] = [media(p0), media(n0)];
    } else {
      // sem represa com coordenada: o esquema sobre a área do sistema
      const b = area.current?.getBounds();
      if (!b?.isValid()) return;
      const [a0, a1] = [ptDe(m.project(b.getNorthWest(), 0)), ptDe(m.project(b.getSouthEast(), 0))];
      z = Math.log2(s * Math.min(d.largura / (a1[0] - a0[0]), d.altura / (a1[1] - a0[1])));
      [noMapa, noEsquema] = [media([a0, a1]), [d.largura / 2, d.altura / 2]];
    }
    z = Math.max(ZOOM.inicialMin, Math.min(ZOOM.inicialMax, Math.round(z * 4) / 4));
    const u = s / 2 ** z;
    const c: Pt = [noMapa[0] - u * noEsquema[0], noMapa[1] - u * noEsquema[1]];
    lugar.current = { u, c };
    m.setView(m.unproject([c[0] + (u * d.largura) / 2, c[1] + (u * d.altura) / 2], 0), z, { animate: false });
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
      observador = new ResizeObserver(() => {
        m.invalidateSize({ pan: false });
        agendar();
      });
      observador.observe(caixa.current);
      setPronto(true);
    });
    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
      observador?.disconnect();
      mapa.current?.remove();
      mapa.current = null;
      bases.current = {};
    };
  }, []);

  // área do sistema e vista inicial
  useEffect(() => {
    const m = mapa.current;
    if (!m || !pronto) return;
    area.current.clearLayers();
    const f = areas.features.find((x) => x.properties.sistema === sistema);
    if (f)
      Lf.current
        .geoJSON(f, { pane: 'un-area', interactive: false, style: { color: '#9c7478', weight: 1, opacity: 0.6, fillColor: '#7a5458', fillOpacity: 0.3 } })
        .addTo(area.current);
    enquadrar.current();
  }, [sistema, pronto]);

  // mapa base escolhido
  useEffect(() => {
    const m = mapa.current;
    if (!m || !pronto) return;
    for (const [nome, camada] of Object.entries(bases.current)) {
      if (nome === base) camada.addTo(m);
      else camada.remove();
    }
  }, [base, pronto]);

  // hidrografia principal do sistema (carregada só quando o mapa aparece): rios com o nome e as represas
  useEffect(() => {
    const m = mapa.current;
    const L = Lf.current;
    if (!m || !pronto || !hidro) return;
    let vivo = true;
    import('@/conteudo/hidrografia-sistemas.json').then((mod) => {
      const h = ((mod.default ?? mod) as unknown as Hidrografia).sistemas[d.chave];
      if (!vivo || !mapa.current || !h) return;
      const grupo = L.featureGroup([], { attribution: 'Hidrografia: IBGE (BC250) e © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
      const { rios: telaRios, aguas: telaAguas } = telasHidro.current!;
      const latLon = (c: [number, number][]) => c.map(([lon, lat]) => [lat, lon]);
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
        L.marker([r.r[1], r.r[0]], {
          pane: 'un-rios-nomes',
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: 'un-rio-nome', html: `<span>${r.n}</span>`, iconSize: null }),
        }).addTo(grupo);
      }
      camadaHidro.current = grupo.addTo(m);
    });
    return () => {
      vivo = false;
      camadaHidro.current?.remove();
      camadaHidro.current = null;
    };
  }, [hidro, pronto, d.chave]);

  const desenho = useMemo(() => (tela && tela.aplicar === aplicar ? aplicar(tela, tela.w, tela.h) : null), [aplicar, tela]);

  return (
    <div className="un-mapa" ref={caixa} style={{ aspectRatio: `${d.largura} / ${d.altura}` }}>
      {pronto && desenho && caixa.current && createPortal(<div className="un-mapa-desenho">{children(desenho)}</div>, caixa.current)}
    </div>
  );
}
