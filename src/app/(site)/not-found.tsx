import { PaginaAviso } from '@/components/pagina-aviso';

/** notFound() dentro do site público: o aviso aparece com o menu e o rodapé do site. */
export default function NaoEncontradaSite() {
  return <PaginaAviso codigo="404" titulo="Página não encontrada" texto="O conteúdo procurado não existe ou foi retirado. Use o menu acima ou volte para a página inicial." />;
}
