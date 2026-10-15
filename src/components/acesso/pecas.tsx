import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

/** Peças de página da área /acesso — mesmas classes dos partials do PHP. */

/** Cor de destaque da sala (no PHP vinha de estilo-salas.php, como .sala-<id>). */
export const corSala = (cor: string | null) => (cor ? ({ '--sala-cor': cor } as CSSProperties) : undefined);

/** Cabeçalho de página: trilha, título, subtítulo e botões (partials/cabecalho.php). */
export function Cabecalho({
  titulo,
  subtitulo,
  trilha,
  acoes,
}: {
  titulo: string;
  subtitulo?: string;
  /** [rótulo, endereço]; o último item (página atual) vai sem endereço. */
  trilha?: [string, string | null][];
  acoes?: ReactNode;
}) {
  return (
    <div className="acesso-cabecalho">
      <div>
        {trilha && (
          <nav aria-label="Trilha">
            <ol className="breadcrumb small mb-1">
              {trilha.map(([rotulo, href]) =>
                href ? (
                  <li key={rotulo} className="breadcrumb-item">
                    <Link href={href}>{rotulo}</Link>
                  </li>
                ) : (
                  <li key={rotulo} className="breadcrumb-item active" aria-current="page">
                    {rotulo}
                  </li>
                ),
              )}
            </ol>
          </nav>
        )}
        <h1 className="h4 mb-0">{titulo}</h1>
        {subtitulo && <p className="text-secondary small mb-0 mt-1">{subtitulo}</p>}
      </div>
      {acoes && <div className="acesso-cabecalho__acoes">{acoes}</div>}
    </div>
  );
}

const ALERTA = {
  sucesso: ['success', 'check-circle'],
  erro: ['danger', 'exclamation-octagon'],
  aviso: ['warning', 'exclamation-triangle'],
  info: ['info', 'info-circle'],
} as const;

/** Mensagem no padrão de partials/mensagens.php. */
export function Mensagem({ tipo, children }: { tipo: keyof typeof ALERTA; children: ReactNode }) {
  const [classe, icone] = ALERTA[tipo];
  return (
    <div className={`alert alert-${classe} d-flex gap-2 align-items-start`} role={tipo === 'erro' ? 'alert' : 'status'}>
      <i className={`bi bi-${icone} flex-shrink-0`} />
      <div>{children}</div>
    </div>
  );
}

/** Telas sem sessão (login, senha): cartão centralizado (templates/auth_inicio.php). */
export function MolduraAuth({ children }: { children: ReactNode }) {
  return (
    <div className="acesso-auth">
      <main className="acesso-auth__wrap">
        <div className="acesso-auth__marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/acesso/img/spaguas_white.png" alt="SP-Águas" className="acesso-auth__logo" />
          <div>
            <strong>Salas de Situação</strong>
            <span>Área administrativa</span>
          </div>
        </div>
        <div className="acesso-auth__card">{children}</div>
        <p className="acesso-auth__rodape">SP-Águas · Agência de Águas do Estado de São Paulo</p>
      </main>
    </div>
  );
}

/** Paginação preservando os filtros da URL (partials/paginacao.php). */
export function PaginacaoAcesso({ total, pagina, porPagina, base, params }: { total: number; pagina: number; porPagina: number; base: string; params: Record<string, string | undefined> }) {
  const paginas = Math.max(1, Math.ceil(total / Math.max(1, porPagina)));
  if (paginas <= 1) return null;
  const href = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set('p', String(n));
    return `${base}?${q}`;
  };
  const numeros = [];
  for (let i = Math.max(1, pagina - 2); i <= Math.min(paginas, pagina + 2); i++) numeros.push(i);
  return (
    <nav aria-label="Paginação" className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
      <small className="text-secondary">
        {total} registro(s) · página {pagina} de {paginas}
      </small>
      <ul className="pagination pagination-sm mb-0">
        <li className={`page-item${pagina <= 1 ? ' disabled' : ''}`}>
          <Link className="page-link" href={href(Math.max(1, pagina - 1))} aria-label="Anterior">
            ‹
          </Link>
        </li>
        {numeros.map((n) => (
          <li key={n} className={`page-item${n === pagina ? ' active' : ''}`}>
            <Link className="page-link" href={href(n)}>
              {n}
            </Link>
          </li>
        ))}
        <li className={`page-item${pagina >= paginas ? ' disabled' : ''}`}>
          <Link className="page-link" href={href(Math.min(paginas, pagina + 1))} aria-label="Próxima">
            ›
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** Atalhos da sala para as páginas que produzem boletim (partials/ferramentas_boletim.php). */
export function FerramentasBoletim({ atalhos }: { atalhos: { titulo: string; descricao: string; href: string; icone: string }[] }) {
  if (!atalhos.length) return null;
  return (
    <section className="acesso-card mb-3">
      <h2 className="acesso-card__titulo">
        <i className="bi bi-tools" /> Produzir boletim
      </h2>
      <div className="row g-2">
        {atalhos.map((t) => (
          <div key={t.href} className="col-lg-6">
            <a className="acesso-link-card" href={t.href}>
              <i className={`bi ${t.icone}`} />
              <span>
                <strong>{t.titulo}</strong>
                <small>{t.descricao}</small>
              </span>
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
