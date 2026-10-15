import type { Metadata } from 'next';
import '@/styles/legado/pagina-protocolo-escassez.css';
import { ConteudoLegado } from '@/components/site/conteudo-legado';
import html from '@/conteudo/legado/protocolo_escassez';

export const metadata: Metadata = {
  title: 'Protocolo de Escassez Hídrica',
  description: 'Estágios, indicadores e ações de contingência do Protocolo de Escassez Hídrica.',
};

// Texto fixo, igual ao de protocolo_escassez.php (veja scripts/capturar-legado.mjs).
export default function Pagina() {
  return <ConteudoLegado html={html} />;
}
