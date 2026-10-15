import 'server-only';

/**
 * Páginas de produção de boletim: documentos HTML completos, fora da moldura
 * da área restrita, porque são impressos como PDF (cada <section> é uma
 * página). Usam o script e o CSS originais do PHP, servidos de public/acesso/.
 */

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// A mesma política do PHP: só recursos do próprio site (o script não é inline).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; " +
  "font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

export function paginaAvulsa(p: {
  titulo: string;
  /** Pasta em public/acesso/ com boletim.css e boletim.js. */
  pasta: string;
  /** Atributos data-* do <body>, lidos pelo script. */
  dados?: Record<string, string>;
  /** HTML da barra de botões (já escapado por quem monta). */
  barra: string;
  dica: string;
  /** Miolo capturado do PHP (src/conteudo/legado). */
  miolo: string;
  scripts?: string[];
  /** Muda quando o script/CSS muda, para o navegador não usar a cópia antiga. */
  versao: string;
}): Response {
  const base = `/acesso/${p.pasta}`;
  const atributos = Object.entries(p.dados ?? {})
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join('');
  const scripts = [...(p.scripts ?? []), `${base}/boletim.js?v=${p.versao}`, '/acesso/js/subir.js'].map((s) => `<script src="${esc(s)}"></script>`).join('\n');
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(p.titulo)}</title>
<link rel="stylesheet" href="${base}/boletim.css?v=${p.versao}">
<link rel="stylesheet" href="/acesso/css/subir.css">
</head>
<body${atributos}>
<div class="barra no-print">
${p.barra}
</div>
<p class="dica no-print">${p.dica}</p>
${p.miolo}
${scripts}
</body>
</html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP,
      'Cache-Control': 'private, no-store',
    },
  });
}

export { esc as escaparHtml };
