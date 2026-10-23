import { notFound, redirect } from 'next/navigation';
import { podeSumario, proxySibh, SALAS_SUMARIOS, SUMARIOS, type ChaveSumario } from '@/lib/acesso/sumarios-cheias';
import { auditar } from '@/lib/auditoria';
import { acl } from '@/lib/auth/acl';
import { usuarioAtual } from '@/lib/auth/sessao';

// O HTML original usa scripts/estilos inline, Bootstrap do CDN, o iframe do
// diagrama do SIBH e o Open-Meteo: política própria, só para estas páginas.
// frame-ancestors 'self': abrem num quadro de /acesso/sumarios_cheias/<chave>.
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
  "font-src 'self' data: https://cdn.jsdelivr.net; img-src 'self' data: blob: https:; connect-src 'self' https://api.open-meteo.com; " +
  "frame-src https://apps.spaguas.sp.gov.br; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";

// Captura do diagrama que o "Gerar PDF" dos sumários chama na mesma pasta: desativada
// (sem navegador no servidor), o sumário imprime com o diagrama ao vivo.
const CAPTURAS = ['capturar-diagrama', 'capturar-diagrama-ribeira'];

const json = (error: string, status: number) => Response.json({ error }, { status });

/**
 * Sumários Executivos de Cheias:
 *   sumario_executivo_<chave>.html   o sumário (login + criar_boletim numa das salas dele)
 *   api-sibh                         proxy da API do SIBH
 *   capturar-diagrama[-ribeira]      captura do diagrama: sempre recusa (imprime com o ao vivo)
 */
export async function GET(req: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const { arquivo } = await params;
  const url = new URL(req.url);

  const chave = /^sumario_executivo_([a-z_]+)\.html$/.exec(arquivo)?.[1];
  if (chave !== undefined) {
    const a = await acl(); // login primeiro (redireciona para /acesso/login)
    if (!Object.hasOwn(SUMARIOS, chave)) notFound();
    if (!(await podeSumario(a, SUMARIOS[chave as ChaveSumario].salas))) {
      await auditar({ modulo: 'seguranca', acao: 'acesso_negado', descricao: `Sumário ${chave} sem permissão`, usuario: a.usuario });
      redirect('/acesso/sem-acesso');
    }
    const { default: html } = await (chave === 'tiete_pinheiros'
      ? import('@/conteudo/legado/sumario_cheias_tiete_pinheiros')
      : import('@/conteudo/legado/sumario_cheias_ribeira_iguape'));
    // Sem captura, o diagrama (iframe de outro domínio) só sai colorido com a opção do navegador.
    const pagina = html.replaceAll('Imprimindo com o diagrama ao vivo.', 'Imprimindo com o diagrama ao vivo: para sair com as cores, marque “Gráficos de plano de fundo” em Mais configurações na janela de impressão.');
    return new Response(pagina, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP, 'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': 'private, no-store' } });
  }

  if (CAPTURAS.includes(arquivo)) return Response.json({ success: false, error: 'captura do diagrama desativada neste servidor' });
  if (arquivo !== 'api-sibh') notFound();

  // Proxy: recusa em JSON (o JavaScript do sumário mostra a mensagem).
  const u = await usuarioAtual();
  if (!u || u.deveTrocarSenha) return json('Sessão expirada. Entre novamente no sistema.', 401);
  if (!(await podeSumario(await acl(), SALAS_SUMARIOS))) {
    await auditar({ modulo: 'seguranca', acao: 'acesso_negado', descricao: `Sumário de cheias (API) sem permissão: ${url.pathname}`, usuario: u });
    return json('Sem permissão.', 403);
  }
  return proxySibh(url.searchParams);
}
