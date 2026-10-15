import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/styles/legado/pagina-boletins.css';
import { Hero, Principal } from '@/components/site/layout';
import { ListaBoletins } from '@/components/site/lista-boletins';
import { TIPOS_PUBLICOS, type TipoPublico } from '../tipos';

type Props = {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tipo } = await params;
  const t = TIPOS_PUBLICOS[tipo as TipoPublico];
  return t ? { title: t.titulo, description: t.descricao } : {};
}

/** Página de um tipo de boletim (modelo de includes/public_boletim_page.php). */
export default async function PaginaTipo({ params, searchParams }: Props) {
  const { tipo } = await params;
  if (!Object.hasOwn(TIPOS_PUBLICOS, tipo)) notFound();
  const t = TIPOS_PUBLICOS[tipo as TipoPublico];
  return (
    <>
      <Hero kicker="Boletins oficiais" titulo={t.titulo} texto={t.descricao} icone="bi-file-earmark-pdf" />
      <Principal>
        <ListaBoletins base={`/boletins/${tipo}`} sp={await searchParams} tipos={[...t.tipos]} rotuloSecao="Publicações disponíveis" />
      </Principal>
    </>
  );
}
