import { lembrar } from '../integracoes/cache';
import { buscarSibh, type Cotas } from '../integracoes/sibh-medicoes';

/**
 * Situação dos rios, córregos e piscinões (fluviômetros do SIBH) para as
 * demandas da Defesa Civil — por UGRHI, com o texto pronto para responder.
 * Porte de acesso/services/SituacaoRios.php.
 *
 * Três consultas "em massa" ao SIBH (lista de postos, cotas e medições da
 * última hora de todos os fluviômetros) e, só para os postos que passaram de
 * alguma cota, as leituras minuto a minuto das últimas 3 h (nível e hora da
 * última leitura e tendência). Tudo no cache das integrações — nada no banco.
 */

const SERVICO = 'defesa_civil';
export const CACHE_SEGUNDOS = 180;

/** Ordem de gravidade (maior primeiro) e rótulos. */
export const SITUACOES = {
  extravasamento: 'Extravasamento',
  emergencia: 'Emergência',
  alerta: 'Alerta',
  atencao: 'Atenção',
  normal: 'Normal',
} as const;
export type Situacao = keyof typeof SITUACOES;
const GRAVES = ['extravasamento', 'emergencia', 'alerta', 'atencao'] as const;
const ORDEM = Object.keys(SITUACOES) as Situacao[];

export const UGRHIS: Record<number, string> = {
  1: 'Mantiqueira', 2: 'Paraíba do Sul', 3: 'Litoral Norte', 4: 'Pardo',
  5: 'Piracicaba, Capivari e Jundiaí', 6: 'Alto Tietê', 7: 'Baixada Santista',
  8: 'Sapucaí-Mirim/Grande', 9: 'Mogi-Guaçu', 10: 'Sorocaba e Médio Tietê',
  11: 'Ribeira de Iguape e Litoral Sul', 12: 'Baixo Pardo/Grande', 13: 'Tietê-Jacaré',
  14: 'Alto Paranapanema', 15: 'Turvo/Grande', 16: 'Tietê-Batalha',
  17: 'Médio Paranapanema', 18: 'São José dos Dourados', 19: 'Baixo Tietê',
  20: 'Aguapeí', 21: 'Peixe', 22: 'Pontal do Paranapanema',
};

/** Variação em 1 h (m) a partir da qual o nível é considerado subindo/descendo. */
const LIMIAR_TENDENCIA = 0.01;

export type Tendencia = 'elevacao' | 'reducao' | 'estavel';
export type Posto = {
  id: string;
  prefixo: string;
  nome: string;
  cidade: string;
  ugrhi: number;
  piscinao: boolean;
  cotas: Cotas;
  nivel: number;
  /** Instante da última leitura (segundos, como no PHP), só para quem passou de alguma cota. */
  hora: number | null;
  tendencia: Tendencia | null;
  variacao_1h: number | null;
  situacao: Situacao;
  cota_ref: number | null;
  acima: number | null;
};
export type SituacaoGeral = { gerado_em: number; postos: Posto[]; falhas: string[] };

const arred = (v: number, casas = 3) => Math.round(v * 10 ** casas) / 10 ** casas;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
type Linha = Record<string, unknown>;

/** Do cache; se a fonte falhou, usa a última cópia boa e anota a falha. */
async function cacheOu<T>(chave: string, ttl: number, buscar: () => Promise<T | null>, falhas: string[], vazio: T): Promise<T> {
  const l = await lembrar(SERVICO, chave, ttl, buscar, { validadeMaxSeg: 30 * 86_400 });
  if (!l || l.desatualizado) falhas.push(chave);
  return l?.valor ?? vazio;
}

// ------------------------------------------------------------------ SIBH

type Estacao = { prefixo: string; nome: string; cidade: string; ugrhi: number };

