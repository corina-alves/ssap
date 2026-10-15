import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Sem acesso' };

export default function PaginaSemAcesso() {
  return (
    <div className="acesso-card acesso-card--estreito">
      <div className="acesso-erro-codigo">403</div>
      <h1 className="h4">Sem acesso</h1>
      <p className="text-secondary">
        Você não tem permissão para abrir esta página. Se precisar do acesso, fale com o gestor da sala.
      </p>
      <Link className="btn btn-outline-primary" href="/acesso">
        <i className="bi bi-arrow-left me-1" /> Voltar ao painel
      </Link>
    </div>
  );
}
