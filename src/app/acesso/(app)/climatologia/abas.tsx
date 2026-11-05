import Link from 'next/link';

/** Abas da climatologia: o painel completo e a chuva do mês por UGRHI e município. */
export function Abas({ atual }: { atual: 'painel' | 'mes' }) {
  const abas: ['painel' | 'mes', string, string, string][] = [
    ['painel', '/acesso/climatologia', 'bi-cloud-rain-heavy', 'Climatologia'],
    ['mes', '/acesso/climatologia/mes', 'bi-table', 'Chuva do mês — UGRHIs e municípios'],
  ];
  return (
    <ul className="nav nav-tabs mb-3">
      {abas.map(([id, href, icone, rotulo]) => (
        <li key={id} className="nav-item">
          <Link className={`nav-link ${atual === id ? 'active' : ''}`} aria-current={atual === id ? 'page' : undefined} href={href}>
            <i className={`bi ${icone} me-1`} aria-hidden="true" />
            {rotulo}
          </Link>
        </li>
      ))}
    </ul>
  );
}
