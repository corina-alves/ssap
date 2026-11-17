'use client';

import { Fragment, useRef, useState } from 'react';

/** "*negrito*" e "_itálico_" (formato do WhatsApp) para a tela. */
function formatar(linha: string) {
  return linha.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((p, i) =>
    p.length > 2 && p.startsWith('*') && p.endsWith('*') ? (
      <strong key={i}>{p.slice(1, -1)}</strong>
    ) : p.length > 2 && p.startsWith('_') && p.endsWith('_') ? (
      <em key={i}>{p.slice(1, -1)}</em>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/**
 * Texto da análise dos sistemas produtores, como vai na mensagem. "Copiar texto"
 * leva duas versões: a formatada (negrito no e-mail e no Word) e a simples, com
 * *asteriscos*, que o WhatsApp mostra em negrito.
 */
export function AnaliseResumo({ texto }: { texto: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [aviso, setAviso] = useState('');

  async function copiar() {
    const el = caixa.current;
    if (!el) return;
    const html = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.5; color: #1b2733;">${el.innerHTML}</div>`;
    try {
      if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' }) }),
        ]);
      } else {
        // sem a API (endereço sem https): copia a versão simples por uma caixa de texto escondida
        const t = document.createElement('textarea');
        t.value = texto;
        t.setAttribute('readonly', '');
        t.style.position = 'fixed';
        t.style.opacity = '0';
        document.body.appendChild(t);
        t.select();
        const ok = document.execCommand('copy');
        t.remove();
        if (!ok) throw new Error('cópia recusada');
      }
      setAviso('Copiado!');
    } catch {
      setAviso('Não foi possível copiar. Selecione o texto e use Ctrl+C.');
    }
    setTimeout(() => setAviso(''), 2500);
  }

  return (
    <section className="acesso-card rsm-analise">
      <div className="rsm-analise__cabeca">
        <h2 className="trp-titulo mb-0">Texto da análise</h2>
        <div className="d-flex align-items-center gap-2">
          <span className="small text-success" role="status">
            {aviso}
          </span>
          <button type="button" className="btn btn-sm btn-primary" onClick={copiar}>
            <i className="bi bi-clipboard me-1" /> Copiar texto
          </button>
        </div>
      </div>
      <div className="rsm-analise__texto" ref={caixa}>
        {texto.split('\n').map((linha, i) => (
          <div key={i}>{linha ? formatar(linha) : <br />}</div>
        ))}
      </div>
    </section>
  );
}
