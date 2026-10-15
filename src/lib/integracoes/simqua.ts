import { lembrar, TTL } from './cache';
import { comoDado, hojeSp, type Dado } from './comum';
import { buscarJson } from './http';

/**
 * Qualidade da água — CETESB/SIMQUA (estações automáticas).
 *
 *   GET https://simqua.cetesb.sp.gov.br/dados/?e={estação}&p=&ini=dd/mm/aaaaT00:00&fim=dd/mm/aaaaT23:59&tipo=dia&hora=all&classif=1
 *
 * É a mesma consulta da tela pública "Gráficos e tabelas": médias diárias de
 * todos os parâmetros da estação. Só entram as leituras que a CETESB marca
 * como válidas (serie_validos).
 */

const BASE = 'https://simqua.cetesb.sp.gov.br/dados/';
export const FONTE = 'CETESB — SIMQUA';

export const PARAMETROS = ['ph', 'od', 'condutividade', 'turbidez', 'temperatura'] as const;
export type Parametro = (typeof PARAMETROS)[number];
// Nome do parâmetro na resposta do SIMQUA.
const CHAVE: Record<Parametro, string> = { ph: 'ph', od: 'oxigenio', condutividade: 'condutividade', turbidez: 'turbidez', temperatura: 'temperatura' };

/** Médias diárias de um parâmetro: [AAAA-MM-DD, valor], em ordem. */
export type SerieDiaria = [data: string, valor: number][];
export type MediasDiarias = Record<Parametro, SerieDiaria>;

/** Converte a resposta do SIMQUA; só ficam os dias do mês pedido. */
export function normalizar(json: unknown, ano: number, mes: number): MediasDiarias {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('formato inesperado do SIMQUA');
  const prefixo = `${ano}-${String(mes).padStart(2, '0')}`;
  const saida = {} as MediasDiarias;
  for (const p of PARAMETROS) {
    const validos = (json as Record<string, { serie_validos?: unknown }>)[CHAVE[p]]?.serie_validos;
    const porDia = new Map<string, number>();
    for (const ponto of Array.isArray(validos) ? validos : []) {
      if (!Array.isArray(ponto) || typeof ponto[0] !== 'number' || typeof ponto[1] !== 'number' || !Number.isFinite(ponto[1])) continue;
      const data = new Date(ponto[0]).toISOString().slice(0, 10); // o SIMQUA marca o dia à meia-noite UTC
      if (data.startsWith(prefixo)) porDia.set(data, ponto[1]);
    }
    saida[p] = [...porDia].sort(([a], [b]) => (a < b ? -1 : 1));
  }
  return saida;
}

/** Médias diárias do mês em uma estação (id do SIMQUA). Mês fechado fica guardado por 12 h; o corrente, 1 h. */
export async function mediasDiarias(estacao: number, ano: number, mes: number): Promise<Dado<MediasDiarias>> {
  if (!Number.isInteger(estacao) || estacao <= 0) throw new Error('Estação do SIMQUA inválida.');
  const mm = String(mes).padStart(2, '0');
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const url = `${BASE}?e=${estacao}&p=&ini=${encodeURIComponent(`01/${mm}/${ano}T00:00`)}&fim=${encodeURIComponent(`${ultimo}/${mm}/${ano}T23:59`)}&tipo=dia&hora=all&classif=1`;
  const fechado = `${ano}-${mm}` < hojeSp().slice(0, 7);
  const l = await lembrar('simqua', `dia:${estacao}:${ano}-${mm}`, fechado ? 12 * 3600 : TTL.hora, async () =>
    normalizar(
      await buscarJson(url, {
        timeoutMs: 40_000,
        // a consulta só responde em JSON quando vem como a tela pública a faz
        headers: { Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest', Referer: 'https://simqua.cetesb.sp.gov.br/graficos_tabelas/' },
      }),
      ano,
      mes,
    ),
  );
  return comoDado(FONTE, l);
}
