'use client';

import { Fragment, useRef, useState } from 'react';

/** "a **b** c" → a <strong>b</strong> c */
function comNegrito(t: string) {
  return t.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 ? <strong key={i}>{parte}</strong> : <Fragment key={i}>{parte}</Fragment>));
}

/**
 * Comunicado da Defesa Civil: o texto formal, com a situação em negrito, numa
 * caixa que pode ser corrigida antes do envio. "Copiar" leva o texto formatado
 * (o negrito continua no e-mail e no Word) e também a versão sem formatação.
 * `texto`: parágrafos separados por linha em branco, negrito entre **asteriscos**.
 */
export function Comunicado({ titulo, quando, texto }: { titulo: string; quando: string; texto: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [aviso, setAviso] = useState('');

  async function copiar() {
    const el = caixa.current;
    if (!el) return;
    const simples = el.innerText.replace(/\n{3,}/g, '\n\n').trim();
    const html = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.5; color: #1b2733;">${el.innerHTML}</div>`;
    try {
      if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([simples], { type: 'text/plain' }) }),
        ]);
      } else {
        // sem a API (endereço sem https): copia a seleção, que também leva a formatação
        const faixa = document.createRange();
        faixa.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(faixa);
        document.execCommand('copy');
        sel?.removeAllRanges();
      }
      setAviso('Copiado!');
    } catch {
      setAviso('Não foi possível copiar. Selecione o texto e use Ctrl+C.');
    }
    setTimeout(() => setAviso(''), 2500);
  }

  return (
    <>
      <div className="dc-comunicado" ref={caixa} contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label="Texto do comunicado">
        <p className="dc-comunicado__titulo">
          <strong>{titulo}</strong>
        </p>
        <p className="dc-comunicado__quando">{quando}</p>
        {texto.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{comNegrito(p)}</p>
        ))}
        <p className="dc-comunicado__fonte">
          <em>Fonte: SIBH — SP Águas · Sala de Situação Alfredo Pisani</em>
        </p>
      </div>
      <div className="mt-2">
        <button type="button" className="btn btn-sm btn-primary" onClick={copiar}>
          <i className="bi bi-clipboard" /> Copiar comunicado
        </button>
        <span className="small text-success ms-2" role="status">
          {aviso}
        </span>
      </div>
    </>
  );
}
