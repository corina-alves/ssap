/**
 * Página de texto fixo capturada do site PHP (scripts/capturar-legado.mjs).
 * O HTML vem dos nossos próprios arquivos em src/conteudo/legado, nunca de
 * dado digitado por usuário — por isso pode ser inserido direto.
 * `antigo`: páginas do layout antigo do PHP, cujo CSS fica preso a .doc-legado.
 */
export function ConteudoLegado({ html, antigo = false }: { html: string; antigo?: boolean }) {
  return <div className={antigo ? 'doc-legado' : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
}
