import type { Metadata } from 'next';
import '@/styles/legado/pagina-monitoramento-hidrologico.css';
import { ConteudoLegado } from '@/components/site/conteudo-legado';
import html from '@/conteudo/legado/monitoramento_hidrologico';

export const metadata: Metadata = {
  title: 'Monitoramento Hidrológico',
  description: 'Rede de chuvas, rios, níveis e vazões do Estado de São Paulo.',
};

// Texto fixo, igual ao de monitoramento_hidrologico.php (veja scripts/capturar-legado.mjs).
export default function Pagina() {
  return <ConteudoLegado html={html} />;
}
