import { BACIA_ONS, DIAGRAMA_PARAIBA, LOCAIS_ONS, LOCAIS_SSD_PARAIBA, TRANSFERENCIAS_ONS } from '@/conteudo/diagrama-paraiba';
import { ehPluviometro, ehPostoAna, ehPostoSibh, VD } from '@/conteudo/diagramas-unifilares';
import type { Acl } from '../auth/acl';
import { RESOLUCAO_1382, VOLUME_UTIL_HM3 } from '../boletins-sala/paraiba';
import { query } from '../db';
import { resumoEstacao } from '../integracoes/ana-telemetria';
import { hojeSp, somarDias } from '../integracoes/comum';
import { arred } from '../integracoes/http';
import { periodoBacia, ultimoDia, type AnoOns } from '../integracoes/ons';
import { chuvaAcumuladaPostos } from '../integracoes/sibh-medicoes';
import { inicioDiaSp, leiturasPostos } from './cantareira-operacao';
import { chuvaRadarDia, PERMISSAO_PAINEL, SALA_PAINEL, valoresDiagrama } from './painel-interativo';

/**
 * Painel de Segurança Hídrica — página Paraíba do Sul: valores do diagrama
 * unifilar da bacia (conteudo/diagrama-paraiba.ts) e quem pode ver.
 *
 * Valores no formato dos outros diagramas (chave → { valor, data, hora? }):
 *   - reservatórios e usinas do ONS: <local>:<variável> (10 volume %, 11 hm³,
 *     12 nível, 4 afluente, 13 defluente) e <local>:10:dia (variação do volume no dia, p.p.);
 *   - transferências do ONS e do SSD: <local>:3;
 *   - postos do SIBH: sibh-nivel:<id>, sibh-vazao:<id> (os mesmos dos outros diagramas);
 *   - estações da ANA: ana-vazao:<código>, ana-nivel:<código>, chuva24/chuva72/chuvames:ana:<código>;
 *   - pluviômetros do SIBH: chuva24/chuva72/chuvames:sibh:<id>.
 */

/** A Sala Vale do Paraíba vê só esta página do painel; quem vê o painel inteiro (Alfredo Pisani) também a vê. */
export const SALA_VALE_PARAIBA = 'vale-paraiba';

export type AcessoParaiba = 'completo' | 'paraiba' | null;

/** 'completo' (todo o painel), 'paraiba' (só a página Paraíba do Sul) ou null (sem acesso). */
export async function acessoParaiba(a: Acl): Promise<AcessoParaiba> {
  const salas = await query<{ id: number; slug: string }>(`SELECT id, slug FROM salas WHERE slug = ANY($1::text[]) AND status = 'ativa' AND excluido_em IS NULL`, [[SALA_PAINEL, SALA_VALE_PARAIBA]]);
  const pode = (slug: string) => salas.some((s) => s.slug === slug && a.pode(PERMISSAO_PAINEL, s.id));
  return pode(SALA_PAINEL) ? 'completo' : pode(SALA_VALE_PARAIBA) ? 'paraiba' : null;
}

export type ValorDiagrama = { valor: number; data: string; hora?: string } | null;
export type Valores = Record<string, ValorDiagrama>;

/**
 * Valores do ONS (o dia mais recente até a data, recuando até 7 dias) para os
 * reservatórios, usinas e transferências do diagrama. Sem fazer consulta: serve
 * para testes.
 */
export function valoresOns(dados: AnoOns, data: string): Valores {
  const saida: Valores = {};
  const doDia = (id: string) => {
    const dias = dados[id];
    const dia = ultimoDia(dias, data);
    return dia ? { dia, v: dias![dia]!, antes: dias![somarDias(dia, -1)] ?? null } : null;
  };
  const guardar = (chave: string, valor: number | null | undefined, dia: string) => {
    saida[chave] = valor == null ? null : { valor, data: dia };
  };
  for (const l of LOCAIS_ONS) {
    const r = doDia(l.ons);
    const k = (v: number) => `${l.space}:${v}`;
    if (!r) {
      for (const v of [VD.volumePct, VD.volumeHm3, VD.nivel, VD.afluente, VD.defluente]) saida[k(v)] = null;
      continue;
    }
    guardar(k(VD.nivel), r.v.nivel, r.dia);
    guardar(k(VD.afluente), r.v.afluente, r.dia);
    guardar(k(VD.defluente), r.v.defluente, r.dia);
    // usina a fio d'água: o ONS manda um "volume útil" sem sentido (pode passar de 100%)
    if (l.tipo === 'fio') continue;
    const pct = r.v.volumePct;
    guardar(k(VD.volumePct), pct, r.dia);
    guardar(k(VD.volumeHm3), pct !== null && l.capacidade ? arred((pct * l.capacidade) / 100, 2) : null, r.dia);
    // variação no dia: só nas represas (nas elevatórias, de volume mínimo, ela não diz nada)
    if (l.tipo !== 'reservatorio') continue;
    const ant = r.antes?.volumePct ?? null;
    guardar(`${k(VD.volumePct)}:dia`, pct !== null && ant !== null ? arred(pct - ant, 2) : null, r.dia);
  }
  for (const t of TRANSFERENCIAS_ONS) {
    const r = doDia(t.de);
    saida[`${t.space}:${VD.vazao}`] = r && r.v.transferida !== null ? { valor: r.v.transferida, data: r.dia } : null;
  }
  return saida;
}

