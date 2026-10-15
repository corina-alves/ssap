import { normalizar } from '../integracoes/comum';
import { municipiosSP } from '../integracoes/ibge';
import { geocodificar } from '../integracoes/openmeteo';

export type Local = { nome: string; lat: number; lon: number };

/** Coordenadas fixas da capital (a geocodificação às vezes devolve outro ponto). */
const CAPITAL: Local = { nome: 'São Paulo', lat: -23.5505, lon: -46.6333 };

/**
 * Município paulista pelo nome digitado. Só aceita nomes da lista oficial do
 * IBGE (sem diferenciar acento/maiúscula); as coordenadas vêm da geocodificação.
 */
export async function localizarMunicipio(nome: string): Promise<{ ok: true; local: Local } | { ok: false; mensagem: string }> {
  const alvo = normalizar(nome);
  if (!alvo) return { ok: true, local: CAPITAL };
  const lista = await municipiosSP();
  if (!lista.ok) return { ok: false, mensagem: 'Lista de municípios indisponível no momento (IBGE).' };
  const m = lista.dados.find((x) => normalizar(x.nome) === alvo);
  if (!m) return { ok: false, mensagem: `"${nome}" não é um município do Estado de São Paulo. Escolha um nome da lista.` };
  if (normalizar(m.nome) === normalizar(CAPITAL.nome)) return { ok: true, local: CAPITAL };

  const g = await geocodificar(m.nome);
  if (!g.ok) return { ok: false, mensagem: 'Serviço de localização indisponível no momento.' };
  const achado = g.dados.find((l) => normalizar(l.nome) === alvo) ?? g.dados[0];
  if (!achado) return { ok: false, mensagem: `Não foi possível localizar ${m.nome}.` };
  return { ok: true, local: { nome: m.nome, lat: achado.lat, lon: achado.lon } };
}

/** Classes de chuva (mm) da escala sequencial: [limite inferior, rótulo]. */
export const CLASSES_CHUVA: [number, string][] = [
  [0, '< 1'],
  [1, '1–5'],
  [5, '5–10'],
  [10, '10–20'],
  [20, '20–40'],
  [40, '40–60'],
  [60, '≥ 60'],
];

export function classeChuva(mm: number | null): number {
  if (mm === null) return -1;
  let c = 0;
  CLASSES_CHUVA.forEach(([lim], i) => {
    if (mm >= lim) c = i;
  });
  return c;
}
