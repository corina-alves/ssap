import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listarModulos, obterSala } from '@/lib/admin/salas';
import { exigirPermissao } from '@/lib/auth/acl';
import { FormSala } from '../form-sala';

export const metadata: Metadata = { title: 'Editar sala' };

export default async function EditarSala({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ criada?: string }>;
}) {
  await exigirPermissao('gerenciar_salas');
  const { id: idTexto } = await params;
  const sala = /^\d{1,9}$/.test(idTexto) ? await obterSala(Number(idTexto)) : null;
  if (!sala) notFound();
  const [modulos, { criada }] = await Promise.all([listarModulos(), searchParams]);

  return (
    <>
      <p className="trilha">
        <Link href="/acesso/salas">Salas</Link> / Editar sala
      </p>
      <h1>{sala.nome}</h1>
      {criada && <div className="alerta alerta-ok">Sala cadastrada.</div>}
      <FormSala
        id={sala.id}
        inicial={{
          slug: sala.slug,
          nome: sala.nome,
          sigla: sala.sigla ?? '',
          descricao: sala.descricao ?? '',
          cor: sala.cor ?? '',
          status: sala.status,
          ordem: String(sala.ordem),
          modulos: sala.modulos,
        }}
        modulos={modulos}
      />
      <p>
        <Link href={`/acesso/tipos-boletim?sala=${sala.id}`}>Tipos de boletim desta sala</Link>
      </p>
    </>
  );
}
