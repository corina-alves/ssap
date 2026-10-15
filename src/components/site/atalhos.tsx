import Link from 'next/link';

/** Grade de atalhos .quick-link (modelo de includes/pagina_documentos.php). */
export function Atalhos({ itens }: { itens: { titulo: string; desc?: string; href: string; icone: string; externo?: boolean }[] }) {
  return (
    <div className="row g-3">
      {itens.map((it) => {
        const conteudo = (
          <>
            <span className="qicon">
              <i className={`bi ${it.icone}`} />
            </span>
            <span>
              <strong>
                {it.titulo}
                {it.externo && (
                  <>
                    {' '}
                    <i className="bi bi-box-arrow-up-right" />
                  </>
                )}
              </strong>
              {it.desc && <small>{it.desc}</small>}
            </span>
          </>
        );
        return (
          <div className="col-md-6 col-xl-4" key={it.href + it.titulo}>
            {it.externo ? (
              <a className="quick-link" href={it.href} target="_blank" rel="noopener">
                {conteudo}
              </a>
            ) : (
              <Link className="quick-link" href={it.href}>
                {conteudo}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
