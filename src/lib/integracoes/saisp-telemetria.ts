import 'server-only';
import { lembrar, TTL, ultimoErro } from './cache';
import { hojeSp, ttlPorData } from './comum';
import { ErroFonte } from './http';

/**
 * Telemetria do SAISP — leituras de 10 em 10 min de um canal da rede
 * telemétrica (página processo.jsp, tabela com linhas class="ln"). Exige o
 * login do SAISP no ambiente (SAISP_USUARIO e SAISP_SENHA), o mesmo do radar
 * do Boletim Diário. Uma consulta por dia, como no PHP de referência; dia
 * passado fica em cache, o dia corrente vale 5 min.
 */

const SAISP = 'https://www.saisp.br';
const PROCESSO = `${SAISP}/geral/processo.jsp`;
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36';
const MESES: Record<string, string> = { JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06', JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12' };

export const saispConfigurado = () => !!process.env.SAISP_USUARIO && !!process.env.SAISP_SENHA;

export type Leitura = { dia: string; hora: string; valor: number };

/** Linhas da tabela do processo.jsp: "28 SET 2026 11:40" e o valor. Valores fora de [min, max] são descartados (falha do sensor). */
export function lerTabela(html: string, min: number, max: number): Leitura[] {
  const saida: Leitura[] = [];
  const re = /<tr[^>]*class="[^"]*\bln\b[^"]*"[^>]*>\s*<td[^>]*>\s*(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})\s*<\/td>([\s\S]*?)<\/tr>/g;
  for (const m of html.matchAll(re)) {
    const mes = MESES[m[2]!];
    const v = /-?\d+(?:[.,]\d+)?/.exec((m[6] ?? '').replace(/<[^>]+>/g, ' '))?.[0];
    if (!mes || v === undefined) continue;
    const valor = Number(v.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < min || valor > max) continue;
    saida.push({ dia: `${m[3]}-${mes}-${m[1]!.padStart(2, '0')}`, hora: `${m[4]}:${m[5]}`, valor });
  }
  return saida.sort((a, b) => a.hora.localeCompare(b.hora));
}

/** Sessão do SAISP: autenticação básica + cookies da aplicação e da página da rede telemétrica. */
class Sessao {
  private cookies = new Map<string, string>();
  private readonly auth = `Basic ${Buffer.from(`${process.env.SAISP_USUARIO}:${process.env.SAISP_SENHA}`).toString('base64')}`;

  async get(url: string, referer: string): Promise<string> {
    let r: Response;
    try {
      r = await fetch(url, {
        headers: {
          Authorization: this.auth,
          'User-Agent': NAVEGADOR,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          Referer: referer,
          ...(this.cookies.size ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        },
        signal: AbortSignal.timeout(40_000),
        cache: 'no-store',
      });
    } catch (e) {
      throw new ErroFonte((e as Error).name === 'TimeoutError' ? 'SAISP: tempo esgotado' : 'SAISP: falha de conexão');
    }
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(';');
      const i = par!.indexOf('=');
      if (i > 0) this.cookies.set(par!.slice(0, i).trim(), par!.slice(i + 1).trim());
    }
    if (r.status === 401) throw new ErroFonte('SAISP recusou o usuário e a senha', 401);
    if (!r.ok) throw new ErroFonte(`SAISP: HTTP ${r.status}`, r.status);
    const texto = await r.text();
    if (/acesso negado/i.test(texto)) throw new ErroFonte('SAISP: acesso negado');
    return texto;
  }

  /** Abre a aplicação e a página da rede telemétrica, como o navegador faz antes de consultar um canal. */
  async abrir(grupo: string, produto: number, ovl: string): Promise<string> {
    await this.get(`${SAISP}/app/index.html`, `${SAISP}/`);
    const rede = `${PROCESSO}?comboFiltroGrupo=${grupo}&PRODUTO=${produto}&OVLCODE=${ovl}&WHICHCODE=0&autoUpdate=1&STEP=&DI=&DF=`;
    await this.get(rede, `${SAISP}/app/index.html`);
    return rede;
  }
}

export type Canal = { canal: string; grupo: string; produto: number; ovl: string; code: number; min: number; max: number };

const dmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** Dias consultados ao mesmo tempo: o SAISP leva ~3,5 s por dia e não aceita o mês inteiro numa consulta (504). */
const SIMULTANEOS = 6;

/**
 * Leituras de um canal em cada dia de `dias` (AAAA-MM-DD), até SIMULTANEOS
 * dias por vez na mesma sessão. Dias sem resposta ficam fora do mapa. A
 * sessão só é aberta se algum dia não estiver em cache.
 */
export async function leiturasDias(c: Canal, dias: string[]): Promise<{ leituras: Map<string, Leitura[]>; erro: string | null }> {
  const leituras = new Map<string, Leitura[]>();
  if (!saispConfigurado()) return { leituras, erro: 'Login do SAISP não configurado (SAISP_USUARIO e SAISP_SENHA).' };
  const hoje = hojeSp();
  let sessao: Promise<{ s: Sessao; rede: string }> | null = null;
  let erro: string | null = null;
  const fila = dias.filter((d) => d <= hoje);
  const trabalhador = async () => {
    for (let dia = fila.shift(); dia && !erro; dia = fila.shift()) await umDia(dia);
  };
  const umDia = async (dia: string) => {
    const l = await lembrar(
      'saisp',
      `telemetria:${c.canal}:${dia}`,
      ttlPorData(dia, 5 * 60, TTL.historico),
      async () => {
        sessao ??= (async () => {
          const s = new Sessao();
          return { s, rede: await s.abrir(c.grupo, c.produto, c.ovl) };
        })();
        const { s, rede } = await sessao;
        const url =
          `${PROCESSO}?AUTOUPDATE=1&COMBOFILTROGRUPO=${c.grupo}&OVLCODE=${c.ovl}&PRODUTO=${c.produto}` +
          `&WHICHCHANNEL=${c.canal}&WHICHCODE=${c.code}&DI=${encodeURIComponent(`${dmy(dia)} 00:00`)}&DF=${encodeURIComponent(`${dmy(dia)} 23:59`)}`;
        return lerTabela(await s.get(url, rede), c.min, c.max).filter((x) => x.dia === dia);
      },
      { esperaFalhaSeg: 120 },
    );
    // falhou (login, rede): os trabalhadores param de pedir os outros dias desta consulta
    if (l) leituras.set(dia, l.valor);
    else erro ??= ultimoErro('saisp', `telemetria:${c.canal}:${dia}`) ?? 'SAISP indisponível no momento.';
  };
  await Promise.all(Array.from({ length: Math.min(SIMULTANEOS, fila.length) }, trabalhador));
  return { leituras, erro };
}
