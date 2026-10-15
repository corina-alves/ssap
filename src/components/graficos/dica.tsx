'use client';

import { useRef, useState, type ReactNode } from 'react';

type Estado = { valor: string; rotulo: string; x: number; y: number } | null;

/**
 * Dica (tooltip) para gráficos. Qualquer elemento interno com
 * data-dica-valor / data-dica-rotulo mostra a dica no hover e no foco do
 * teclado. Os textos entram como texto do React (nunca como HTML).
 * Sem JavaScript, os mesmos valores estão nos rótulos e na tabela.
 */
export function Dica({ children }: { children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [dica, setDica] = useState<Estado>(null);

  const mostrar = (alvo: EventTarget | null, cx?: number, cy?: number) => {
    const el = (alvo as HTMLElement | null)?.closest?.('[data-dica-valor]') as HTMLElement | null;
    const base = caixa.current?.getBoundingClientRect();
    if (!el || !base) return setDica(null);
    const r = el.getBoundingClientRect();
    setDica({
      valor: el.dataset.dicaValor ?? '',
      rotulo: el.dataset.dicaRotulo ?? '',
      x: (cx ?? r.left + r.width / 2) - base.left,
      y: (cy ?? r.top) - base.top,
    });
  };

  return (
    <div
      ref={caixa}
      className="dica-area"
      onPointerMove={(e) => mostrar(e.target, e.clientX, e.clientY)}
      onPointerLeave={() => setDica(null)}
      onFocus={(e) => mostrar(e.target)}
      onBlur={() => setDica(null)}
    >
      {children}
      {dica && (
        <div className="dica" role="status" style={{ left: dica.x, top: dica.y }}>
          <strong>{dica.valor}</strong>
          <span>{dica.rotulo}</span>
        </div>
      )}
    </div>
  );
}
