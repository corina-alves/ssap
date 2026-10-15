import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Atalhos } from '@/components/site/atalhos';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { listarPublicos } from '@/lib/documentos';
import { dataBr, tamanho } from '@/lib/formato';
import { CATEGORIAS } from '../categorias';

type Props = { params: Promise<{ categoria: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = CATEGORIAS[(await params).categoria];
  return c ? { title: c.titulo, description: c.intro } : {};
}

/** Categoria de documentos (modelo de documentos/*.php do site PHP). */
export default async function Categoria({ params }: Props) {
  const { categoria } = await params;
  if (!Object.hasOwn(CATEGORIAS, categoria)) notFound();
  const c = CATEGORIAS[categoria]!;
  // Documentos públicos cadastrados na área restrita com esta categoria.
  const { itens } = await listarPublicos({ categoria }, 100).catch(() => ({ itens: [] }));

  return (
    <>
      <Hero kicker={c.kicker} titulo={c.titulo} texto={c.intro} icone={c.icone} />
      <Principal>
        {c.grupos.map((g) => (
          <Secao key={g.secao} titulo={g.secao} subtitulo={g.sub} icone={g.icone}>
            <Atalhos itens={g.itens} />
          </Secao>
        ))}
        {itens.length > 0 && (
          <Secao titulo="Documentos publicados" subtitulo="Arquivos publicados pela equipe da Sala de Situação." icone="bi-folder2-open">
            <Atalhos
              itens={itens.map((d) => ({
                titulo: d.titulo,
                desc: `${dataBr(d.data)} · ${tamanho(d.tamanho)}${d.descricao ? ` · ${d.descricao}` : ''}`,
                href: `/documentos/arquivo/${d.id}`,
                icone: d.mime === 'application/pdf' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-arrow-down',
                externo: true,
              }))}
            />
          </Secao>
        )}
      </Principal>
    </>
  );
}
