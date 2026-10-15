import type { Metadata } from 'next';
import Link from 'next/link';
import { inteiro } from '@/components/paginacao';
import { listarSalas } from '@/lib/admin/salas';
import { exigirPermissao } from '@/lib/auth/acl';
import { FormTipo } from '../form-tipo';

export const metadata: Metadata = { title: 'Novo tipo de boletim' };

export default async function NovoTipo({ searchParams }: { searchParams: Promise<{ sala?: string }> }) {
  await exigirPermissao('gerenciar_salas');
  const [salas, { sala }] = await Promise.all([listarSalas(), searchParams]);

  return (
    <>
      <p className="trilha">
        <Link href="/acesso/tipos-boletim">Tipos de boletim</Link> / Novo tipo
      </p>
      <h1>Novo tipo de boletim</h1>
      <FormTipo
        id={null}
        inicial={{
          salaId: inteiro(sala),
          slug: '',
          nome: '',
          descricao: '',
          periodicidade: 'diario',
          exigeRevisao: true,
          publico: true,
          ativo: true,
          ordem: '0',
        }}
        salas={salas}
      />
    </>
  );
}
