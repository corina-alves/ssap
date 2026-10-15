import type { Metadata } from 'next';
import { ConteudoLegado } from '@/components/site/conteudo-legado';
import html from '@/conteudo/legado/situacao-outorgas';

export const metadata: Metadata = {
  title: 'Outorgas',
  description: 'Outorgas de direito de uso de recursos hídricos dos sistemas produtores da RMSP.',
};

// Texto fixo, igual ao de situacao-outorgas.php (veja scripts/capturar-legado.mjs).
export default function Pagina() {
  return <ConteudoLegado html={html} />;
}
