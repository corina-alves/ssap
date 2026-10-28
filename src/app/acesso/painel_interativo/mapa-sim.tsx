'use client';

import { useEffect, useRef, useState } from 'react';
import { carregarLeaflet } from '@/components/graficos/mapa-sistemas';
import areas from '@/conteudo/sistemas-produtores-areas.json';
import type { CartaoSistema } from '@/lib/hidrologia/painel-interativo';
import { BASES } from './bases-mapa';

/**
 * Mapa da visão SIM do painel interativo (Leaflet): mapa base à escolha, as
 * áreas dos sistemas produtores pela cor do estágio com o volume útil de cada
 * um, a capital paulista em destaque e os municípios da RMSP. Clicar num
 * sistema abre a análise dele.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Leaflet = any;

const COR_ESTAGIO: Record<string, string> = { normal: '#2e9e5b', atencao: '#f4b400', alerta: '#e08600', critico: '#dc3545', emergencia: '#9b3fb0' };
const SEM_DADO = '#9fb5cb';
const COR_CAPITAL = '#ffd166';

const CAMADAS = [
  { chave: 'sistemas', rotulo: 'Sistemas produtores' },
  { chave: 'volumes', rotulo: 'Volume dos sistemas' },
  { chave: 'capital', rotulo: 'Capital paulista' },
  { chave: 'municipios', rotulo: 'Municípios da RMSP' },
] as const;
type Camada = (typeof CAMADAS)[number]['chave'];

type Camadas = { capital: [number, number][][] | null; rmsp: { codigo: number; nome: string; aneis: [number, number][][] }[] };

const ESTAGIOS = [
  ['normal', 'Normal'],
  ['atencao', 'Atenção'],
  ['alerta', 'Alerta'],
  ['critico', 'Crítico'],
  ['emergencia', 'Emergência'],
] as const;

// rótulo de volume um pouco fora do centro da área, onde as áreas vizinhas são próximas ([lat, lon])
const DESLOCAR: Record<string, [number, number]> = {
  Cotia: [0.06, -0.08],
  Guarapiranga: [-0.07, 0.03],
  'São Lourenço': [-0.02, -0.08],
  'Alto Tietê': [0.1, -0.2],
  'Rio Claro': [-0.02, 0.12],
  'Rio Grande': [-0.06, 0.05],
};
const POSICAO_CAPITAL: [number, number] = [-23.7, -46.66]; // abaixo do nome "São Paulo" do mapa base

const latLon = (aneis: [number, number][][]) => aneis.map((a) => a.map(([lon, lat]) => [lat, lon]));
const num = (v: number | null | undefined, casas: number, suf: string) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}${suf}`;
const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** HTML do rótulo de volume de um sistema (marcador do Leaflet). */
function rotuloVolume(nome: string, s: CartaoSistema | undefined) {
  const cor = (s?.estagio && COR_ESTAGIO[s.estagio.classe]) || SEM_DADO;
  const pct = s?.ind?.volumePct;
  const linha = [s?.estagio?.nome, s?.ind?.volumeHm3 != null ? num(s.ind.volumeHm3, 1, ' hm³') : null, s?.ind?.sabesp?.includes('volume') ? 'Sabesp' : null].filter(Boolean).join(' · ');
  return `<div style="--c:${cor}"><b>${escapar(nome)}</b><strong>${pct == null ? 'sem dado' : num(pct, 1, '%')}</strong>${linha ? `<small>${escapar(linha)}</small>` : ''}</div>`;
}

