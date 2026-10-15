import type { Metadata } from 'next';
import Link from 'next/link';
import { perfis, salas } from '@/lib/admin/usuarios';
import { exigirPermissao } from '@/lib/auth/acl';
import { FormUsuario } from '../form-usuario';

export const metadata: Metadata = { title: 'Novo usuário' };

export default async function NovoUsuario() {
  await exigirPermissao('gerenciar_usuarios');
  const [p, s] = await Promise.all([perfis(), salas()]);

  return (
    <>
      <p className="trilha">
        <Link href="/acesso/usuarios">Usuários</Link> / Novo usuário
      </p>
      <h1>Novo usuário</h1>
      <FormUsuario
        id={null}
        inicial={{ nome: '', email: '', login: '', status: 'ativo', deveTrocarSenha: false, perfisGlobais: [], salas: {} }}
        perfis={p}
        salas={s}
        ehEuMesmo={false}
      />
    </>
  );
}
