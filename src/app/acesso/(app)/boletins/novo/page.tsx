import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Cabecalho, FerramentasBoletim } from '@/components/acesso/pecas';
import { inteiro } from '@/components/paginacao';
import { atalhosDaSala } from '@/lib/acesso/atalhos';
import { acl } from '@/lib/auth/acl';
import { salasComPermissao, tiposAtivos } from '@/lib/boletins';
import { dataBr, tituloFixo } from '@/lib/formato';
import { hojeSp } from '@/lib/integracoes/comum';
import { FormNovoBoletim } from '../componentes';

export const metadata: Metadata = { title: 'Novo boletim' };

const PERIODICIDADES: Record<string, string> = { diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal', eventual: 'Eventual' };

/**
 * Novo boletim (boletins/novo.php do PHP): escolhe o tipo de boletim da sala
 * e cadastra o PDF pronto, como rascunho. Com ?tipo= (atalhos do painel e das
 * páginas que produzem boletim) já abre no formulário daquele tipo.
 */
export default async function NovoBoletim({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await acl();
  const sp = await searchParams;
  const salas = await salasComPermissao(a, 'criar_boletim');
  if (!salas.length) redirect('/acesso/sem-acesso');
  const todos = await tiposAtivos(salas.map((s) => s.id));
  const pedido = todos.find((t) => t.id === inteiro(sp.tipo));
  // a sala vem do tipo pedido, da URL ou, havendo uma só, é ela
  const sala = salas.find((s) => s.id === (pedido?.sala_id ?? inteiro(sp.sala))) ?? (salas.length === 1 ? salas[0]! : null);
  const tipos = sala ? todos.filter((t) => t.sala_id === sala.id) : todos;
  const tipo = pedido ?? (sala && tipos.length === 1 ? tipos[0]! : null);
  const hoje = hojeSp();
  const lista = sala ? `/acesso/boletins?sala=${sala.id}` : '/acesso/boletins';
  const atalhos = sala ? atalhosDaSala(sala.slug).filter((t) => t.modulo === 'boletins' && a.pode(t.permissao, sala.id)) : [];

  return (
    <>
      <Cabecalho
        titulo="Novo boletim"
        subtitulo={sala?.nome}
        trilha={[
          ['Painel', '/acesso'],
          ['Boletins', lista],
          ['Novo', null],
        ]}
      />
      <FerramentasBoletim atalhos={atalhos} />

      <div className="acesso-card acesso-card--medio">
        {tipos.length === 0 ? (
          <p className="text-secondary mb-0">
            Esta sala ainda não tem tipos de boletim ativos. Eles são cadastrados em <Link href="/acesso/tipos-boletim">Tipos de boletim</Link>.
          </p>
        ) : !tipo ? (
          <>
            <h2 className="acesso-card__titulo">
              <i className="bi bi-journal-plus" /> Qual boletim?
            </h2>
            <div className="acesso-atalhos">
              {tipos.map((t) => (
                <Link key={t.id} className="acesso-atalho" href={`/acesso/boletins/novo?tipo=${t.id}`}>
                  <i className="bi bi-file-earmark-arrow-up" />
                  <span>
                    <strong>{t.nome}</strong>
                    <small>
                      {!sala && `${salas.find((s) => s.id === t.sala_id)?.sigla ?? ''} · `}
                      {PERIODICIDADES[t.periodicidade] ?? t.periodicidade} · upload de PDF
                    </small>
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <FormNovoBoletim tipo={tipo} cancelar={lista} inicialValores={{ tipoId: tipo.id, titulo: tipo.titulo_fixo ? tituloFixo(tipo.titulo_fixo, hoje) : `${tipo.nome} — ${dataBr(hoje)}`, dataReferencia: hoje, competencia: '' }} />
        )}
      </div>
    </>
  );
}
