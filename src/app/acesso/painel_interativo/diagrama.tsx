'use client';

import { useEffect, useRef, useState } from 'react';

type Valores = Record<string, { valor: number; data: string } | null>;

// casas decimais e unidade por variável do SSD (as mesmas do site do SSD)
const FORMATO: Record<number, [number, string]> = {
  1: [1, 'mm'],
  3: [2, 'm³/s'],
  4: [2, 'm³/s'],
  5: [2, 'm³/s'],
  6: [2, 'm³/s'],
  8: [2, 'm³/s'],
  9: [2, 'hm³'],
  10: [1, '%'],
  11: [2, 'hm³'],
  13: [2, 'm³/s'],
};
const formatar = (v: number, variavel: number) => {
  const [casas, un] = FORMATO[variavel] ?? [2, ''];
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${un}`;
};

const NS = 'http://www.w3.org/2000/svg';

/**
 * Diagrama oficial do SSD (mapa da página inicial ou diagrama de um sistema),
 * num Shadow DOM: os estilos do SVG (.st0, .st1…) não vazam nem colidem entre
 * diagramas. Os campos (rect.text-data-background) recebem os valores da data;
 * clicar num sistema (data-water-system) ou num local (data-space-id) avisa a tela.
 */
export function DiagramaSsd({
  nome,
  data,
  rotulo,
  destaque,
  aoEscolherSistema,
  aoEscolherLocal,
}: {
  nome: string;
  data: string;
  rotulo: string;
  /** id do local (space) a destacar */
  destaque?: number | null;
  aoEscolherSistema?: (sistemaSsd: string) => void;
  aoEscolherLocal?: (space: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');
  const callbacks = useRef({ aoEscolherSistema, aoEscolherLocal });
  callbacks.current = { aoEscolherSistema, aoEscolherLocal };

  // desenho + valores da data
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let vivo = true;
    setEstado('carregando');
    const raiz = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    (async () => {
      const r = await fetch(`/api/acesso/painel_interativo/diagrama/${nome}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const svg = await r.text();
      if (!vivo) return;
      raiz.innerHTML = `<style>
        :host { display:block; }
        svg { width:100%; height:auto; display:block; }
        .poligono-sistema, .titulo-sistema, [data-space-id] { cursor:pointer; }
        .poligono-sistema:hover { filter: brightness(1.12); }
        .pi-valor { font: 700 15px ${getComputedStyle(el).fontFamily}; fill:#0b1f3a; pointer-events:none; }
        .pi-destaque { stroke:#ffb020 !important; stroke-width:4px !important; }
      </style>${svg}`;
      const campos = [...raiz.querySelectorAll<SVGGraphicsElement>('.text-data-background[data-space-id][data-variable-id]')];
      const pares = [...new Set(campos.map((c) => `${c.dataset.spaceId}:${c.dataset.variableId}`))];
      const rv = await fetch(`/api/acesso/painel_interativo/valores?data=${data}&p=${pares.join(',')}`);
      const { valores } = (await rv.json()) as { valores: Valores };
      if (!vivo) return;
      for (const c of campos) {
        const b = c.getBBox();
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', String(b.x + b.width / 2));
        t.setAttribute('y', String(b.y + b.height / 2));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('class', 'pi-valor');
        const v = valores[`${c.dataset.spaceId}:${c.dataset.variableId}`];
        t.textContent = v ? formatar(v.valor, Number(c.dataset.variableId)) : '—';
        if (v) t.appendChild(Object.assign(document.createElementNS(NS, 'title'), { textContent: `Dado de ${v.data.split('-').reverse().join('/')}` }));
        c.after(t);
      }
      setEstado('ok');
    })().catch(() => vivo && setEstado('erro'));
    return () => {
      vivo = false;
    };
  }, [nome, data]);

  // cliques (delegados na raiz do Shadow DOM)
  useEffect(() => {
    const raiz = host.current?.shadowRoot;
    if (!raiz) return;
    const clique = (e: Event) => {
      const alvo = e.target as Element;
      const sistema = alvo.closest<SVGElement>('[data-water-system]')?.dataset.waterSystem;
      if (sistema) return callbacks.current.aoEscolherSistema?.(sistema);
      const space = alvo.closest<SVGElement>('[data-space-id]')?.dataset.spaceId;
      if (space) callbacks.current.aoEscolherLocal?.(Number(space));
    };
    raiz.addEventListener('click', clique);
    return () => raiz.removeEventListener('click', clique);
  }, [estado]);

  // destaque do local escolhido
  useEffect(() => {
    const raiz = host.current?.shadowRoot;
    if (!raiz || estado !== 'ok') return;
    for (const c of raiz.querySelectorAll('.pi-destaque')) c.classList.remove('pi-destaque');
    if (destaque) for (const c of raiz.querySelectorAll(`.text-data-background[data-space-id="${destaque}"]`)) c.classList.add('pi-destaque');
  }, [destaque, estado]);

  return (
    <div className="pi-diagrama" aria-label={rotulo} role="img">
      {estado === 'carregando' && <div className="pi-carregando">Carregando o diagrama do SSD…</div>}
      {estado === 'erro' && <div className="pi-erro">Diagrama do SSD indisponível no momento.</div>}
      <div ref={host} />
    </div>
  );
}
