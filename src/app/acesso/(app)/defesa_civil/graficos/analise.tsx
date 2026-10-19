'use client';

import { useEffect, useState } from 'react';

const DESTAQUE = /(estável|em elevação|em queda)/g;

const ler = (chave: string) => {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
};
const gravar = (chave: string, valor: string | null) => {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    // navegador sem armazenamento (janela anônima etc.): o texto vale só até recarregar
  }
};

/** Parágrafos do texto, com a situação (estável / em elevação / em queda) em negrito. */
function Paragrafos({ texto }: { texto: string }) {
  return (
    <>
      {texto.split('\n').map((linha, i) => (
        <p key={i} className="mb-1">
          {linha.split(DESTAQUE).map((parte, j) => (j % 2 ? <strong key={j}>{parte}</strong> : parte))}
        </p>
      ))}
    </>
  );
}

/**
 * Análise do posto: texto automático, que pode ser editado. O texto editado
 * fica salvo neste navegador (por posto, período e dia de comparação) e pode
 * voltar ao automático.
 */
export function AnaliseEditavel({ titulo, automatico, chave }: { titulo: string; automatico: string; chave: string }) {
  const [editado, setEditado] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');

  useEffect(() => setEditado(ler(chave)), [chave]);

  const texto = editado ?? automatico;
  return (
    <div className="pg-analise">
      <h3>{titulo}</h3>
      {editando ? (
        <>
          <textarea className="form-control mb-2" rows={Math.max(4, rascunho.split('\n').length + 1)} value={rascunho} onChange={(e) => setRascunho(e.target.value)} aria-label={`Texto de ${titulo}`} />
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                const v = rascunho.trim() === automatico.trim() ? null : rascunho;
                gravar(chave, v);
                setEditado(v);
                setEditando(false);
              }}
            >
              Salvar
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={editado !== null ? 'pg-analise__texto is-editado' : 'pg-analise__texto'}>
            <Paragrafos texto={texto} />
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            {editado !== null && <small className="text-secondary">Texto editado (salvo neste navegador).</small>}
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                setRascunho(texto);
                setEditando(true);
              }}
            >
              <i className="bi bi-pencil me-1" />
              Editar texto
            </button>
            {editado !== null && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  gravar(chave, null);
                  setEditado(null);
                }}
              >
                Restaurar texto automático
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
