import Link from 'next/link';

/** Paginação por link (funciona sem JavaScript); preserva os filtros da URL. */
export function Paginacao({
  total,
  pagina,
  porPagina,
  base,
  params,
}: {
  total: number;
  pagina: number;
  porPagina: number;
  base: string;
  params: Record<string, string | undefined>;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return <p className="suave">{total} registro(s).</p>;

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set('p', String(p));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <nav className="paginacao" aria-label="Paginação">
      {pagina > 1 ? <Link href={href(pagina - 1)}>← Anterior</Link> : <span />}
      <span className="suave">
        Página {pagina} de {paginas} · {total} registro(s)
      </span>
      {pagina < paginas ? <Link href={href(pagina + 1)}>Próxima →</Link> : <span />}
    </nav>
  );
}

/** Lê um inteiro positivo de um parâmetro de URL. */
export function inteiro(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Lê um texto curto de um parâmetro de URL. */
export function texto(v: string | string[] | undefined, max = 100): string {
  return (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim().slice(0, max);
}