async function estacoes(): Promise<Record<string, Estacao> | null> {
  const r = await buscarSibh('stations?station_type_id=1');
  if (!Array.isArray(r) || (r[0] as Linha | undefined)?.id === undefined) return null;
  return Object.fromEntries(
    (r as Linha[]).map((e) => [String(e.id), { prefixo: String(e.prefix), nome: String(e.name), cidade: String(e.city_name ?? ''), ugrhi: Number(e.ugrhi_cod ?? 0) || 0 }]),
  );
}

/** Cotas (m) de todos os postos que têm pelo menos uma. */
async function cotasTodas(): Promise<Record<string, Cotas> | null> {
  const r = await buscarSibh('parameters?parameterizable_type=StationPrefix&parameter_type_id=2');
  if (!Array.isArray(r) || (r.length > 0 && (r[0] as Linha).values === undefined)) return null;
  const saida: Record<string, Cotas> = {};
  for (const p of r as Linha[]) {
    const v = (p.values ?? {}) as Linha;
    const m = (k: string) => {
      const n = num(v[k]);
      return n === null ? null : arred(n / 100);
    };
    const c = { atencao: m('attention'), alerta: m('alert'), emergencia: m('emergency'), extravasamento: m('extravasation') };
    if (Object.values(c).some((x) => x !== null)) saida[String(p.parameterizable_id)] = c;
  }
  return saida;
}

/** Situação, cota ultrapassada (m) e quanto acima dela (m). */
export function classificar(nivel: number, c: Cotas): { situacao: Situacao; cota_ref: number | null; acima: number | null } {
  for (const k of GRAVES) {
    const cota = c[k];
    if (cota !== null && nivel >= cota) return { situacao: k, cota_ref: cota, acima: arred(nivel - cota) };
  }
  return { situacao: 'normal', cota_ref: null, acima: null };
}

async function montar(): Promise<SituacaoGeral> {
  const falhas: string[] = [];
  const [est, cotas] = await Promise.all([
    cacheOu('estacoes', 86_400, estacoes, falhas, {} as Record<string, Estacao>),
    cacheOu('cotas', 6 * 3600, cotasTodas, falhas, {} as Record<string, Cotas>),
  ]);
  const agora = (await buscarSibh('measurements/now?station_type_id=1&hours=1')) as { measurements?: Linha[] };
  if (!Array.isArray(agora.measurements)) throw new Error('medições da última hora');

  // Postos monitorados = com cota cadastrada e com medição na última hora.
  const postos = new Map<string, Posto>();
  const suspeitos: string[] = [];
  for (const m of agora.measurements) {
    const id = String(m.station_prefix_id);
    const c = cotas[id];
    const e = est[id];
    const valor = num(m.value);
    if (!c || !e || valor === null) continue;
    postos.set(id, {
      id, prefixo: e.prefixo, nome: e.nome, cidade: e.cidade, ugrhi: e.ugrhi,
      piscinao: /pisc|reservat[oó]rio|\bRD\b/iu.test(e.nome),
      cotas: c,
      nivel: arred(valor / 100), // média da última hora (cm → m)
      hora: null, tendencia: null, variacao_1h: null,
      situacao: 'normal', cota_ref: null, acima: null,
    });
    // passou (ou encostou) em alguma cota na última hora → busca a leitura exata
    const menor = Math.min(...Object.values(c).filter((v): v is number => v !== null));
    if ((num(m.max_value) ?? 0) / 100 >= menor) suspeitos.push(id);
  }

  if (suspeitos.length) {
    const z = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z';
    const fim = Date.now();
    const lotes: string[][] = [];
    for (let i = 0; i < suspeitos.length; i += 10) lotes.push(suspeitos.slice(i, i + 10));
    const leituras = new Map<string, [t: number, nivel: number][]>();
    await Promise.all(
      lotes.map(async (lote) => {
        try {
          const r = (await buscarSibh(
            `measurements?${lote.map((i) => `station_prefix_ids[]=${Number(i)}`).join('&')}&start_date=${z(fim - 3 * 3_600_000)}&end_date=${z(fim)}&group_type=minute`,
          )) as { measurements?: Linha[] };
          if (!Array.isArray(r.measurements)) throw new Error();
          for (const m of r.measurements) {
            const v = num(m.value);
            if (v === null) continue;
            const id = String(m.station_prefix_id);
            const t = Date.parse(`${String(m.date).replace(/\//g, '-').replace(' ', 'T')}:00Z`) / 1000;
            leituras.set(id, [...(leituras.get(id) ?? []), [t, v / 100]]);
          }
        } catch {
          falhas.push('leituras detalhadas');
        }
      }),
    );
    for (const [id, lista] of leituras) {
      const p = postos.get(id);
      if (!p) continue;
      lista.sort((a, b) => b[0] - a[0]); // mais recente primeiro
      const [t, nivel] = lista[0]!;
      p.nivel = arred(nivel);
      p.hora = t;
      const antes = lista.find(([t2]) => t - t2 >= 3000)?.[1]; // leitura mais próxima de 1 h antes
      if (antes !== undefined) {
        const d = nivel - antes;
        p.variacao_1h = arred(d);
        p.tendencia = d > LIMIAR_TENDENCIA ? 'elevacao' : d < -LIMIAR_TENDENCIA ? 'reducao' : 'estavel';
      }
    }
  }

  const lista = [...postos.values()].map((p) => ({ ...p, ...classificar(p.nivel, p.cotas) }));
  lista.sort((a, b) => ORDEM.indexOf(a.situacao) - ORDEM.indexOf(b.situacao) || (b.acima ?? -99) - (a.acima ?? -99));
  return { gerado_em: Math.floor(Date.now() / 1000), postos: lista, falhas: [...new Set(falhas)] };
}

