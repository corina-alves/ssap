'use server';

import { localizarMunicipio } from '@/lib/hidrologia/previsao';
import { previsaoMunicipio } from '@/lib/integracoes/openmeteo';

export type PrevisaoHero = { ok: true; nome: string; chuva: string; tmax: string; tmin: string } | { ok: false; mensagem: string };

const fmt = (v: number | null | undefined, suf: string) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suf}`;

/**
 * Previsão de hoje para o cartão da página inicial. Só leitura: o nome é aceito
 * apenas se estiver na lista oficial de municípios (localizarMunicipio).
 */
export async function previsaoHero(municipio: string): Promise<PrevisaoHero> {
  const local = await localizarMunicipio(String(municipio).slice(0, 80));
  if (!local.ok) return { ok: false, mensagem: local.mensagem };
  const r = await previsaoMunicipio(local.local.lat, local.local.lon);
  if (!r.ok) return { ok: false, mensagem: 'Não foi possível carregar a previsão deste município.' };
  const hoje = r.dados.dias[0];
  return { ok: true, nome: local.local.nome, chuva: fmt(hoje?.chuvaMm, ' mm'), tmax: fmt(hoje?.tmax, '°C'), tmin: fmt(hoje?.tmin, '°C') };
}
