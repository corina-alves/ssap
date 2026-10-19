import type { CSSProperties, ReactNode } from 'react';

/**
 * Peças de carregamento progressivo: a página aparece na hora e cada bloco que
 * depende de uma API externa mostra um esqueleto (estilos .esq em globals.css)
 * até os dados chegarem, dentro do seu próprio <Suspense>.
 */

/** Bloco animado no lugar de um valor. `className`: esq-linha, esq-valor ou medidas próprias. */
export function Esqueleto({ className = 'esq-linha', altura, largura, style }: { className?: string; altura?: number | string; largura?: number | string; style?: CSSProperties }) {
  return <span className={`esq ${className}`} style={{ height: altura, width: largura, ...style }} aria-hidden />;
}

/**
 * Espaço do gráfico, já com a altura final: `altura` ou, com altura "auto", a
 * do contêiner da página passado em `className` (ex.: pcp-grafico-wrap).
 */
export function EsqueletoGrafico({ altura = 320, className = '', rotulo = 'Carregando gráfico…' }: { altura?: number | string; className?: string; rotulo?: string }) {
  return <div className={`esq esq-grafico ${className}`} style={altura === 'auto' ? undefined : { height: altura }} role="status" aria-label={rotulo} />;
}

/** Tabela com os cabeçalhos de verdade e as linhas em esqueleto. */
export function EsqueletoTabela({ colunas, linhas = 6, className = 'table' }: { colunas: string[]; linhas?: number; className?: string }) {
  return (
    <div className="table-responsive" role="status" aria-label="Carregando tabela…">
      <table className={className}>
        <thead>
          <tr>
            {colunas.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: linhas }, (_, i) => (
            <tr key={i}>
              {colunas.map((_, j) => (
                <td key={j}>
                  <Esqueleto />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Aviso genérico de página carregando, para rotas sem esqueleto próprio no loading.tsx. */
export function CarregandoPagina() {
  return (
    <div className="d-flex align-items-center justify-content-center gap-2 text-secondary py-5" role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm" aria-hidden />
      <span>Carregando…</span>
    </div>
  );
}

/** Linha de status enquanto a fonte responde (mesmo visual de .sssp-status). */
export function Consultando({ children = 'Carregando…', className = 'sssp-status' }: { children?: ReactNode; className?: string }) {
  return (
    <div className={className} role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm me-2" aria-hidden />
      {children}
    </div>
  );
}
