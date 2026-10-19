import type { Metadata } from 'next';
import { PaginaAviso } from '@/components/pagina-aviso';

export const metadata: Metadata = { title: 'Página não encontrada' };

/** Endereço que não existe no site (qualquer URL sem rota). */
export default function NaoEncontrada() {
  return <PaginaAviso codigo="404" titulo="Página não encontrada" texto="O endereço pode ter mudado ou não existe mais. Use o menu ou volte para a página inicial." />;
}
