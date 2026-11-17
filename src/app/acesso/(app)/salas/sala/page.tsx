import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Abas, type Aba } from '@/components/acesso/abas';
import { AtalhosGeracao, ContagemBoletins, dadosIndicadores, DocumentosRecentes, UltimasAtividades, UltimosBoletins } from '@/components/acesso/indicadores';
import { Cabecalho } from '@/components/acesso/pecas';
import { atalhosDaSala, type Atalho } from '@/lib/acesso/atalhos';
import { hrefModulo, MODULOS, salasPainel } from '@/lib/acesso/painel';
import { acl, exigirSala } from '@/lib/auth/acl';

export const metadata: Metadata = { title: 'Sala de Situação' };

const GRUPOS_ATALHO = [
  ['boletins', 'Produzir boletim', 'bi-tools'],
  ['graficos', 'Gráficos', 'bi-graph-up'],
] as const;

/** Cartões dos atalhos de um grupo; a descrição aparece em até duas linhas (inteira ao passar o mouse). */
function CartoesAtalho({ itens }: { itens: Atalho[] }) {
  return (
    <div className="row g-2">
      {itens.map((t) => (
        <div key={t.href} className="col-md-6 col-xl-4">
          <a className="acesso-link-card" href={t.href} title={t.descricao}>
            <i className={`bi ${t.icone}`} />
            <span>
              <strong>{t.titulo}</strong>
              <small>{t.descricao}</small>
            </span>
          </a>
        </div>
      ))}
    </div>
  );
}

/**
 * Visão geral de uma sala (salas/sala.php): módulos, os números dos boletins,
 * as ferramentas em abas e, embaixo, os últimos boletins ao lado das atividades.
 */
export default async function PaginaSala({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s = '' } = await searchParams;
  if (!s) redirect('/acesso');
  const a = await acl(); // login primeiro: sem sessão, nem revela se a sala existe
  const { id } = await exigirSala(s); // 404 ou "sem acesso" antes de qualquer saída
  const sala = (await salasPainel(a)).find((x) => x.id === id);
  if (!sala) notFound();
  const atalhos = atalhosDaSala(sala.slug).filter((t) => sala.modulos.some((m) => m.slug === t.modulo) && a.pode(t.permissao, sala.id));
  const d = await dadosIndicadores(a, [sala.id], sala.id);

  // Produzir boletim | Gráficos | Cadastrar PDF — só os grupos que têm algum atalho.
  const grupos: Aba[] = [
    ...GRUPOS_ATALHO.map(([modulo, rotulo, icone]) => {
      const itens = atalhos.filter((t) => t.modulo === modulo);
      return { chave: modulo, rotulo, icone, total: itens.length, conteudo: <CartoesAtalho itens={itens} /> };
    }),
    { chave: 'cadastrar', rotulo: 'Cadastrar PDF', icone: 'bi-file-earmark-arrow-up', total: d.atalhos.length, conteudo: <AtalhosGeracao atalhos={d.atalhos} comSala={false} /> },
  ].filter((g) => g.total > 0);
  const unico = grupos.length === 1 ? grupos[0] : undefined;

  return (
    <>
      <Cabecalho
        titulo={sala.nome}
        subtitulo={`${sala.descricao ?? ''} Seu perfil: ${sala.perfilNome}.`.trim()}
        trilha={[
          ['Início', '/acesso'],
          [sala.sigla || sala.nome, null],
        ]}
      />

      <nav className="acesso-modulos" aria-label="Módulos da sala">
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
          return def.caminho ? (
            <Link key={m.slug} className="acesso-modulo" href={hrefModulo(def.caminho, sala)}>
              {conteudo}
            </Link>
          ) : (
            <span key={m.slug} className="acesso-modulo acesso-modulo--em-breve">
              {conteudo}
            </span>
          );
        })}
      </nav>

      <ContagemBoletins d={d} />

      {unico ? (
        // Um grupo só: cartão com o nome dele, sem abas.
        <section className="acesso-card acesso-ferramentas mb-4">
          <h2 className="acesso-card__titulo">
            <i className={`bi ${unico.icone}`} /> {unico.rotulo}
          </h2>
          {unico.conteudo}
        </section>
      ) : (
        grupos.length > 1 && (
          <section className="acesso-card acesso-ferramentas mb-4">
            <h2 className="acesso-card__titulo">
              <i className="bi bi-briefcase" /> Ferramentas
            </h2>
            <Abas rotulo="Ferramentas da sala" abas={grupos} />
          </section>
        )
      )}

      <div className="row g-3">
        {d.veBoletins && (
          <div className="col-xl-8">
            <UltimosBoletins d={d} />
          </div>
        )}
        <div className={d.veBoletins ? 'col-xl-4' : 'col-12'}>
          <UltimasAtividades d={d} />
          <DocumentosRecentes d={d} />
        </div>
      </div>
    </>
  );
}
