import type { Metadata } from 'next';
import Link from 'next/link';
import { CampoSenha } from '@/components/acesso/campo-senha';
import { MolduraAuth } from '@/components/acesso/pecas';
import { exigirUsuario } from '@/lib/auth/acl';
import { SENHA } from '@/lib/config';
import { alterarSenha } from '../actions';
import { Formulario } from '../formulario';

export const metadata: Metadata = { title: 'Trocar senha' };

export default async function PaginaTrocarSenha() {
  const u = await exigirUsuario({ permitirTrocaPendente: true });

  return (
    <MolduraAuth>
      <h1 className="h4 mb-1">Trocar senha</h1>
      <p className="text-secondary small mb-4">
        {u.deveTrocarSenha
          ? 'É preciso definir uma nova senha antes de continuar.'
          : 'Ao trocar a senha, as outras sessões abertas serão encerradas.'}
      </p>
      <Formulario
        acao={alterarSenha}
        rotuloBotao="Salvar nova senha"
        cancelar={
          !u.deveTrocarSenha && (
            <Link href="/acesso" className="btn btn-outline-secondary">
              Cancelar
            </Link>
          )
        }
      >
        <input type="hidden" name="usuario" value={u.login} autoComplete="username" readOnly />
        <CampoSenha nome="atual" rotulo="Senha atual" autoComplete="current-password" />
        <CampoSenha
          nome="nova"
          rotulo="Nova senha"
          autoComplete="new-password"
          minLength={SENHA.min}
          ajuda={`Mínimo de ${SENHA.min} caracteres, com letras e números. Não use seu nome, login ou e-mail.`}
        />
        <CampoSenha nome="confirmacao" rotulo="Confirme a nova senha" autoComplete="new-password" minLength={SENHA.min} />
      </Formulario>
    </MolduraAuth>
  );
}
