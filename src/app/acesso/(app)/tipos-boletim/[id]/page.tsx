import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listarSalas } from '@/lib/admin/salas';
import { obterTipo } from '@/lib/admin/tipos-boletim';
import { exigirPermissao } from '@/lib/auth/acl';
import { FormTipo } from '../form-tipo';

export const metadata: Metadata = { title: 'Editar tipo de boletim' };

export default async function EditarTipo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ criado?: string }>;
}) {
  await exigirPermissao('gerenciar_salas');
  const { id: idTexto } = await params;
  const t = /^\d{1,9}$/.test(idTexto) ? await obterTipo(Number(idTexto)) : null;
  if (!t) notFound();
  const [salas, { criado }] = await Promise.all([listarSalas(), searchParams]);

  return (
    <>
      <p className="trilha">
        <Link href="/acesso/tipos-boletim">Tipos de boletim</Link> / Editar tipo
      </p>
      <h1>{t.nome}</h1>
      {criado && <div className="alerta alerta-ok">Tipo de boletim cadastrado.</div>}
      <FormTipo
        id={t.id}
        inicial={{
          salaId: t.sala_id,
          slug: t.slug,
          nome: t.nome,
          descricao: t.descricao ?? '',
          periodicidade: t.periodicidade,
          exigeRevisao: t.exige_revisao,
          publico: t.publico,
          ativo: t.ativo,
          ordem: String(t.ordem),
        }}
        salas={salas}
      />
    </>
  );
}