/** Situação de todos os postos. `renovar`: vai ao SIBH se a cópia tiver mais de 1 minuto. */
export async function situacaoRios(renovar = false): Promise<SituacaoGeral> {
  const l = await lembrar(SERVICO, 'situacao', renovar ? 60 : CACHE_SEGUNDOS, montar, { esperaFalhaSeg: 30 });
  if (!l) return { gerado_em: Math.floor(Date.now() / 1000), postos: [], falhas: ['medições da última hora'] };
  return l.desatualizado ? { ...l.valor, falhas: [...new Set([...l.valor.falhas, 'medições da última hora'])] } : l.valor;
}

// ------------------------------------------------------------------ textos

/** 1234.5 → "1.234,500" (— quando vazio). */
export function m(v: number | null, casas: number): string {
  return v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Instante (s) → "07h05", horário de São Paulo. */
export function hora(t: number): string {
  return fmtHora.format(new Date(t * 1000)).replace(':', 'h');
}

/** "Piracaia (Cachoeira Montante)" → "Piracaia – Cachoeira Montante". */
export function nomeTexto(p: { nome: string }): string {
  const n = p.nome.replace(/\s+/g, ' ').trim();
  const r = /^(.*?)\s*\((.+)\)$/u.exec(n);
  return r ? `${r[1]} – ${r[2]}` : n;
}

function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

const EXTENSO: Record<number, string> = { 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez' };

function fraseTendencia(t: Tendencia | null, tambem: boolean): string {
  const tb = tambem ? 'também ' : '';
  if (t === 'elevacao') return `${tb}apresenta tendência de elevação`;
  if (t === 'reducao') return `${tb}apresenta tendência de redução`;
  if (t === 'estavel') return `${tb}permanece estável`;
  return 'não tem tendência definida (poucas leituras recentes)';
}

function porSituacao(postos: Posto[]): Record<Situacao, Posto[]> {
  const por = Object.fromEntries(ORDEM.map((k) => [k, [] as Posto[]])) as Record<Situacao, Posto[]>;
  for (const p of postos) por[p.situacao].push(p);
  return por;
}

/**
 * Texto para a Defesa Civil a partir dos postos de UMA UGRHI (mesmo formato das respostas enviadas).
 * `destaque`: como marcar a situação em que os pontos se encontram ("em emergência",
 * "condição normal"); sem ele, o texto sai sem marcação.
 */
export function texto(postos: Posto[], destaque: (t: string) => string = (t) => t): string {
  if (!postos.length) return 'Não há pontos monitorados com dados na última hora nesta UGRHI.';
  const por = porSituacao(postos);
  const normal = destaque('condição normal');
  if (por.normal.length === postos.length) {
    return postos.length === 1
      ? `O único ponto monitorado permanece em ${normal}.`
      : `Entre os ${postos.length} pontos monitorados, todos permanecem em ${normal}.`;
  }
  const partes: string[] = [];
  for (const k of GRAVES) {
    const n = por[k].length;
    if (n) partes.push(`${n} ${partes.length ? '' : n === 1 ? 'encontra-se ' : 'encontram-se '}${destaque(`em ${SITUACOES[k].toLocaleLowerCase('pt-BR')}`)}`);
  }
  const demais = por.normal.length === 0 ? '' : por.normal.length === 1 ? ` O outro ponto permanece em ${normal}.` : ` Os demais pontos permanecem em ${normal}.`;
  const par = [`Entre os pontos monitorados, ${juntar(partes)}.${demais}`];
  for (const k of GRAVES) {
    const lista = por[k];
    if (!lista.length) continue;
    const rot = SITUACOES[k].toLocaleLowerCase('pt-BR');
    const nomes = juntar(lista.map((p) => `${nomeTexto(p)} (${p.prefixo})`));
    const em = destaque(`em ${rot}`);
    par.push(lista.length === 1 ? `O ponto ${em} é ${nomes}.` : `Os ${EXTENSO[lista.length] ?? lista.length} pontos ${em} são ${nomes}.`);
    if (k === 'atencao') continue; // atenção: só a lista
    let anterior: Tendencia | null = null;
    for (const p of lista) {
      par.push(
        `Em ${nomeTexto(p)}, o nível ${fraseTendencia(p.tendencia, p.tendencia !== null && p.tendencia === anterior)}` +
          `, registrando ${m(p.nivel, 3)} m${p.hora ? ` às ${hora(p.hora)}` : ''}` +
          `, valor ${m(p.acima, 3)} m acima da cota de ${rot} de ${m(p.cota_ref, 2)} m.`,
      );
      anterior = p.tendencia;
    }
  }
  return par.join('\n\n');
}

/** Ícone de cada situação (mensagem de WhatsApp). */
export const EMOJIS: Record<Situacao, string> = { extravasamento: '🔴', emergencia: '🟣', alerta: '🟠', atencao: '🟡', normal: '🟢' };

const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Mesma informação do texto(), formatada para WhatsApp: ícones, *negrito* e
 * _itálico_, um bloco por situação e uma linha por ponto.
 */
export function textoWhatsapp(postos: Posto[], titulo: string, geradoEm: number, blocoChuva = ''): string {
  const por = porSituacao(postos);
  const setas: Record<Tendencia, string> = { elevacao: '⬆️ subindo', reducao: '⬇️ descendo', estavel: '➡️ estável' };
  const l = ['🌊 *SITUAÇÃO DOS RIOS E CÓRREGOS*', `📍 *${titulo}*`, `🗓️ ${fmtDia.format(new Date(geradoEm * 1000))}  🕒 ${hora(geradoEm)}`, ''];
  if (!postos.length) {
    l.push('ℹ️ Sem pontos monitorados com dados na última hora.');
  } else {
    l.push(`📊 *Resumo* (${postos.length} ${postos.length === 1 ? 'ponto monitorado' : 'pontos monitorados'})`);
    for (const k of ORDEM) {
      const n = por[k].length;
      if (n) l.push(`${EMOJIS[k]} ${n}${k === 'normal' ? ' em condição normal' : ` em ${SITUACOES[k].toLocaleLowerCase('pt-BR')}`}`);
    }
    for (const k of GRAVES) {
      if (!por[k].length) continue;
      l.push('', `${EMOJIS[k]} *${SITUACOES[k].toLocaleUpperCase('pt-BR')}*`);
      for (const p of por[k]) {
        l.push(
          `▪️ *${nomeTexto(p)}* (${p.prefixo})`,
          `     📏 ${m(p.nivel, 2)} m${p.hora ? ` às ${hora(p.hora)}` : ''}${p.tendencia ? `  ${setas[p.tendencia]}` : ''}`,
          `     ⚠️ ${m(p.acima, 2)} m acima da cota de ${SITUACOES[k].toLocaleLowerCase('pt-BR')} (${m(p.cota_ref, 2)} m)`,
        );
      }
    }
    l.push(
      '',
      por.normal.length === postos.length ? '✅ Todos os pontos em condição normal.' : por.normal.length === 0 ? '❗ Nenhum ponto em condição normal.' : '✅ Demais pontos em condição normal.',
    );
  }
  if (blocoChuva) l.push('', blocoChuva);
  l.push('', '_Fonte: SIBH — SP Águas · Sala de Situação Alfredo Pisani_');
  return l.join('\n');
}

// ------------------------------------------------------------------ mapa

/** Chuva acumulada mostrada no mapa: só postos acima deste valor (mm). */
export const LIMITE_CHUVA_MM = 10;
/** Períodos de chuva acumulada que o usuário pode escolher (horas → rótulo). */
export const HORAS_CHUVA: Record<number, string> = { 1: '1 hora', 3: '3 horas', 6: '6 horas', 12: '12 horas', 24: '24 horas', 48: '48 horas', 72: '72 horas' };

type EstacaoMapa = { p: string; n: string; c: string; u: number; lat: number; lng: number; tx: boolean };
export type PontoEstacao = { t: 'flu' | 'plu'; id: string; p: string; n: string; c: string; lat: number; lng: number };
export type PontoChuva = { id: string; p: string; n: string; c: string; lat: number; lng: number; v: number };

/** Estações de um tipo do SIBH (1 = fluviométrica, 2 = pluviométrica) com coordenadas. */
async function estacoesMapa(tipo: 1 | 2): Promise<Record<string, EstacaoMapa> | null> {
  const r = await buscarSibh(`stations?station_type_id=${tipo}`);
  if (!Array.isArray(r) || (r[0] as Linha | undefined)?.id === undefined) return null;
  const saida: Record<string, EstacaoMapa> = {};
  for (const e of r as Linha[]) {
    const lat = num(e.latitude);
    const lng = num(e.longitude);
    if (lat === null || lng === null) continue;
    saida[String(e.id)] = {
      p: String(e.prefix), n: String(e.name).trim(), c: String(e.city_name ?? ''), u: Number(e.ugrhi_cod ?? 0) || 0,
      lat: arred(lat, 5), lng: arred(lng, 5),
      tx: e.transmission_status === 'ok', // telemétrica transmitindo
    };
  }
  return saida;
}

/** Coordenadas dos postos fluviométricos do cadastro do SIBH (id do posto → lat/lng). */
export async function coordenadasPostos(): Promise<Record<string, { lat: number; lng: number }>> {
  const l = await lembrar(SERVICO, 'mapa_estacoes_flu', 86_400, () => estacoesMapa(1), { validadeMaxSeg: 30 * 86_400 });
  return l?.valor ?? {};
}

/**
 * Chuva acumulada (mm) nas últimas `horas` de todos os pluviômetros: posto → mm.
 * Com `ateMs`, a janela termina nesse instante (ex.: 07h) em vez de agora.
 */
async function chuvaAcumulada(horas: number, ateMs?: number): Promise<Record<string, number> | null> {
  const ate = ateMs === undefined ? '' : `&from_date=${new Date(ateMs).toISOString().slice(0, 19)}Z`;
  const r = (await buscarSibh(`measurements/now?station_type_id=2&hours=${horas}${ate}`)) as { measurements?: Linha[] };
  if (!Array.isArray(r.measurements)) return null;
  const saida: Record<string, number> = {};
  for (const x of r.measurements) {
    const v = num(x.value);
    if (v !== null) saida[String(x.station_prefix_id)] = arred(v, 1);
  }
  return saida;
}

/**
 * Pontos do mapa de uma UGRHI: estações telemétricas (transmissão em dia no
 * SIBH) e postos com chuva acumulada acima de LIMITE_CHUVA_MM nas últimas
 * `horas`. `chuva_todos`: todos os postos com leitura, do maior para o menor.
 */
export async function mapaUgrhi(ugrhi: number, horasPedidas: number) {
  const horas = HORAS_CHUVA[horasPedidas] ? horasPedidas : 24;
  const falhas: string[] = [];
  const [flu, plu, acum] = await Promise.all([
    cacheOu('mapa_estacoes_flu', 86_400, () => estacoesMapa(1), falhas, {} as Record<string, EstacaoMapa>),
    cacheOu('mapa_estacoes_plu', 86_400, () => estacoesMapa(2), falhas, {} as Record<string, EstacaoMapa>),
    cacheOu(`mapa_chuva_${horas}h`, CACHE_SEGUNDOS, () => chuvaAcumulada(horas), falhas, {} as Record<string, number>),
  ]);
  const estacoesUgrhi: PontoEstacao[] = [];
  for (const [t, lista] of [['flu', flu], ['plu', plu]] as const) {
    for (const [id, e] of Object.entries(lista)) {
      if (e.u === ugrhi && e.tx) estacoesUgrhi.push({ t, id, p: e.p, n: e.n, c: e.c, lat: e.lat, lng: e.lng });
    }
  }
  const todos: PontoChuva[] = []; // todos os pluviômetros da UGRHI com leitura no período (inclusive 0 mm)
  for (const [id, v] of Object.entries(acum)) {
    const e = plu[id];
    if (e && e.u === ugrhi) todos.push({ id, p: e.p, n: e.n, c: e.c, lat: e.lat, lng: e.lng, v });
  }
  todos.sort((a, b) => b.v - a.v);
  const rotulos: Record<string, string> = { mapa_estacoes_flu: 'estações fluviométricas', mapa_estacoes_plu: 'estações pluviométricas', [`mapa_chuva_${horas}h`]: 'chuva acumulada' };
  return {
    horas,
    estacoes: estacoesUgrhi,
    chuva: todos.filter((c) => c.v > LIMITE_CHUVA_MM),
    chuva_todos: todos,
    falhas: falhas.map((k) => rotulos[k] ?? k),
  };
}

export type PontoChuvaEstado = PontoChuva & { u: number };

/**
 * Todos os pluviômetros do estado com leitura nas últimas `horas` (inclusive
 * 0 mm), do maior para o menor, com a UGRHI de cada um. Com `ateMs`, a janela
 * termina nesse instante (boletins: 07h); janela já encerrada há mais de um dia
 * fica guardada por 1 dia.
 */
export async function chuvaEstado(horasPedidas: number, ateMs?: number) {
  const horas = HORAS_CHUVA[horasPedidas] ? horasPedidas : 24;
  const falhas: string[] = [];
  const chave = ateMs === undefined ? `mapa_chuva_${horas}h` : `chuva_${horas}h_ate_${Math.round(ateMs / 60_000)}`;
  const ttl = ateMs === undefined ? CACHE_SEGUNDOS : Date.now() - ateMs > 86_400_000 ? 86_400 : 15 * 60;
  const [plu, acum] = await Promise.all([
    cacheOu('mapa_estacoes_plu', 86_400, () => estacoesMapa(2), falhas, {} as Record<string, EstacaoMapa>),
    cacheOu(chave, ttl, () => chuvaAcumulada(horas, ateMs), falhas, {} as Record<string, number>),
  ]);
  const postos: PontoChuvaEstado[] = [];
  for (const [id, v] of Object.entries(acum)) {
    const e = plu[id];
    if (e) postos.push({ id, p: e.p, n: e.n, c: e.c, u: e.u, lat: e.lat, lng: e.lng, v });
  }
  postos.sort((a, b) => b.v - a.v);
  return { horas, postos, falhou: falhas.length > 0 };
}

export type ChuvaMunicipio = { cidade: string; ugrhi: number; v: number; posto: string; lat: number; lng: number };

/**
 * Municípios com os maiores acumulados de chuva nas últimas `horas` — do estado
 * todo ou só dos pluviômetros de uma UGRHI.
 * O valor do município é o do posto que mais registrou chuva nele (`posto`).
 */
export async function chuvaPorMunicipio(horasPedidas: number, ugrhi: number | null = null, max = 15) {
  const horas = HORAS_CHUVA[horasPedidas] ? horasPedidas : 24;
  const falhas: string[] = [];
  const [plu, acum] = await Promise.all([
    cacheOu('mapa_estacoes_plu', 86_400, () => estacoesMapa(2), falhas, {} as Record<string, EstacaoMapa>),
    cacheOu(`mapa_chuva_${horas}h`, CACHE_SEGUNDOS, () => chuvaAcumulada(horas), falhas, {} as Record<string, number>),
  ]);
  const porCidade = new Map<string, ChuvaMunicipio>();
  for (const [id, v] of Object.entries(acum)) {
    const e = plu[id];
    if (!e || e.c === '' || (ugrhi !== null && e.u !== ugrhi)) continue;
    const atual = porCidade.get(e.c);
    if (!atual || v > atual.v) porCidade.set(e.c, { cidade: e.c, ugrhi: e.u, v, posto: `${e.p} ${e.n}`, lat: e.lat, lng: e.lng });
  }
  const municipios = [...porCidade.values()].filter((c) => c.v > 0).sort((a, b) => b.v - a.v || a.cidade.localeCompare(b.cidade, 'pt-BR'));
  return { horas, municipios: municipios.slice(0, max), falhou: falhas.length > 0 };
}

/** Bloco da mensagem de WhatsApp com os postos de chuva do mapa (os `max` maiores). */
export function textoChuvaWhatsapp(chuva: PontoChuva[], horas: number, max = 10): string {
  const periodo = HORAS_CHUVA[horas] ?? `${horas} horas`;
  const limite = m(LIMITE_CHUVA_MM, 0);
  if (!chuva.length) return `🌧️ Nenhum posto com chuva acima de ${limite} mm nas últimas ${periodo}.`;
  const l = [
    `🌧️ *CHUVA NAS ÚLTIMAS ${periodo.toLocaleUpperCase('pt-BR')}*`,
    `_Acima de ${limite} mm: ${chuva.length} ${chuva.length === 1 ? 'posto' : 'postos'} (ver mapa)_`,
  ];
  for (const c of chuva.slice(0, max)) {
    const nome = nomeTexto({ nome: c.n });
    // o município só entra quando o nome do posto ainda não começa com ele
    const comCidade = c.c !== '' && !nome.toLocaleLowerCase('pt-BR').startsWith(c.c.toLocaleLowerCase('pt-BR')) ? `${c.c} – ` : '';
    l.push(`▪️ *${m(c.v, 1)} mm* — ${comCidade}${nome}`);
  }
  if (chuva.length > max) l.push(`_e mais ${chuva.length - max} ${chuva.length - max === 1 ? 'posto' : 'postos'}._`);
  return l.join('\n');
}
