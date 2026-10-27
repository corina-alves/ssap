import { lembrar } from './cache';
import { comoDado, type Dado } from './comum';
import { ErroFonte } from './http';
import { classificarErro, classificarStatus, registrarChamada, viaProxy } from './monitor';
import { lerXlsx } from '../planilha-xlsx';

/**
 * Planilha horária da EMAE (Dados_SP_AGUAS.xlsx, no SharePoint da EMAE, site
 * GO-Operacao; acesso restrito), lida pelo Microsoft Graph com um aplicativo
 * registrado no Entra ID da EMAE (client credentials, só leitura: Sites.Selected
 * no site, ou Files.SelectedOperations.Selected no arquivo).
 *
 *   EMAE_TENANT_ID, EMAE_CLIENT_ID, EMAE_CLIENT_SECRET   o aplicativo
 *   EMAE_PLANILHA_URL                                    o endereço do arquivo no SharePoint, ou
 *   EMAE_DRIVE_ID + EMAE_ITEM_ID                         os ids do arquivo no Graph (têm prioridade)
 *   EMAE_ABA                                             aba a ler (opcional; padrão: a primeira)
 *
 * Tudo fica no servidor (.env.docker); a página só recebe os valores já tratados.
 */

export const FONTE = 'EMAE';

export const emaeConfigurado = () =>
  !!process.env.EMAE_TENANT_ID &&
  !!process.env.EMAE_CLIENT_ID &&
  !!process.env.EMAE_CLIENT_SECRET &&
  (!!process.env.EMAE_PLANILHA_URL || (!!process.env.EMAE_DRIVE_ID && !!process.env.EMAE_ITEM_ID));

const GRAPH = 'https://graph.microsoft.com/v1.0/';
const TIMEOUT_MS = 30_000;

// Token do aplicativo (vale ~1 h): guardado em memória até 5 min antes de vencer.
// No globalThis pelo mesmo motivo do cache.ts (o módulo pode carregar mais de uma vez).
const memoria = globalThis as { __ssapTokenEmae?: { token: string; vence: number } };

async function chamar(url: string, init: RequestInit): Promise<Response> {
  const inicio = performance.now();
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  } catch (e) {
    void registrarChamada({ url, inicio, falha: classificarErro(e, viaProxy(url)), erro: e });
    throw new ErroFonte((e as Error).name === 'TimeoutError' ? 'EMAE: tempo esgotado' : 'EMAE: falha de conexão');
  }
  void registrarChamada({ url, inicio, status: r.status, falha: r.ok ? null : classificarStatus(r.status) });
  if (!r.ok) {
    await r.body?.cancel();
    throw new ErroFonte(r.status === 401 || r.status === 403 ? 'EMAE: acesso à planilha recusado' : `EMAE: HTTP ${r.status}`, r.status);
  }
  return r;
}

async function tokenGraph(): Promise<string> {
  const guardado = memoria.__ssapTokenEmae;
  if (guardado && guardado.vence > Date.now() + 5 * 60_000) return guardado.token;
  const corpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.EMAE_CLIENT_ID!,
    client_secret: process.env.EMAE_CLIENT_SECRET!,
    scope: 'https://graph.microsoft.com/.default',
  });
  const r = await chamar(`https://login.microsoftonline.com/${encodeURIComponent(process.env.EMAE_TENANT_ID!)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo,
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new ErroFonte('EMAE: token não recebido');
  memoria.__ssapTokenEmae = { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

const conteudo = (drive: string, item: string) => `${GRAPH}drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(item)}/content`;

async function graphJson<T>(url: string, tk: string): Promise<T> {
  return (await (await chamar(url, { headers: { Authorization: `Bearer ${tk}` } })).json()) as T;
}

type ItemGraph = { id: string; parentReference?: { driveId?: string }; sharepointIds?: { listItemUniqueId?: string } };

/**
 * Endereço do conteúdo do arquivo no Graph:
 *  - EMAE_DRIVE_ID + EMAE_ITEM_ID, se informados;
 *  - endereço do SharePoint ("…/sites/<site>/_layouts/15/Doc.aspx?sourcedoc={GUID}&file=<nome>"):
 *    procura o arquivo pelo nome nas bibliotecas do site e confere o GUID (guardado 30 dias);
 *  - qualquer outro link: endpoint de compartilhamento do Graph ("u!" + base64url).
 */
async function urlConteudo(tk: string): Promise<string> {
  const drive = process.env.EMAE_DRIVE_ID;
  const item = process.env.EMAE_ITEM_ID;
  if (drive && item) return conteudo(drive, item);

  const link = new URL(process.env.EMAE_PLANILHA_URL!);
  const guid = link.searchParams.get('sourcedoc')?.replace(/[{}]/g, '').toLowerCase();
  const nome = link.searchParams.get('file');
  const site = /\/((?:sites|teams)\/[^/]+)/.exec(link.pathname)?.[1];
  if (guid && nome && site) {
    const l = await lembrar('emae', `arquivo:${guid}`, 30 * 86_400, async () => {
      const s = await graphJson<{ id: string }>(`${GRAPH}sites/${link.hostname}:/${site}?$select=id`, tk);
      const drives = await graphJson<{ value: { id: string }[] }>(`${GRAPH}sites/${encodeURIComponent(s.id)}/drives?$select=id`, tk);
      for (const d of drives.value) {
        const busca = `${GRAPH}drives/${encodeURIComponent(d.id)}/root/search(q='${encodeURIComponent(nome.replace(/'/g, "''"))}')?$select=id,name,parentReference,sharepointIds`;
        const achado = (await graphJson<{ value: ItemGraph[] }>(busca, tk)).value.find((i) => i.sharepointIds?.listItemUniqueId?.toLowerCase() === guid);
        if (achado) return { drive: achado.parentReference?.driveId ?? d.id, item: achado.id };
      }
      throw new ErroFonte(`EMAE: planilha "${nome}" não encontrada no site`);
    });
    if (!l) throw new ErroFonte('EMAE: não foi possível localizar a planilha no SharePoint');
    return conteudo(l.valor.drive, l.valor.item);
  }
  return `${GRAPH}shares/u!${Buffer.from(link.href).toString('base64url')}/driveItem/content`;
}

/** Linhas (células como texto) da aba da planilha. Guardadas 10 min. */
export async function planilhaEmae(): Promise<Dado<string[][]>> {
  if (!emaeConfigurado()) return { ok: false, fonte: FONTE, mensagem: 'Dados da EMAE aguardando integração.' };
  const l = await lembrar(
    'emae',
    'planilha',
    10 * 60,
    async () => {
      const tk = await tokenGraph();
      const r = await chamar(await urlConteudo(tk), { headers: { Authorization: `Bearer ${tk}` } });
      const abas = lerXlsx(new Uint8Array(await r.arrayBuffer()));
      const nome = process.env.EMAE_ABA;
      const aba = nome ? abas.find((a) => a.nome === nome) : abas[0];
      if (!aba) throw new ErroFonte(nome ? `EMAE: aba "${nome}" não encontrada` : 'EMAE: planilha sem abas');
      return aba.linhas;
    },
    { esperaFalhaSeg: 5 * 60 },
  );
  return comoDado(FONTE, l, 'Planilha da EMAE indisponível no momento.');
}
