import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CampoSenha } from '@/components/acesso/campo-senha';
import { Mensagem, MolduraAuth } from '@/components/acesso/pecas';
import { usuarioAtual } from '@/lib/auth/sessao';
import { entrar } from '../actions';
import { Formulario } from '../formulario';

export const metadata: Metadata = { title: 'Entrar' };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  if (await usuarioAtual()) redirect('/acesso');
  const { senha } = await searchParams;

  return (
    <MolduraAuth>
      {senha === 'definida' && <Mensagem tipo="sucesso">Senha definida. Entre com a nova senha.</Mensagem>}
      <h1 className="h4 mb-1">Entrar</h1>
      <p className="text-secondary small mb-4">Use o seu usuário ou e-mail institucional.</p>

      <Formulario acao={entrar} rotuloBotao="Entrar" icone="bi-box-arrow-in-right">
        <div className="mb-3">
          <label htmlFor="usuario" className="form-label">
            Usuário ou e-mail
          </label>
          <input type="text" className="form-control" id="usuario" name="usuario" autoComplete="username" maxLength={190} required autoFocus />
        </div>
        <CampoSenha nome="senha" rotulo="Senha" autoComplete="current-password" />
      </Formulario>

      <div className="text-center mt-3">
        <Link href="/acesso/esqueci-senha" className="small">
          Esqueci minha senha
        </Link>
      </div>
    </MolduraAuth>
  );
}
