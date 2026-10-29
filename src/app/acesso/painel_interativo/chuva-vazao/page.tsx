import type { Metadata } from 'next';
import { AvisosPainel, fontes, KpisChuvaVazao, SecaoChuva, SecaoVazao, SistemasPainel } from '../../../painel/corpo';
import { abrirPainel, linksSistemas, MolduraPainel } from '../moldura';
import '@/styles/painel.css';
import '@/styles/acesso/painel-interativo.css';

export const metadata: Metadata = { title: 'Painel de Segurança Hídrica — chuva e vazão' };

/** Chuva e vazão natural do dia no SIM e por sistema produtor. */
export default async function ChuvaVazao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { usuario, data, hoje } = await abrirPainel(searchParams);
  fontes(data);

  return (
    <MolduraPainel pagina="chuva-vazao" usuario={usuario} data={data} hoje={hoje}>
      <AvisosPainel data={data} />
      <SistemasPainel data={data} links={linksSistemas(data, hoje)} />
      <section className="pnl-kpis pi-kpis">
        <KpisChuvaVazao data={data} />
      </section>
      <section className="pnl-grid pi-grade">
        <SecaoChuva data={data} />
        <SecaoVazao data={data} />
      </section>
    </MolduraPainel>
  );
}
