'use client';

import { useEffect, useState } from 'react';

/** fetch JSON com estado de carregamento e erro, refeito quando a URL muda (null: não busca). */
export function useJson<T>(url: string | null) {
  const [st, setSt] = useState<{ dados?: T; erro?: string; carregando: boolean }>({ carregando: !!url });
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    setSt((s) => ({ dados: s.dados, carregando: true }));
    fetch(url)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro ?? `HTTP ${r.status}`);
        return j as T;
      })
      .then(
        (dados) => vivo && setSt({ dados, carregando: false }),
        (e: Error) => vivo && setSt({ erro: e.message, carregando: false }),
      );
    return () => {
      vivo = false;
    };
  }, [url]);
  return st;
}

/** Conteúdo apagado enquanto carrega; erro no lugar dele. */
export function Estado({ carregando, erro, children }: { carregando: boolean; erro?: string; children: React.ReactNode }) {
  if (erro) return <div className="pi-erro">Dado indisponível ({erro}).</div>;
  return (
    <div className={`pi-estado${carregando ? ' is-carregando' : ''}`} aria-busy={carregando}>
      {children}
    </div>
  );
}
