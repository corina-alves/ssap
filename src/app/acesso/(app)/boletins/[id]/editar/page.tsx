import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Cabecalho } from '@/components/acesso/pecas';
import { acl } from '@/lib/auth/acl';
import { EDITAVEIS, obter, podeEditar, ROTULO_STATUS, salasComPermissao } from '@/lib/boletins';
import { dataHora } from '@/lib/formato';
import { FormEditarBoletim } from '../../componentes';

export const metadata: Metadata = { title: 'Editar boletim' };

/** Edição de um boletim (boletins/editar.php do PHP): identificação e troca do PDF. */
export default async function EditarBoletim({ params }: { params: Promise<{ id: string }> }) {
  const a = await acl();
  const { id } = await params;
  const b = /^\d{1,15}$/.test(id) ? await obter(Number(id)) : null;
  if (!b) notFound();
  if (!(await salasComPermissao(a, 'visualizar_boletins')).some((s) => s.id === b.sala_id)) redirect('/acesso/sem-acesso');
  const ver = `/acesso/boletins/${b.id}`;
  const editavelNormal = EDITAVEIS.includes(b.status);
  if (!podeEditar(b, a)) {
    // em rascunho ou revisão, falta a permissão; nas outras situações, o boletim precisa voltar antes
    if (editavelNormal) redirect('/acesso/sem-acesso');
    redirect(`${ver}?aviso=nao-editavel`);
  }

  return (
    <>
      <Cabecalho
        titulo={`Editar: ${b.titulo}`}
        subtitulo={`${b.tipo_nome} · ${ROTULO_STATUS[b.status]} · v${b.versao_atual}`}
        trilha={[
          ['Painel', '/acesso'],
          ['Boletins', `/acesso/boletins?sala=${b.sala_id}`],
          ['Boletim', ver],
          ['Editar', null],
        ]}
        acoes={
          <Link className="btn btn-outline-secondary" href={ver}>
            <i className="bi bi-arrow-left me-1" /> Voltar ao boletim
          </Link>
        }
      />
      {!editavelNormal && (
        <div className="alert alert-warning acesso-card--medio">
          <i className="bi bi-shield-exclamation" /> Você está editando um boletim <strong>{ROTULO_STATUS[b.status].toLowerCase()}</strong> como administrador.{' '}
          {b.status === 'publicado' ? 'As mudanças (inclusive um PDF novo) aparecem no site na hora.' : 'A situação do boletim não muda.'} A alteração fica registrada no
          histórico de versões e na auditoria.
        </div>
      )}
      <section className="acesso-card acesso-card--medio mb-3">
        <h2 className="acesso-card__titulo">
          <i className="bi bi-card-text" /> Identificação
        </h2>
        <p className="small text-secondary">
          Inserido por <strong>{b.criado_por_nome ?? '—'}</strong> em {dataHora(b.criado_em)}.
        </p>
        <FormEditarBoletim
          id={b.id}
          mensal={b.periodicidade === 'mensal'}
          tituloFixo={b.tipo_titulo_fixo}
          pdfAtual={b.pdf_nome}
          inicialValores={{ tipoId: b.tipo_id, titulo: b.titulo, dataReferencia: b.data_referencia, competencia: b.competencia ?? '' }}
        />
      </section>
    </>
  );
}
