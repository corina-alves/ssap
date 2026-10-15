import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { acl } from '@/lib/auth/acl';
import { categorias, FORMATOS_ACEITOS, salasDocumentos } from '@/lib/documentos';
import { FormDocumento } from '../componentes';

export const metadata: Metadata = { title: 'Enviar documento' };

export default async function NovoDocumento() {
  const a = await acl();
  const salas = await salasDocumentos(a, 'enviar_documentos');
  if (!salas.length) redirect('/acesso/sem-acesso');
  const cats = await categorias(salas.map((s) => s.id));

  return (
    <>
      <p className="trilha">
        <Link href="/acesso/documentos">Documentos</Link> / Enviar documento
      </p>
      <h1>Enviar documento</h1>
      <FormDocumento
        id={null}
        inicialValores={{
          salaId: salas.length === 1 ? salas[0]!.id : 0,
          categoriaId: 0,
          titulo: '',
          descricao: '',
          dataDocumento: '',
          publico: false,
        }}
        salas={salas}
        categorias={cats}
        formatos={FORMATOS_ACEITOS}
      />
    </>
  );
}
