import type { Metadata } from 'next';
import { AvisosPainel, fontes, KpisParaiba, SecaoTransposicao, SistemasPainel } from '../../../painel/corpo';
import { abrirPainel, linksSistemas, MolduraPainel } from '../moldura';
import '@/styles/painel.css';
import '@/styles/acesso/painel-interativo.css';

export const metadata: Metadata = { title: 'Painel de Segurança Hídrica — Paraíba do Sul' };

/** UHE Jaguari, transferência e transposição da bacia do Paraíba do Sul. */
export default async function ParaibaDoSul({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { usuario, data, hoje } = await abrirPainel(searchParams);
  fontes(data);

  return (
    <MolduraPainel pagina="paraiba-do-sul" usuario={usuario} data={data} hoje={hoje}>
      <AvisosPainel data={data} />
      <SistemasPainel data={data} links={linksSistemas(data, hoje)} />
      <section className="pnl-kpis pi-kpis">
        <KpisParaiba data={data} />
      </section>
      <section className="pnl-grid pi-grade">
        <SecaoTransposicao data={data} />
      </section>
    </MolduraPainel>
  );
}
