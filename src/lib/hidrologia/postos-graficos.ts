import { lembrar } from '../integracoes/cache';
import { arred } from '../integracoes/http';
import { buscarSibh, instante, medicoes } from '../integracoes/sibh-medicoes';

/**
 * Defesa Civil — gráficos de acompanhamento de qualquer posto fluviométrico do
 * SIBH: nível (e vazão, quando o posto mede) hora a hora num período, a última
 * leitura comparada com a média de um dia de referência e a análise em texto.
 */

const SERVICO = 'postos_graficos';
/** Período máximo de um gráfico (o SIBH fica lento com períodos longos). */
export const MAX_DIAS = 31;
/** Até quanto a variação ainda é "estável": nível em m, vazão em fração da média. */
const ESTAVEL_NIVEL_M = 0.02;
const ESTAVEL_VAZAO = 0.02;

export type PostoSibh = { id: number; prefixo: string; nome: string; cidade: string; ugrhi: number; transmitindo: boolean };

/** Postos fluviométricos do SIBH (cadastro guardado por 1 dia). */
export async function postosFluviometricos(): Promise<PostoSibh[]> {
  const l = await lembrar(
    SERVICO,
    'estacoes_flu',
    86_400,
    async () => {
      const r = await buscarSibh('stations?station_type_id=1');
      if (!Array.isArray(r) || (r[0] as { id?: unknown } | undefined)?.id === undefined) return null;
      return (r as Record<string, unknown>[])
        .map((e) => ({
          id: Number(e.id),
          prefixo: String(e.prefix ?? '').trim(),
          nome: String(e.name ?? '').trim(),
          cidade: String(e.city_name ?? '').trim(),
          ugrhi: Number(e.ugrhi_cod ?? 0) || 0,
          transmitindo: e.transmission_status === 'ok',
        }))
        .filter((p) => Number.isInteger(p.id) && p.id > 0)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },
    { validadeMaxSeg: 30 * 86_400 },
  );
  return l?.valor ?? [];
}

/** Uma leitura horária: instante (ms), dia e hora em São Paulo, nível (m) e vazão (m³/s). */
export type Ponto = { t: number; dia: string; hora: string; nivel: number | null; vazao: number | null };

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Início (ms) do dia AAAA-MM-DD em São Paulo (UTC−3, sem horário de verão desde 2019). */
export const inicioDia = (ymd: string) => Date.parse(`${ymd}T03:00:00Z`);

/**
 * Leituras horárias do posto entre `de` e `ate` (dias AAAA-MM-DD, inclusive),
 * em ordem de tempo. null se o SIBH falhou e não há cópia guardada.
 */
