import 'server-only';
import { createHash } from 'node:crypto';
import type { Acl } from '../auth/acl';
import { query } from '../db';
import { lembrar } from '../integracoes/cache';
import { buscarJson } from '../integracoes/http';

/**
 * Sumários Executivos de Cheias (porte de acesso/sumario_executivo_cheias do
 * PHP): o HTML original é servido sem alteração depois do login, e o
 * JavaScript dele chama, na mesma pasta, o proxy do SIBH. Os dois ficam na
 * área da Sala Alfredo Pisani; o do Ribeira também pode ser feito pela sala
 * Ribeira. O "Gerar PDF" imprime com o diagrama do SIBH ao vivo (sem captura).
 */
export const SUMARIOS = {
  ribeira_iguape: {
    titulo: 'Sumário Executivo — Vale do Ribeira de Iguape',
    salas: ['alfredo-pisani', 'ribeira'],
    // Tipo de boletim em que o PDF é cadastrado, por sala.
    tipos: { 'alfredo-pisani': 'sumario-ribeira', ribeira: 'sumario-cheias' } as Record<string, string>,
  },
  tiete_pinheiros: {
    titulo: 'Sumário Executivo — Alto Tietê / Pinheiros',
    salas: ['alfredo-pisani'],
    tipos: { 'alfredo-pisani': 'sumario-tiete-pinheiros' } as Record<string, string>,
  },
} as const;
export type ChaveSumario = keyof typeof SUMARIOS;

export const ehSumario = (chave: string): chave is ChaveSumario => Object.hasOwn(SUMARIOS, chave);

/** Endereço do HTML original do sumário (aberto dentro da página da área). */
export const arquivoSumario = (chave: ChaveSumario) => `/acesso/sumario_executivo_cheias/sumario_executivo_${chave}.html`;

type SalaSumario = { id: number; slug: string; nome: string; sigla: string | null };

/** Salas ativas do sumário em que o usuário tem criar_boletim (a preferida primeiro). */
export async function salasDoSumario(a: Acl, salas: readonly string[], preferida = ''): Promise<SalaSumario[]> {
  const linhas = await query<SalaSumario>(`SELECT id, slug, nome, sigla FROM salas WHERE slug = ANY($1::text[]) AND status = 'ativa' AND excluido_em IS NULL`, [[...salas]]);
  const ordem = (s: SalaSumario) => (s.slug === preferida ? -1 : salas.indexOf(s.slug));
  return linhas.filter((s) => a.pode('criar_boletim', s.id)).sort((x, y) => ordem(x) - ordem(y));
}

/** Tem criar_boletim em alguma das salas (ativas)? */
export async function podeSumario(a: Acl, salas: readonly string[]): Promise<boolean> {
  return (await salasDoSumario(a, salas)).length > 0;
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
