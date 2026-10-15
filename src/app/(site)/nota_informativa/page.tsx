import type { Metadata } from 'next';
import '@/styles/legado/pagina-nota-informativa.css';
import { ConteudoLegado } from '@/components/site/conteudo-legado';
import html from '@/conteudo/legado/nota_informativa';

export const metadata: Metadata = {
  title: 'Nota Informativa Conjunta SP-Águas e Arsesp',
  description: 'Projeções hidrológicas e ações de gestão da demanda do Comitê de Integração das Agências.',
};

// Texto fixo, igual ao de nota_informativa.php (veja scripts/capturar-legado.mjs).
export default function Pagina() {
  return <ConteudoLegado html={html} />;
}
