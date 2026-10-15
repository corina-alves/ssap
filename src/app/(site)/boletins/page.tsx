import type { Metadata } from 'next';
import '@/styles/legado/pagina-boletins.css';
import { Hero, Principal } from '@/components/site/layout';
import { ListaBoletins } from '@/components/site/lista-boletins';

export const metadata: Metadata = {
  title: 'Boletins',
  description: 'Boletins publicados pela Sala de Situação.',
};

export default async function Boletins({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <Hero
        kicker="Publicações oficiais"
        titulo="Boletins da Sala de Situação"
        texto="Consulte os boletins publicados pela equipe. Novos cadastros feitos no módulo administrativo aparecem automaticamente nesta página."
        icone="bi-journal-text"
      />
      <Principal>
        <ListaBoletins base="/boletins" sp={sp} comFiltroTipo rotuloSecao="Boletins publicados" />
      </Principal>
    </>
  );
}
