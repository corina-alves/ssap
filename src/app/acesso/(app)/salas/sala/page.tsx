import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Indicadores } from '@/components/acesso/indicadores';
import { Cabecalho } from '@/components/acesso/pecas';
import { atalhosDaSala } from '@/lib/acesso/atalhos';
import { hrefModulo, MODULOS, salasPainel } from '@/lib/acesso/painel';
import { acl, exigirSala } from '@/lib/auth/acl';

export const metadata: Metadata = { title: 'Sala de Situação' };

const GRUPOS_ATALHO = [
  ['boletins', 'Produzir boletim', 'bi-tools'],
  ['graficos', 'Gráficos', 'bi-graph-up'],
] as const;

/** Visão geral de uma sala: módulos habilitados e indicadores (salas/sala.php). */
export default async function PaginaSala({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s = '' } = await searchParams;
  if (!s) redirect('/acesso');
  const a = await acl(); // login primeiro: sem sessão, nem revela se a sala existe
  const { id } = await exigirSala(s); // 404 ou "sem acesso" antes de qualquer saída
  const sala = (await salasPainel(a)).find((x) => x.id === id);
  if (!sala) notFound();
  const atalhos = atalhosDaSala(sala.slug).filter((t) => sala.modulos.some((m) => m.slug === t.modulo) && a.pode(t.permissao, sala.id));

  return (
    <>
      <Cabecalho
        titulo={sala.nome}
        subtitulo={`${sala.descricao ?? ''} Seu perfil: ${sala.perfilNome}.`.trim()}
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, null],
        ]}
      />

      <div className="row g-3 mb-4">
        {sala.modulos.map((m) => {
          const def = MODULOS[m.slug];
          if (!def || !a.pode(def.permissao, sala.id)) return null;
          const conteudo = (
            <>
              <i className={`bi ${m.icone ?? 'bi-circle'}`} />
              <strong>{m.nome}</strong>
              {!def.caminho && <small>em breve</small>}
            </>
          );
          return (
            <div key={m.slug} className="col-6 col-lg-3">
              {def.caminho ? (
                <Link className="acesso-modulo" href={hrefModulo(def.caminho, sala)}>
                  {conteudo}
                </Link>
              ) : (
                <div className="acesso-modulo acesso-modulo--em-breve">{conteudo}</div>
              )}
            </div>
          );
        })}
      </div>

      {GRUPOS_ATALHO.map(([modulo, titulo, icone]) => {
        const doModulo = atalhos.filter((t) => t.modulo === modulo);
        return doModulo.length === 0 ? null : (
        <section key={modulo} className="acesso-card mb-4">
          <h2 className="acesso-card__titulo">
            <i className={`bi ${icone}`} /> {titulo}
          </h2>
          <div className="row g-3">
            {doModulo.map((t) => (
              <div key={t.href} className="col-md-6 col-xl-4">
                <a className="acesso-link-card" href={t.href}>
                  <i className={`bi ${t.icone}`} />
                  <span>
                    <strong>{t.titulo}</strong>
                    <small>{t.descricao}</small>
                  </span>
                </a>
              </div>
            ))}
          </div>
        </section>
        );
      })}

      <Indicadores a={a} salas={[sala.id]} salaId={sala.id} />
    </>
  );
}
