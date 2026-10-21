import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Cabecalho } from '@/components/acesso/pecas';
import { idTipoBoletim } from '@/lib/acesso/api';
import { arquivoSumario, ehSumario, salasDoSumario, SUMARIOS } from '@/lib/acesso/sumarios-cheias';
import { auditar } from '@/lib/auditoria';
import { acl } from '@/lib/auth/acl';
import { QuadroSumario } from './quadro';

export async function generateMetadata({ params }: { params: Promise<{ chave: string }> }): Promise<Metadata> {
  const { chave } = await params;
  return { title: ehSumario(chave) ? SUMARIOS[chave].titulo : 'Sumário Executivo' };
}

/**
 * Sumários Executivos de Cheias dentro da área administrativa: o HTML original
 * (servido por /acesso/sumario_executivo_cheias) abre num quadro abaixo do
 * cabeçalho, com o menu lateral; o "Gerar PDF" dele imprime só o sumário.
 * ?s= escolhe a sala (o do Ribeira é das salas Alfredo Pisani e Ribeira).
 */
export default async function PaginaSumario({ params, searchParams }: { params: Promise<{ chave: string }>; searchParams: Promise<{ s?: string }> }) {
  const [{ chave }, { s = '' }] = await Promise.all([params, searchParams]);
  const a = await acl();
  if (!ehSumario(chave)) notFound();
  const sumario = SUMARIOS[chave];
  const [sala] = await salasDoSumario(a, sumario.salas, s);
  if (!sala) {
    await auditar({ modulo: 'seguranca', acao: 'acesso_negado', descricao: `Sumário ${chave} sem permissão`, usuario: a.usuario });
    redirect('/acesso/sem-acesso');
  }
  const idTipo = await idTipoBoletim(sala.id, sumario.tipos[sala.slug] ?? '');
  const hrefSala = `/acesso/salas/sala?s=${sala.slug}`;

  return (
    <div>
      <Cabecalho
        titulo={sumario.titulo}
        subtitulo={sala.nome}
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, hrefSala],
          ['Boletins', `/acesso/boletins?sala=${sala.id}`],
          [sumario.titulo, null],
        ]}
        acoes={
          <>
            <Link className="btn btn-outline-secondary" href={hrefSala}>
              <i className="bi bi-arrow-left me-1" /> Voltar para a sala
            </Link>
            <Link className="btn btn-outline-secondary" href={`/acesso/boletins?sala=${sala.id}`}>
              <i className="bi bi-journal-text me-1" /> Boletins da sala
            </Link>
            {idTipo > 0 && (
              <Link className="btn btn-outline-secondary" href={`/acesso/boletins/novo?tipo=${idTipo}`}>
                <i className="bi bi-upload me-1" /> Cadastrar PDF como boletim
              </Link>
            )}
          </>
        }
      />
      <QuadroSumario src={arquivoSumario(chave)} titulo={sumario.titulo} sala={sala.slug} />
    </div>
  );
}
