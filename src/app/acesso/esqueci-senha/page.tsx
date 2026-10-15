import type { Metadata } from 'next';
import Link from 'next/link';
import { MolduraAuth } from '@/components/acesso/pecas';

export const metadata: Metadata = { title: 'Esqueci minha senha' };

// Enquanto não houver SMTP institucional, a redefinição é feita pelo
// administrador, que gera um link de uso único na tela de usuários.
export default function PaginaEsqueciSenha() {
  return (
    <MolduraAuth>
      <h1 className="h4 mb-3">Esqueci minha senha</h1>
      <p>
        Por segurança, a senha é redefinida pelo <strong>administrador do sistema</strong>.
      </p>
      <ol className="small text-secondary ps-3">
        <li>Entre em contato com o administrador da sua Sala de Situação.</li>
        <li>
          Ele vai gerar um <strong>link de redefinição de uso único</strong>, válido por 24 horas.
        </li>
        <li>Abra o link e cadastre a nova senha.</li>
      </ol>
      <Link className="btn btn-outline-primary w-100 mt-2" href="/acesso/login">
        <i className="bi bi-arrow-left me-1" /> Voltar ao login
      </Link>
    </MolduraAuth>
  );
}
