import { dataSar } from './ana';
import { lembrar } from './cache';
import { hojeSp, somarDias } from './comum';

/**
 * Disponibilidade das fontes externas: online (respondeu 2xx/3xx em até 3 s),
 * instável (respondeu, mas lenta ou com 4xx) ou fora do ar (erro, timeout, 5xx).
 * Resultado guardado por 3 minutos para não sobrecarregar as fontes.
 */

export type Situacao = 'online' | 'instavel' | 'offline';
export type StatusFonte = { id: string; nome: string; situacao: Situacao; ms: number; http: number | null; detalhe: string | null };

function alvos(): { id: string; nome: string; url: string }[] {
  const ontem = somarDias(hojeSp(), -1);
  return [
    { id: 'sabesp', nome: 'SABESP — Mananciais', url: `https://mananciais.sabesp.com.br/api/v4/sistemas/dados/resumo-diario/${ontem}` },
    {
      id: 'ana',
      nome: 'ANA — SAR',
      url: `https://www.ana.gov.br/sar/restportal/api/retornaMedicoes?data=${encodeURIComponent(dataSar(ontem))}&siglaUf=&tipoSistema=3`,
    },
    { id: 'ssd', nome: 'SP Águas — SSD', url: `https://sssp.spaguas.sp.gov.br/ssdsp/api-private/TimeSeries/331/Data/${ontem}/${ontem}` },
    {
      id: 'sibh',
      nome: 'SIBH — Pluviometria',
      url: 'https://apps.spaguas.sp.gov.br/sibh/api/v2/measurements/now?station_type_id=2&hours=1&show_all=false&serializer=complete&public=true',
    },
    {
      id: 'openmeteo',
      nome: 'Open-Meteo — Previsão',
      url: 'https://api.open-meteo.com/v1/forecast?latitude=-23.5&longitude=-46.6&daily=precipitation_sum&forecast_days=1&timezone=America%2FSao_Paulo',
    },
    { id: 'ibge', nome: 'IBGE — Localidades', url: 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/35' },
  ];
}

async function testar(url: string): Promise<Omit<StatusFonte, 'id' | 'nome'>> {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    await r.body?.cancel();
    const ms = Math.round(performance.now() - t0);
    if (r.status >= 500) return { situacao: 'offline', ms, http: r.status, detalhe: `HTTP ${r.status}` };
    if (r.status >= 400 || ms > 3000) return { situacao: 'instavel', ms, http: r.status, detalhe: r.status >= 400 ? `HTTP ${r.status}` : 'resposta lenta' };
    return { situacao: 'online', ms, http: r.status, detalhe: null };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    const timeout = (e as Error).name === 'TimeoutError';
    return { situacao: 'offline', ms, http: null, detalhe: timeout ? 'tempo esgotado' : 'falha de conexão' };
  }
}

/** Situação de todas as fontes (testadas em paralelo). */
export async function verificarFontes(forcar = false): Promise<{ fontes: StatusFonte[]; verificadoEm: Date }> {
  const verificar = async () => Promise.all(alvos().map(async (a) => ({ id: a.id, nome: a.nome, ...(await testar(a.url)) })));
  if (forcar) return { fontes: await verificar(), verificadoEm: new Date() };
  const l = await lembrar('status', 'fontes', 180, verificar);
  return { fontes: l?.valor ?? [], verificadoEm: l?.obtidoEm ?? new Date() };
}
