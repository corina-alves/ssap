import type { Metadata } from 'next';
import { AvisosPainel, fontes, SecaoMapa, SecaoParticipacao, SecaoVolume, SistemasPainel } from '../../painel/corpo';
import { abrirPainel, linksSistemas, MolduraPainel } from './moldura';
import '@/styles/painel.css';
import '@/styles/acesso/painel-interativo.css';

export const metadata: Metadata = { title: 'Painel interativo — visão geral' };

/**
 * Painel interativo da área restrita (exige login e visualizar_dashboard na
 * Sala Alfredo Pisani). O conteúdo do Painel de Situação Hídrica do site fica
 * repartido em páginas (abas da MolduraPainel); esta é a visão geral: cards dos
 * sistemas, mapa, volume útil e participação no SIM.
 */
export default async function PainelInterativo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { usuario, data, hoje } = await abrirPainel(searchParams);
  fontes(data); // dispara as consultas já, em paralelo

  return (
    <MolduraPainel pagina="geral" usuario={usuario} data={data} hoje={hoje}>
      <AvisosPainel data={data} />
      <SistemasPainel data={data} links={linksSistemas(data, hoje)} />
      <section className="pnl-grid pi-grade">
        <SecaoMapa data={data} />
        <SecaoVolume data={data} />
        <SecaoParticipacao />
      </section>
    </MolduraPainel>
  );
}
