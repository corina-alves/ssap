import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obter, perfis, salas } from '@/lib/admin/usuarios';
import { exigirPermissao } from '@/lib/auth/acl';
import { dataHora, hora } from '@/lib/formato';
import { AcoesUsuario } from '../acoes-usuario';
import { FormUsuario } from '../form-usuario';

export const metadata: Metadata = { title: 'Editar usuário' };

export default async function EditarUsuario({ params }: { params: Promise<{ id: string }> }) {
  const a = await exigirPermissao('gerenciar_usuarios');
  const { id: idTexto } = await params;
  const id = /^\d{1,9}$/.test(idTexto) ? Number(idTexto) : 0;
  const u = id ? await obter(id) : null;
  if (!u) notFound();

  const [p, s] = await Promise.all([perfis(), salas()]);
  const ehEuMesmo = u.id === a.usuario.id;

  return (
    <>
      <p className="trilha">
        <Link href="/acesso/usuarios">Usuários</Link> / Editar usuário
      </p>
      <h1>{u.nome}</h1>
      <FormUsuario
        id={u.id}
        inicial={{
          nome: u.nome,
          email: u.email,
          login: u.login,
          status: u.status,
          deveTrocarSenha: u.deve_trocar_senha,
          perfisGlobais: u.perfisGlobais,
          salas: u.salas,
        }}
        perfis={p}
        salas={s}
        ehEuMesmo={ehEuMesmo}
      />
      <AcoesUsuario id={u.id} bloqueadoAte={u.bloqueado_temp ? hora(u.bloqueado_ate) : null} podeExcluir={!ehEuMesmo} />
      <p className="suave">
        Cadastrado em {dataHora(u.criado_em)} · último acesso {dataHora(u.ultimo_acesso)}
      </p>
    </>
  );
}
