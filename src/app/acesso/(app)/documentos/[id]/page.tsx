import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { acl } from '@/lib/auth/acl';
import { categorias, FORMATOS_ACEITOS, obter, salasDocumentos } from '@/lib/documentos';
import { dataBr, dataHora, tamanho } from '@/lib/formato';
import { ExcluirDocumento, FormDocumento } from '../componentes';

export const metadata: Metadata = { title: 'Documento' };

export default async function VerDocumento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ enviado?: string }>;
}) {
  const a = await acl();
  const { id } = await params;
  const d = /^\d{1,15}$/.test(id) ? await obter(Number(id)) : null;
  if (!d) notFound();
  const [ver, enviar, excluir] = await Promise.all(
    ['visualizar_documentos', 'enviar_documentos', 'excluir_documentos'].map((p) => salasDocumentos(a, p)),
  );
  if (!ver!.some((s) => s.id === d.sala_id)) redirect('/acesso/sem-acesso');
  const podeEditar = enviar!.some((s) => s.id === d.sala_id);
  const podeExcluir = excluir!.some((s) => s.id === d.sala_id);
  const { enviado } = await searchParams;

  return (
    <>
      <p className="trilha">
        <Link href="/acesso/documentos">Documentos</Link> / {d.sala_nome}
      </p>
      <h1>{d.titulo}</h1>
      {enviado && <div className="alerta alerta-ok">Documento enviado.</div>}
      <section className="cartao">
        <p>
          <a href={`/acesso/documentos/${d.id}/arquivo`}>{d.nome_original}</a>{' '}
          <small className="suave">({tamanho(d.tamanho)})</small>
        </p>
        {d.descricao && <p>{d.descricao}</p>}
        <dl className="dados">
          <dt>Categoria</dt>
          <dd>{d.categoria_nome ?? '—'}</dd>
          <dt>Data</dt>
          <dd>{d.data_documento ? dataBr(d.data_documento) : '—'}</dd>
          <dt>Visibilidade</dt>
          <dd>{d.publico ? 'Público (aparece no site)' : 'Interno'}</dd>
          <dt>Enviado</dt>
          <dd>
            {dataHora(d.criado_em)} {d.criado_por_nome && `· ${d.criado_por_nome}`}
          </dd>
          {d.atualizado_em && (
            <>
              <dt>Alterado</dt>
              <dd>
                {dataHora(d.atualizado_em)} {d.atualizado_por_nome && `· ${d.atualizado_por_nome}`}
              </dd>
            </>
          )}
        </dl>
      </section>
      {podeEditar && (
        <FormDocumento
          id={d.id}
          inicialValores={{
            salaId: d.sala_id,
            categoriaId: d.categoria_id ?? 0,
            titulo: d.titulo,
            descricao: d.descricao ?? '',
            dataDocumento: d.data_documento ?? '',
            publico: d.publico,
          }}
          salas={[{ id: d.sala_id, nome: d.sala_nome }]}
          categorias={await categorias([d.sala_id])}
          formatos={FORMATOS_ACEITOS}
        />
      )}
      {podeExcluir && (
        <section className="cartao">
          <ExcluirDocumento id={d.id} />
        </section>
      )}
    </>
  );
}
