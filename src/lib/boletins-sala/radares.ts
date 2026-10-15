import { lembrar } from '../integracoes/cache';

/**
 * Imagens de radar do Boletim Diário da SSAP (acumulado de 24 h):
 *   - IPMet/UNESP: camada "ACUM24h" do mapa público (MapServer/WMS). Só existe
 *     a imagem mais recente — não dá para pedir um horário;
 *   - SP Águas/SAISP: produto 637 ("Radar Acumulada 3km 1x1km — Dinâmica") no
 *     mapa "Estado de São Paulo (UGRHI)", somado das 07h às 07h. Exige login
 *     (SAISP_USUARIO e SAISP_SENHA no ambiente).
 * As imagens passam pelo servidor porque os sites não aceitam chamada direta
 * do navegador de outro endereço.
 */

const SERVICO = 'boletim_diario';
const NAVEGADOR = 'Mozilla/5.0 (SalaDeSituacao-SPAguas)';

export type Imagem = { tipo: string; base64: string };

async function baixar(url: string, cabecalhos: Record<string, string> = {}): Promise<Imagem> {
  const r = await fetch(url, { headers: { 'User-Agent': NAVEGADOR, ...cabecalhos }, signal: AbortSignal.timeout(40_000), cache: 'no-store' });
  const tipo = r.headers.get('content-type') ?? '';
  if (!r.ok || !tipo.startsWith('image/')) throw new Error(`HTTP ${r.status} (${tipo || 'sem tipo'})`);
  return { tipo, base64: Buffer.from(await r.arrayBuffer()).toString('base64') };
}

// ---------------------------------------------------------------- IPMet

const IPMET = 'https://www.ipmetradar.com.br';
const REFERENCIA_IPMET = { Referer: `${IPMET}/2cappiGis/dist/2cappiGis.html` };
/** Área pedida ao IPMet: [lonMin, latMin, lonMax, latMax] (cobre os radares de Bauru e Presidente Prudente). */
export const AREA_IPMET = [-56, -27, -42, -18] as const;

/** Acumulado de 24 h mais recente do IPMet, com fundo transparente, na AREA_IPMET. */
export async function radarIpmet(): Promise<Imagem | null> {
  const [x0, y0, x1, y1] = AREA_IPMET;
  const url =
    `${IPMET}/cgi-bin/mapserv.cgi?map=/home/webadm/alerta/dados/acum24/last.map&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=acum24&STYLES=` +
    `&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:4326&BBOX=${x0},${y0},${x1},${y1}&WIDTH=${(x1 - x0) * 100}&HEIGHT=${(y1 - y0) * 100}`;
  return (await lembrar(SERVICO, 'radar-ipmet', 10 * 60, () => baixar(url, REFERENCIA_IPMET), { validadeMaxSeg: 6 * 3600 }))?.valor ?? null;
}

/** Escala de cores (mm) do acumulado do IPMet. */
export async function escalaIpmet(): Promise<Imagem | null> {
  return (await lembrar(SERVICO, 'radar-ipmet-escala', 30 * 86_400, () => baixar(`${IPMET}/imagens/escala_acum.png`, REFERENCIA_IPMET)))?.valor ?? null;
}

// ---------------------------------------------------------------- SAISP

const SAISP = 'https://www.saisp.br';
const PRODUTO_ACUMULADA = 637;
const MAPA_ESTADO_UGRHI = 'EUG';

const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** Instante → "AAAAMMDDHHmm" no horário de São Paulo (formato do SAISP). */
const dataSaisp = (ms: number) => fmt.format(new Date(ms)).replace(/\D/g, '');

export const saispConfigurado = () => !!process.env.SAISP_USUARIO && !!process.env.SAISP_SENHA;

/** Acumulado de radar do SAISP entre `ini` e `fim` (ms). null = sem login configurado ou SAISP fora. */
export async function radarSaisp(ini: number, fim: number): Promise<Imagem | null> {
  if (!saispConfigurado()) return null;
  const l = await lembrar(
    SERVICO,
    `radar-saisp:${dataSaisp(ini)}-${dataSaisp(fim)}`,
    6 * 3600,
    async () => {
      const acesso = { Authorization: `Basic ${Buffer.from(`${process.env.SAISP_USUARIO}:${process.env.SAISP_SENHA}`).toString('base64')}` };
      const pagina = await fetch(
        `${SAISP}/geral/processo.jsp?PRODUTO=${PRODUTO_ACUMULADA}&OVLCODE=${MAPA_ESTADO_UGRHI}&WHICHCODE=0&DI=${dataSaisp(ini)}&DF=${dataSaisp(fim)}`,
        { headers: { 'User-Agent': NAVEGADOR, ...acesso }, signal: AbortSignal.timeout(60_000), cache: 'no-store' },
      );
      if (!pagina.ok) throw new Error(pagina.status === 401 ? 'SAISP recusou o usuário e a senha' : `SAISP: HTTP ${pagina.status}`);
      // a imagem do produto é gerada num endereço temporário, citado na página
      const endereco = /https:\/\/saisp-temp\.s3\.amazonaws\.com\/[^"'\s]+\.png/.exec(await pagina.text())?.[0];
      if (!endereco) throw new Error('SAISP: imagem do produto não encontrada na resposta');
      return baixar(endereco);
    },
    { validadeMaxSeg: 2 * 86_400, esperaFalhaSeg: 120 },
  );
  return l?.valor ?? null;
}
