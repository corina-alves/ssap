import type { Dado } from '@/lib/integracoes/comum';
import { chuva, escolherPeriodo, estruturas, niveis, paraCampo, volumeCopel } from '@/lib/boletins-sala/boletim-ribeira';
import { gerarPdf } from '@/lib/boletins-sala/boletim-ribeira-pdf';
import { erroSeguro, log } from '@/lib/log';
import { enderecoPublico } from '@/lib/requisicao';

/** 2026-10-28T13:20 → 2026-10-28_13h20 (nome do arquivo) */
const paraNome = (ms: number) => paraCampo(ms).replace('T', '_').replace(':', 'h');

/** Uma fonte lenta não segura o PDF: depois disto, o bloco dela sai como indisponível. */
const PRAZO_MS = 20_000;

function comPrazo<T>(p: Promise<Dado<T>>, fonte: string): Promise<Dado<T>> {
  let espera: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<Dado<T>>((ok) => {
    espera = setTimeout(() => ok({ ok: false, fonte, mensagem: `${fonte} demorou a responder: tente gerar o PDF de novo em alguns minutos.` }), PRAZO_MS);
  });
  const resultado = p.catch((e): Dado<T> => {
    log.warn('boletim_ribeira_pdf_fonte', { fonte, erro: erroSeguro(e) });
    return { ok: false, fonte, mensagem: `${fonte} indisponível no momento.` };
  });
  return Promise.race([resultado, limite]).finally(() => clearTimeout(espera));
}

/**
 * PDF do Sumário Executivo — Vale do Ribeira, gerado na hora com os dados das
 * fontes (os mesmos da página; o cache e a coleta em segundo plano evitam
 * consultas repetidas). Período: ?inicio=&fim= (como na página); sem eles, das
 * 07h às 07h. ?baixar=1 baixa o arquivo; sem ele, abre no navegador.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const { ref } = escolherPeriodo(url.searchParams.get('inicio') ?? undefined, url.searchParams.get('fim') ?? undefined);
  const [n, e, c, copel] = await Promise.all([
    comPrazo(niveis(ref), 'SIBH — SP Águas'),
    comPrazo(estruturas(ref), 'SIBH — SP Águas'),
    comPrazo(chuva(ref), 'SIBH — SP Águas / Open-Meteo'),
    volumeCopel(ref), // nunca lança; a chamada à Copel tem prazo próprio de 20 s
  ]);
  const pdf = await gerarPdf({
    ref,
    geradoEm: Date.now(),
    niveis: n,
    estruturas: e,
    chuva: c,
    copel,
    endereco: `${enderecoPublico(req)}/boletins/automatico/vale-do-ribeira`,
  });
  // Padrão: o fechamento das 07h do dia operacional; escolhido: início e fim no nome.
  const nome = ref.personalizado
    ? `sumario-executivo-vale-do-ribeira_${paraNome(ref.t07Ontem)}_a_${paraNome(ref.t07)}.pdf`
    : `sumario-executivo-vale-do-ribeira_${ref.dia}_07h.pdf`;
  const baixar = url.searchParams.get('baixar') === '1';
  return new Response(pdf as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${baixar ? 'attachment' : 'inline'}; filename="${nome}"`,
      // os dados mudam a cada 10 min: o navegador pode guardar 5 min
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