export function MapaSim({ sistemas, aoAbrir }: { sistemas: CartaoSistema[]; aoAbrir: (chave: string) => void }) {
  const moldura = useRef<HTMLDivElement>(null);
  const caixaMapa = useRef<HTMLDivElement>(null);
  const Lf = useRef<Leaflet>(null);
  const mapa = useRef<Leaflet>(null);
  const camadas = useRef<Record<string, Leaflet>>({});
  const formas = useRef<Record<string, Leaflet>>({}); // área de cada sistema, pelo nome
  const rotulos = useRef<Record<string, Leaflet>>({}); // marcador de volume de cada sistema, pelo nome
  const abrir = useRef(aoAbrir);
  const chaves = useRef<Record<string, string>>({});
  const [pronto, setPronto] = useState(false);
  const [base, setBase] = useState<string>(BASES[0].nome);
  const [ligadas, setLigadas] = useState<Record<Camada, boolean>>({ sistemas: true, volumes: true, capital: true, municipios: true });
  const [semMapa, setSemMapa] = useState(false);

  useEffect(() => {
    abrir.current = aoAbrir;
    chaves.current = Object.fromEntries(sistemas.map((s) => [s.nome, s.chave]));
  }, [aoAbrir, sistemas]);

  // monta o mapa uma vez
  useEffect(() => {
    let vivo = true;
    let observador: ResizeObserver | null = null;
    carregarLeaflet().then((L) => {
      if (!vivo || !caixaMapa.current) return;
      if (!L) return setSemMapa(true);
      Lf.current = L;
      const m = L.map(caixaMapa.current, { zoomSnap: 0.25, zoomDelta: 0.5, scrollWheelZoom: false });
      mapa.current = m;
      // rolagem do mouse só depois de clicar no mapa (para não prender a rolagem da página)
      m.on('focus', () => m.scrollWheelZoom.enable());
      m.on('blur', () => m.scrollWheelZoom.disable());
      for (const [nome, z] of [['mu-municipios', 405], ['mu-capital', 410], ['mu-sistemas', 415], ['mu-rotulos', 620]] as const) m.createPane(nome).style.zIndex = String(z);

      const c = camadas.current;
      for (const b of BASES)
        c[`base:${b.nome}`] = L.layerGroup(b.camadas.map((url, i) => L.tileLayer(url, { maxZoom: 18, maxNativeZoom: 16, attribution: i === 0 ? b.atribuicao : undefined })));
      c[`base:${BASES[0].nome}`].addTo(m);

      // áreas dos sistemas e o rótulo de volume de cada uma
      const abrirSistema = (nome: string) => {
        const chave = chaves.current[nome];
        if (chave) abrir.current(chave);
      };
      c.sistemas = L.featureGroup();
      c.volumes = L.featureGroup();
      for (const f of areas.features) {
        const nome = f.properties.sistema;
        const forma = L.geoJSON(f, { pane: 'mu-sistemas', style: { color: SEM_DADO, weight: 2, fillColor: SEM_DADO, fillOpacity: 0.3 } });
        forma.bindTooltip(nome, { sticky: true, className: 'mu-dica' });
        forma.on('click', () => abrirSistema(nome));
        forma.addTo(c.sistemas);
        formas.current[nome] = forma;
        const centro = forma.getBounds().getCenter();
        const [dlat, dlon] = DESLOCAR[nome] ?? [0, 0];
        const rotulo = L.marker([centro.lat + dlat, centro.lng + dlon], {
          pane: 'mu-rotulos',
          keyboard: false,
          icon: L.divIcon({ className: 'mu-vol', html: rotuloVolume(nome, undefined), iconSize: null }),
        });
        rotulo.on('click', () => abrirSistema(nome));
        rotulo.addTo(c.volumes);
        rotulos.current[nome] = rotulo;
      }
      c.sistemas.addTo(m);
      c.volumes.addTo(m);
      m.fitBounds(c.sistemas.getBounds(), { padding: [24, 24] });

      // capital e municípios (IBGE), quando chegarem
      c.capital = L.featureGroup().addTo(m);
      c.municipios = L.featureGroup().addTo(m);
      fetch('/api/acesso/painel_interativo/camadas')
        .then((r) => (r.ok ? (r.json() as Promise<Camadas>) : null))
        .then((cam) => {
          if (!vivo || !cam) return;
          for (const mu of cam.rmsp)
            L.polygon(latLon(mu.aneis), { pane: 'mu-municipios', color: '#cfd8e3', weight: 0.8, opacity: 0.5, fillOpacity: 0 })
              .bindTooltip(mu.nome, { sticky: true, className: 'mu-dica' })
              .addTo(c.municipios);
          if (cam.capital) {
            const anel = latLon(cam.capital);
            L.polygon(anel, { pane: 'mu-capital', interactive: false, color: COR_CAPITAL, weight: 9, opacity: 0.18, fill: false }).addTo(c.capital);
            L.polygon(anel, { pane: 'mu-capital', interactive: false, color: COR_CAPITAL, weight: 2.5, opacity: 0.95, fillColor: COR_CAPITAL, fillOpacity: 0.1 }).addTo(c.capital);
            L.marker(POSICAO_CAPITAL, {
              pane: 'mu-capital',
              interactive: false,
              icon: L.divIcon({ className: 'mu-capital', html: '<div><span>São Paulo</span><small>capital</small></div>', iconSize: null }),
            }).addTo(c.capital);
          }
        })
        .catch(() => {});

      observador = new ResizeObserver(() => m.invalidateSize());
      observador.observe(caixaMapa.current);
      setPronto(true);
    });
    return () => {
      vivo = false;
      observador?.disconnect();
      mapa.current?.remove();
      mapa.current = null;
      camadas.current = {};
      formas.current = {};
      rotulos.current = {};
    };
  }, []);

  // cor do estágio e volume de cada sistema
  useEffect(() => {
    for (const [nome, forma] of Object.entries(formas.current)) {
      const s = sistemas.find((x) => x.nome === nome);
      const cor = (s?.estagio && COR_ESTAGIO[s.estagio.classe]) || SEM_DADO;
      forma.setStyle({ color: cor, fillColor: cor });
      forma.setTooltipContent(`<b>${escapar(nome)}</b><br><small>clique para abrir o sistema</small>`);
      rotulos.current[nome]?.setIcon(Lf.current.divIcon({ className: 'mu-vol', html: rotuloVolume(nome, s), iconSize: null }));
    }
  }, [sistemas, pronto]);

  // mapa base e camadas ligadas
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    for (const b of BASES) {
      const t = camadas.current[`base:${b.nome}`];
      if (b.nome === base) t?.addTo(m);
      else t?.remove();
    }
    for (const k of CAMADAS) {
      const c = camadas.current[k.chave];
      if (ligadas[k.chave]) c?.addTo(m);
      else c?.remove();
    }
  }, [base, ligadas, pronto]);

  const telaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void moldura.current?.requestFullscreen();
  };

  return (
    <div className="mu" ref={moldura}>
      <div className="mu-barra">
        <div className="mu-grupo" role="group" aria-label="Mapa base">
          <span>Mapa base</span>
          {BASES.map((b) => (
            <button key={b.nome} type="button" className={base === b.nome ? 'is-ativo' : ''} aria-pressed={base === b.nome} onClick={() => setBase(b.nome)}>
              {b.nome}
            </button>
          ))}
        </div>
        <div className="mu-grupo" role="group" aria-label="Camadas">
          <span>Camadas</span>
          {CAMADAS.map((k) => (
            <label key={k.chave} className={ligadas[k.chave] ? 'is-ativo' : ''}>
              <input type="checkbox" checked={ligadas[k.chave]} onChange={(e) => setLigadas((l) => ({ ...l, [k.chave]: e.target.checked }))} />
              {k.rotulo}
            </label>
          ))}
        </div>
        <button type="button" className="mu-tela" onClick={telaCheia} title="Tela cheia" aria-label="Tela cheia">
          <i className="bi bi-arrows-fullscreen" />
        </button>
      </div>
      <div className="mu-mapa" ref={caixaMapa} aria-label="Mapa dos sistemas produtores com o volume útil de cada um" />
      {semMapa && <p className="pi-erro">Não foi possível carregar o mapa.</p>}
      <div className="mu-legenda" aria-label="Legenda">
        {ESTAGIOS.map(([classe, nome]) => (
          <span key={classe}>
            <i style={{ background: COR_ESTAGIO[classe] }} />
            {nome}
          </span>
        ))}
        <span>
          <i style={{ background: SEM_DADO }} />
          Sem dado
        </span>
        <span>
          <i className="mu-legenda-capital" />
          Capital paulista
        </span>
        <span className="mu-legenda-nota">Volume útil do dia (SSD SP Águas; Sabesp onde o SSD está sem dado recente) · clique no mapa para usar a rolagem do mouse no zoom</span>
      </div>
    </div>
  );
}