/** Reservatórios com volume útil no ONS (sem as usinas a fio d'água), na ordem do diagrama. */
export const LOCAIS_VOLUME = LOCAIS_ONS.filter((l) => l.tipo !== 'fio');

/** Anos anteriores no gráfico do ano atual × anos anteriores. */
export const ANOS_ANTERIORES = 4;

// Reservatório equivalente (Resolução 1.382): os quatro de regularização, com os pesos do Boletim Vale do Paraíba (nomes do SAR).
const EQUIVALENTE: Record<string, string> = { PBPARA: 'PARAIBUNA', PBSTAB: 'SANTA BRANCA', PBJAGU: 'JAGUARI', PBFUNI: 'FUNIL' };

/** Séries dos gráficos de volume: um valor por dia de `de` a `ate`. */
export type VolumesParaiba = {
  de: string;
  /** último dia com algum volume (até a data pedida; o ONS publica com um dia de atraso) */
  ate: string;
  reservatorios: { ons: string; nome: string; equivalente: boolean }[];
  /** volume útil (%) de cada dia, por reservatório (id do ONS); null = sem dado */
  volumes: Record<string, (number | null)[]>;
  /** reservatório equivalente (%): média do volume útil dos quatro ponderada pela capacidade, só nos dias com os quatro */
  equivalente: (number | null)[];
  /** Resolução 1.382, art. 1º, III e IV, c: acima deste volume do equivalente, admite-se aumentar as vazões */
  limiteEquivalente: number;
};

/** Séries diárias de volume útil a partir dos dados do ONS (sem fazer consulta: serve para testes). */
export function seriesVolumes(dados: AnoOns, de: string, ate: string): VolumesParaiba {
  let fim = ate;
  while (fim > de && !LOCAIS_VOLUME.some((l) => dados[l.ons]?.[fim]?.volumePct != null)) fim = somarDias(fim, -1);
  const dias: string[] = [];
  for (let d = de; d <= fim; d = somarDias(d, 1)) dias.push(d);
  const pct = (ons: string, d: string) => {
    const x = dados[ons]?.[d]?.volumePct;
    return x == null ? null : arred(x, 2);
  };
  const volumes = Object.fromEntries(LOCAIS_VOLUME.map((l) => [l.ons, dias.map((d) => pct(l.ons, d))]));
  const pesos = Object.entries(EQUIVALENTE).map(([ons, sar]) => [volumes[ons]!, VOLUME_UTIL_HM3[sar]!] as const);
  const total = pesos.reduce((t, [, p]) => t + p, 0);
  const equivalente = dias.map((_, i) => (pesos.every(([v]) => v[i] != null) ? arred(pesos.reduce((t, [v, p]) => t + v[i]! * p, 0) / total, 2) : null));
  return {
    de,
    ate: fim,
    reservatorios: LOCAIS_VOLUME.map((l) => ({ ons: l.ons, nome: l.nome, equivalente: l.ons in EQUIVALENTE })),
    volumes,
    equivalente,
    limiteEquivalente: RESOLUCAO_1382.equivalenteLimite,
  };
}

/** Volume útil diário de 1º/01 de ANOS_ANTERIORES anos atrás até a data (CSVs anuais do ONS, no cache). */
export async function volumesParaiba(data: string): Promise<(VolumesParaiba & { desatualizado: boolean }) | null> {
  const de = `${Number(data.slice(0, 4)) - ANOS_ANTERIORES}-01-01`;
  const p = await periodoBacia(BACIA_ONS, de, data);
  return p ? { ...seriesVolumes(p.valor, de, data), desatualizado: p.desatualizado } : null;
}

/** Primeira parte (rápida): ONS e a transposição do SSD na data. */
export async function valoresPrincipais(data: string): Promise<Valores> {
  const [ons, ssd] = await Promise.all([
    periodoBacia(BACIA_ONS, somarDias(data, -8), data).catch(() => null),
    valoresDiagrama(
      LOCAIS_SSD_PARAIBA.map((s) => [s, VD.vazao]),
      data,
    ).catch(() => ({})),
  ]);
  return { ...(ons ? valoresOns(ons.valor, data) : {}), ...ssd };
}

