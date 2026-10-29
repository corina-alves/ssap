import type { Metadata } from 'next';
import { AvisosPainel, fontes, SecaoTabela, SistemasPainel } from '../../../painel/corpo';
import { abrirPainel, linksSistemas, MolduraPainel } from '../moldura';
import '@/styles/painel.css';
import '@/styles/acesso/painel-interativo.css';

export const metadata: Metadata = { title: 'Painel de Segurança Hídrica — acompanhamento' };

/** Tabela de acompanhamento: volume, estágio, chuva e vazão de cada sistema. */
export default async function Acompanhamento({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { usuario, data, hoje } = await abrirPainel(searchParams);
  fontes(data);

  return (
    <MolduraPainel pagina="acompanhamento" usuario={usuario} data={data} hoje={hoje}>
      <AvisosPainel data={data} />
      <SistemasPainel data={data} links={linksSistemas(data, hoje)} />
      <section className="pnl-grid pi-grade">
        <SecaoTabela data={data} />
      </section>
    </MolduraPainel>
  );
}
