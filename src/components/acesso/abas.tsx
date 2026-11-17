'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export type Aba = { chave: string; rotulo: string; icone: string; total?: number; conteudo: ReactNode };

/**
 * Abas com as classes do Bootstrap (nav-tabs). Todos os painéis já vêm prontos
 * do servidor; a aba só escolhe qual aparece. Setas, Home e End trocam de aba.
 */
export function Abas({ abas, rotulo }: { abas: Aba[]; rotulo: string }) {
  const id = useId();
  const [ativa, setAtiva] = useState(0);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  const teclas = (e: KeyboardEvent) => {
    const alvo = ({ ArrowRight: ativa + 1, ArrowLeft: ativa - 1, Home: 0, End: abas.length - 1 } as Record<string, number>)[e.key];
    if (alvo === undefined) return;
    e.preventDefault();
    const n = (alvo + abas.length) % abas.length;
    setAtiva(n);
    botoes.current[n]?.focus();
  };

  return (
    <>
      <div className="nav nav-tabs acesso-abas" role="tablist" aria-label={rotulo} onKeyDown={teclas}>
        {abas.map((a, i) => (
          <button
            key={a.chave}
            ref={(b) => {
              botoes.current[i] = b;
            }}
            type="button"
            role="tab"
            id={`${id}-aba-${i}`}
            aria-controls={`${id}-painel-${i}`}
            aria-selected={i === ativa}
            tabIndex={i === ativa ? 0 : -1}
            className={`nav-link${i === ativa ? ' active' : ''}`}
            onClick={() => setAtiva(i)}
          >
            <i className={`bi ${a.icone}`} aria-hidden="true" />
            {a.rotulo}
            {a.total !== undefined && <span className="acesso-abas__total">{a.total}</span>}
          </button>
        ))}
      </div>
      {abas.map((a, i) => (
        <div key={a.chave} role="tabpanel" id={`${id}-painel-${i}`} aria-labelledby={`${id}-aba-${i}`} tabIndex={0} hidden={i !== ativa}>
          {a.conteudo}
        </div>
      ))}
    </>
  );
}
