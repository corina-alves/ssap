import type { Metadata } from 'next';
import Link from 'next/link';
import { listarModulos } from '@/lib/admin/salas';
import { exigirPermissao } from '@/lib/auth/acl';
import { FormSala } from '../form-sala';

export const metadata: Metadata = { title: 'Nova sala' };

export default async function NovaSala() {
  await exigirPermissao('gerenciar_salas');
  const modulos = await listarModulos();
  // Sala nova começa com os módulos comuns a todas (como no seed).
  const padrao = modulos.filter((m) => ['boletins', 'graficos', 'documentos'].includes(m.slug)).map((m) => m.id);

  return (
    <>
      <p className="trilha">
        <Link href="/acesso/salas">Salas</Link> / Nova sala
      </p>
      <h1>Nova sala</h1>
      <FormSala
        id={null}
        inicial={{ slug: '', nome: '', sigla: '', descricao: '', cor: '', status: 'ativa', ordem: '0', modulos: padrao }}
        modulos={modulos}
      />
    </>
  );
}