export async function seriePosto(id: number, de: string, ate: string, agora = Date.now()): Promise<Ponto[] | null> {
  const ini = inicioDia(de);
  const fim = Math.min(inicioDia(ate) + 86_400_000, agora);
  const fechado = fim < agora - 3_600_000; // período todo no passado: não muda mais
  const chave = `serie:${id}:${de}:${ate}`;
  const r = (await medicoes(SERVICO, { [chave]: { ids: [id], ini, fim, grupo: 'hour', ttlSeg: fechado ? 30 * 86_400 : 600 } }))[chave];
  if (!r) return null;
  return r
    .map(([, d, v, q]) => {
      const t = instante(d);
      return { t, dia: fmtDia.format(t), hora: fmtHora.format(t), nivel: v === null ? null : arred(v / 100, 2), vazao: q === null ? null : arred(q, 2) };
    })
    .filter((p) => Number.isFinite(p.t) && (p.nivel !== null || p.vazao !== null))
    .sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ análise

const n2 = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
/** 7,77 m */
export const fmtNivel = (v: number) => `${n2(v)} m`;
/** 1.190 m³/s (com decimais só em vazões pequenas) */
export const fmtVazao = (v: number) => `${n2(v, Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2)} m³/s`;
/** 17/10 */
export const diaMes = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

type Grandeza = 'nivel' | 'vazao';
export type Comparacao = { valor: number; media: number; dif: number; tendencia: 'subindo' | 'descendo' | 'estavel' };

const valores = (pts: Ponto[], g: Grandeza) => pts.flatMap((p) => (p[g] === null ? [] : [{ p, v: p[g]! }]));
const estavel = (g: Grandeza, dif: number, media: number) => Math.abs(dif) <= (g === 'nivel' ? ESTAVEL_NIVEL_M : Math.abs(media) * ESTAVEL_VAZAO);

/** Última leitura da grandeza comparada com a média do dia de referência. */
export function comparar(pts: Ponto[], g: Grandeza, diaRef: string): Comparacao | null {
  const todas = valores(pts, g);
  const ultima = todas.at(-1);
  const doDia = valores(pts.filter((p) => p.dia === diaRef), g);
  if (!ultima || !doDia.length) return null;
  const media = doDia.reduce((s, x) => s + x.v, 0) / doDia.length;
  const dif = ultima.v - media;
  return { valor: ultima.v, media, dif, tendencia: estavel(g, dif, media) ? 'estavel' : dif > 0 ? 'subindo' : 'descendo' };
}

/** "−1 cm" / "+3 cm" (nível) ou "−4 m³/s" (vazão) */
export function fmtDif(g: Grandeza, dif: number, base = dif): string {
  // O sinal vem depois do arredondamento: diferença que arredonda para zero sai "0 cm", sem "−".
  if (g === 'nivel') {
    const cm = Math.round(dif * 100);
    return `${cm > 0 ? '+' : cm < 0 ? '−' : ''}${Math.abs(cm)} cm`;
  }
  // mesmas casas decimais da vazão comparada (1.190 m³/s → −4 m³/s)
  const casas = Math.abs(base) >= 100 ? 0 : Math.abs(base) >= 10 ? 1 : 2;
  const r = Number(dif.toFixed(casas));
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${n2(Math.abs(r), casas)} m³/s`;
}

const NOMES = { nivel: 'o nível', vazao: 'a vazão' } as const;
const FMT = { nivel: fmtNivel, vazao: fmtVazao } as const;

/** Como a grandeza variou ao longo do dia de referência. */
function evolucaoDia(pts: Ponto[], g: Grandeza, diaRef: string): string | null {
  const v = valores(pts.filter((p) => p.dia === diaRef), g);
  if (v.length < 2) return null;
  const ini = v[0]!;
  const fim = v.at(-1)!;
  const max = v.reduce((m, x) => (x.v > m.v ? x : m));
  const min = v.reduce((m, x) => (x.v < m.v ? x : m));
  const f = FMT[g];
  const nome = NOMES[g];
  const dif = fim.v - ini.v;
  const media = v.reduce((s, x) => s + x.v, 0) / v.length;
  if (estavel(g, dif, media) && estavel(g, max.v - min.v, media)) {
    return `${nome} permaneceu estável ao longo do dia, em torno de ${f(media)}.`;
  }
  const verbo = dif > 0 && !estavel(g, dif, media) ? 'subiu' : dif < 0 && !estavel(g, dif, media) ? 'desceu' : 'oscilou';
  const extremo = verbo === 'desceu' ? `com mínima de ${f(min.v)} às ${min.p.hora}` : `com máxima de ${f(max.v)} às ${max.p.hora}`;
  return `${nome} ${verbo} ao longo do dia, passando de ${f(ini.v)} (${ini.p.hora}) para ${f(fim.v)} (${fim.p.hora}), ${extremo}.`;
}

const PALAVRA = { subindo: 'em elevação', descendo: 'em queda', estavel: 'estável' } as const;

/** Texto da análise (mesmo formato do comunicado): dia de referência e última leitura. */
export function analise(pts: Ponto[], diaRef: string): string {
  if (!pts.length) return 'Sem leituras do posto no período.';
  const ultimo = pts.at(-1)!;
  const temVazao = pts.some((p) => p.vazao !== null);
  const linhas: string[] = [];
  // "Em relação ao dia 17/10, o nível subiu…" e, na linha seguinte, "A vazão subiu…"
  const nivelDia = evolucaoDia(pts, 'nivel', diaRef);
  const vazaoDia = temVazao ? evolucaoDia(pts, 'vazao', diaRef) : null;
  if (nivelDia) linhas.push(`Em relação ao dia ${diaMes(diaRef)}, ${nivelDia}`);
  if (vazaoDia) linhas.push(nivelDia ? `${vazaoDia[0]!.toUpperCase()}${vazaoDia.slice(1)}` : `Em relação ao dia ${diaMes(diaRef)}, ${vazaoDia}`);

  const cn = comparar(pts, 'nivel', diaRef);
  const cq = temVazao ? comparar(pts, 'vazao', diaRef) : null;
  if (cn) {
    let t = `Na última leitura (${diaMes(ultimo.dia)} ${ultimo.hora}), o nível está em ${fmtNivel(cn.valor)} (${fmtDif('nivel', cn.dif)}), ${PALAVRA[cn.tendencia]} em relação à média de ${diaMes(diaRef)}`;
    if (cq) t += `, e a vazão em ${fmtVazao(cq.valor)} (${fmtDif('vazao', cq.dif, cq.valor)}), ${PALAVRA[cq.tendencia]}`;
    linhas.push(`${t}.`);
  }
  return linhas.join('\n');
}

/** Dias AAAA-MM-DD de `de` a `ate`. */
export function diasEntre(de: string, ate: string): string[] {
  const r: string[] = [];
  for (let t = inicioDia(de); t <= inicioDia(ate) && r.length <= MAX_DIAS; t += 86_400_000) r.push(fmtDia.format(t));
  return r;
}
