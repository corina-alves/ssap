import { Suspense, type ReactNode } from 'react';
import { Moldura } from '@/components/acesso/moldura';
import { montarMenu } from '@/lib/acesso/painel';
import { acl } from '@/lib/auth/acl';
import { sair } from '../actions';

/** Moldura da área logada: barra superior e menu lateral conforme as permissões. */
export default async function LayoutArea({ children }: { children: ReactNode }) {
  const a = await acl();
  const menu = await montarMenu(a);
  return (
    <Suspense>
      <Moldura menu={menu} usuario={{ nome: a.usuario.nome, email: a.usuario.email }} sair={sair}>
        {children}
      </Moldura>
    </Suspense>
  );
}
