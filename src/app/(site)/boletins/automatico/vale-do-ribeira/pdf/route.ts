import type { Dado } from '@/lib/integracoes/comum';
import { chuva, estruturas, niveis, referencias, volumeCopel } from '@/lib/boletins-sala/boletim-ribeira';
import { gerarPdf } from '@/lib/boletins-sala/boletim-ribeira-pdf';
import { erroSeguro, log } from '@/lib/log';
import { enderecoPublico } from '@/lib/requisicao';

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
 * PDF do Boletim Executivo Público — Vale do Ribeira, gerado na hora com os
 * dados das fontes (os mesmos da página; o cache e a coleta em segundo plano
 * evitam consultas repetidas). ?baixar=1 baixa o arquivo; sem ele, abre no navegador.
 */
export async function GET(req: Request) {
  const ref = referencias();
  const [n, e, c] = await Promise.all([
    comPrazo(niveis(ref), 'SIBH — SP Águas'),
    comPrazo(estruturas(ref), 'SIBH — SP Águas'),
    comPrazo(chuva(), 'SIBH — SP Águas / Open-Meteo'),
  ]);
  const pdf = await gerarPdf({
    ref,
    geradoEm: Date.now(),
    niveis: n,
    estruturas: e,
    chuva: c,
    copel: volumeCopel(),
    endereco: `${enderecoPublico(req)}/boletins/automatico/vale-do-ribeira`,
  });
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(ref.agora)
    .replace(', ', '_')
    .replace(':', 'h');
  const nome = `boletim-executivo-vale-do-ribeira_${dia}.pdf`;
  const baixar = new URL(req.url).searchParams.get('baixar') === '1';
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
