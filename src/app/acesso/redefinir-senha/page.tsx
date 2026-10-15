import type { Metadata } from 'next';
import Link from 'next/link';
import { CampoSenha } from '@/components/acesso/campo-senha';
import { MolduraAuth } from '@/components/acesso/pecas';
import { tokenValido } from '@/lib/auth/redefinicao';
import { SENHA } from '@/lib/config';
import { definirSenhaPorLink } from '../actions';
import { Formulario } from '../formulario';

export const metadata: Metadata = {
  title: 'Definir senha',
  // O token vai na URL: não repassar a outros sites.
  referrer: 'no-referrer',
};

export default async function PaginaRedefinir({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const dono = await tokenValido(token);

  return (
    <MolduraAuth>
      {!dono ? (
        <>
          <h1 className="h4 mb-3">Link inválido</h1>
          <p className="text-secondary">
            Este link é inválido, já foi usado ou expirou. Peça um novo link ao administrador do sistema.
          </p>
          <Link className="btn btn-outline-primary w-100 mt-2" href="/acesso/login">
            <i className="bi bi-arrow-left me-1" /> Voltar ao login
          </Link>
        </>
      ) : (
        <>
          <h1 className="h4 mb-1">Definir senha</h1>
          <p className="text-secondary small mb-4">
            Conta: <strong>{dono.login}</strong>
          </p>
          <Formulario acao={definirSenhaPorLink} rotuloBotao="Salvar senha">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="usuario" value={dono.login} autoComplete="username" readOnly />
            <CampoSenha
              nome="nova"
              rotulo="Nova senha"
              autoComplete="new-password"
              minLength={SENHA.min}
              ajuda={`Mínimo de ${SENHA.min} caracteres, com letras e números. Não use seu nome, login ou e-mail.`}
            />
            <CampoSenha nome="confirmacao" rotulo="Confirme a nova senha" autoComplete="new-password" minLength={SENHA.min} />
          </Formulario>
        </>
      )}
    </MolduraAuth>
  );
}