const POSTOS_SIBH = new Set(DIAGRAMA_PARAIBA.nos.filter(ehPostoSibh).map((n) => n.sibh.id));
const ESTACOES_ANA = new Set(DIAGRAMA_PARAIBA.nos.filter(ehPostoAna).map((n) => n.ana.codigo));
const PLUVIOMETROS = new Set(DIAGRAMA_PARAIBA.nos.filter(ehPluviometro).map((n) => n.pluvio));

/** Só os postos que estão no diagrama (os únicos que a API consulta). */
export const filtrarPostos = (sibh: number[], ana: string[], pluvio: number[]) => ({
  sibh: [...new Set(sibh)].filter((id) => POSTOS_SIBH.has(id)),
  ana: [...new Set(ana)].filter((c) => ESTACOES_ANA.has(c)),
  pluvio: [...new Set(pluvio)].filter((id) => PLUVIOMETROS.has(id)),
});

const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

/**
 * Chuva dos pluviômetros do SIBH: 24 h e 72 h (até agora, ou até o fim do dia
 * escolhido) e no mês (dias fechados guardados pela Climatologia + hoje até a
 * última leitura).
 */
async function chuvaPluviometros(ids: number[], data: string): Promise<Valores> {
  if (!ids.length) return {};
  const hoje = hojeSp();
  const ehHoje = data === hoje;
  const fimDia = ehHoje ? undefined : inicioDiaSp(somarDias(data, 1));
  const mes = `${data.slice(0, 8)}01`;
  const [c24, c72, fechados, hojeAteAgora] = await Promise.all([
    chuvaAcumuladaPostos(24, fimDia).catch(() => null),
    chuvaAcumuladaPostos(72, fimDia).catch(() => null),
    // dias do mês já fechados (o dia escolhido entra pela consulta do dia, logo abaixo)
    data > mes
      ? query<{ posto_id: number; mm: string }>(
          'SELECT posto_id, SUM(chuva)::text AS mm FROM clima_telemetria_dia WHERE posto_id = ANY($1::int[]) AND dia >= $2::date AND dia < $3::date GROUP BY posto_id',
          [ids, mes, data],
        ).catch(() => null)
      : Promise.resolve([]),
    chuvaRadarDia(ids, data).catch(() => ({}) as Record<string, ValorDiagrama>),
  ]);
  const saida: Valores = {};
  const hora = (l: { obtidoEm: Date } | null) => (ehHoje && l ? fmtHora.format(l.obtidoEm) : undefined);
  for (const id of ids) {
    const v24 = c24?.valor[String(id)]?.mm;
    const v72 = c72?.valor[String(id)]?.mm;
    saida[`chuva24:sibh:${id}`] = v24 == null ? null : { valor: arred(Math.max(0, v24), 1), data, hora: hora(c24) };
    saida[`chuva72:sibh:${id}`] = v72 == null ? null : { valor: arred(Math.max(0, v72), 1), data, hora: hora(c72) };
    const dia = (hojeAteAgora as Record<string, ValorDiagrama>)[`radar:${id}`] ?? null;
    const antes = fechados === null ? null : Number(fechados.find((f) => f.posto_id === id)?.mm ?? 0);
    saida[`chuvames:sibh:${id}`] = antes === null && !dia ? null : { valor: arred((antes ?? 0) + (dia?.valor ?? 0), 1), data, hora: dia?.hora };
  }
  return saida;
}

/** Segunda parte (mais lenta): postos do SIBH, estações da ANA e pluviômetros. Uma fonte fora não derruba as outras. */
export async function valoresPostos(data: string, p: { sibh: number[]; ana: string[]; pluvio: number[] }): Promise<Valores> {
  const [sibh, ana, chuva] = await Promise.all([
    leiturasPostos(p.sibh, data).catch(() => ({})),
    Promise.all(p.ana.map(async (c) => [c, await resumoEstacao(c, data).catch(() => null)] as const)),
    chuvaPluviometros(p.pluvio, data).catch(() => ({})),
  ]);
  const saida: Valores = { ...sibh, ...chuva };
  for (const [c, r] of ana) {
    saida[`ana-vazao:${c}`] = r?.vazao ?? null;
    saida[`ana-nivel:${c}`] = r?.nivel ?? null;
    saida[`chuva24:ana:${c}`] = r?.chuva24 ?? null;
    saida[`chuva72:ana:${c}`] = r?.chuva72 ?? null;
    saida[`chuvames:ana:${c}`] = r?.chuvaMes ?? null;
  }
  return saida;
}
