import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { Acl } from '../auth/acl';
import { query } from '../db';
import { lembrar } from '../integracoes/cache';
import { buscarJson } from '../integracoes/http';
import { absoluto } from '../storage';

/**
 * Sumários Executivos de Cheias (porte de acesso/sumario_executivo_cheias do
 * PHP): o HTML original é servido sem alteração depois do login, e o
 * JavaScript dele chama, na mesma pasta, o proxy do SIBH e a captura do
 * diagrama. Os dois ficam na área da Sala Alfredo Pisani; o do Ribeira também
 * pode ser feito pela sala Ribeira.
 */
export const SUMARIOS = {
  ribeira_iguape: {
    salas: ['alfredo-pisani', 'ribeira'],
    diagrama: { url: 'https://apps.spaguas.sp.gov.br/sibh/diagramas/tiete_pinheiros/?vw=flow&dg=ribeira-iguape&bs=gigante', altura: 1150 },
  },
  tiete_pinheiros: {
    salas: ['alfredo-pisani'],
    diagrama: { url: 'https://apps.spaguas.sp.gov.br/sibh/diagramas/tiete_pinheiros/?vw=flow&dg=tiete-pinheiros&bf=completo&bs=medio', altura: 1048 },
  },
} as const;
export type ChaveSumario = keyof typeof SUMARIOS;

/** Tem criar_boletim em alguma das salas (ativas)? */
export async function podeSumario(a: Acl, salas: readonly string[]): Promise<boolean> {
  const linhas = await query<{ id: number }>(`SELECT id FROM salas WHERE slug = ANY($1::text[]) AND status = 'ativa' AND excluido_em IS NULL`, [[...salas]]);
  return linhas.some((s) => a.pode('criar_boletim', s.id));
}

export const SALAS_SUMARIOS = [...new Set(Object.values(SUMARIOS).flatMap((s) => s.salas))];

// ---------------------------------------------------------------------------
// Proxy do SIBH (api_proxy.php)
// ---------------------------------------------------------------------------

const API_V2 = 'https://apps.spaguas.sp.gov.br/sibh/api/v2/';
const API_V1 = 'https://apps.spaguas.sp.gov.br/sibh/api/v1/'; // comportas das barragens
const CAMINHOS_V2 = ['measurements', 'measurements/now', 'parameters'];
const CAMINHOS_V1 = ['dams'];

/**
 * Repassa uma consulta à API pública do SIBH (só os caminhos permitidos), com
 * cache curto: o sumário pede os dados com a hora exata, então as datas são
 * arredondadas para 5 min — reabrir o sumário no mesmo intervalo usa a
 * resposta guardada. Cotas (parameters) mudam raramente: 24 h.
 */
export async function proxySibh(parametros: URLSearchParams): Promise<Response> {
  const caminho = (parametros.get('path') ?? '').trim();
  const v1 = CAMINHOS_V1.includes(caminho);
  if (!v1 && !CAMINHOS_V2.includes(caminho)) {
    return Response.json({ error: "Parametro 'path' invalido ou ausente.", permitidos: [...CAMINHOS_V2, ...CAMINHOS_V1] }, { status: 400 });
  }
  const partes: string[] = [];
  for (let [chave, valor] of parametros) {
    if (chave === 'path') continue;
    if (chave === 'start_date' || chave === 'end_date') {
      const t = Date.parse(valor);
      if (!Number.isNaN(t)) valor = `${new Date(Math.floor(t / 300_000) * 300_000).toISOString().slice(0, 16)}:00Z`;
    }
    // "chave[]=valor" (station_prefix_ids[], parameterizable_ids[]) vai com os colchetes literais
    const lista = chave.endsWith('[]');
    if (lista) chave = chave.slice(0, -2);
    partes.push(`${encodeURIComponent(chave)}${lista ? '[]' : ''}=${encodeURIComponent(valor)}`);
  }
  const url = `${v1 ? API_V1 : API_V2}${caminho}${partes.length ? `?${partes.join('&')}` : ''}`;

  const r = await lembrar('sibh_sumario', createHash('sha256').update(url).digest('hex'), caminho === 'parameters' ? 86_400 : 300, () =>
    buscarJson(url, { timeoutMs: 30_000 }),
  );
  if (!r) return Response.json({ error: 'Falha ao contatar a API do SIBH.' }, { status: 502 });
  return Response.json(r.valor, { headers: { 'Cache-Control': 'private, no-store' } });
}

// ---------------------------------------------------------------------------
// Captura do diagrama (capturar_diagrama*.php + capture_diagrama*.js)
// ---------------------------------------------------------------------------

const arquivoCaptura = (chave: ChaveSumario) => absoluto(`sumarios/diagrama_${chave}.png`);

type Resultado = { success: true; path: string; geradoEm: string } | { success: false; error: string };

/**
 * Screenshot colorido do diagrama ao vivo do SIBH, para o PDF (o iframe ao
 * vivo imprime com as cores clareadas pelo @media print da página do SIBH).
 * Precisa do pacote "playwright" instalado no servidor (opcional: npm install
 * playwright); sem ele a página avisa e imprime com o diagrama ao vivo.
 */
export async function capturarDiagrama(chave: ChaveSumario, rota: string): Promise<Resultado> {
  type Pagina = { goto(u: string, o: object): Promise<unknown>; waitForLoadState(e: string, o: object): Promise<void>; waitForTimeout(ms: number): Promise<void>; screenshot(o: object): Promise<unknown> };
  type Navegador = { newPage(o: object): Promise<Pagina>; close(): Promise<void> };
  let chromium: { launch(o?: object): Promise<Navegador> };
  try {
    // carregado só em tempo de execução, da pasta do servidor: não entra no pacote do build
    ({ chromium } = createRequire(/*turbopackIgnore: true*/ `${process.cwd()}/`)('playwright'));
  } catch {
    return { success: false, error: 'captura indisponível neste servidor (pacote playwright não instalado)' };
  }
  const { url, altura } = SUMARIOS[chave].diagrama;
  const destino = arquivoCaptura(chave);
  let navegador: Navegador | undefined;
  try {
    await mkdir(/*turbopackIgnore: true*/ dirname(destino), { recursive: true });
    // Usa o Edge instalado no Windows; se não houver, o Chromium baixado pelo Playwright.
    navegador = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch());
    const pagina = await navegador.newPage({ viewport: { width: 1700, height: altura } });
    await pagina.goto(url, { waitUntil: 'load', timeout: 30_000 });
    // espera a rede ficar ociosa (todas as leituras já carregadas e coloridas) e dá uma margem
    // para a última leva de cores; segue mesmo se ainda houver alguma requisição pendente
    await pagina.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
    await pagina.waitForTimeout(6000);
    // recorta só a barra de menu do site (mantém a barra do diagrama e a legenda do rodapé)
    await pagina.screenshot({ path: destino, clip: { x: 0, y: 64, width: 1700, height: altura - 64 } });
    // a página acrescenta "?t=<hora>" a este endereço
    return { success: true, path: `${rota}?img=1`, geradoEm: new Date().toISOString() };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  } finally {
    await navegador?.close().catch(() => {});
  }
}

/** Última captura gravada, ou null. */
export async function lerCaptura(chave: ChaveSumario): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    return new Uint8Array(await readFile(/*turbopackIgnore: true*/ arquivoCaptura(chave)));
  } catch {
    return null;
  }
}
