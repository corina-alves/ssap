import type { Metadata } from 'next';
import { AvisosPainel, fontes, KpisParaiba, SecaoTransposicao, SistemasPainel } from '../../../painel/corpo';
import { abrirPainelParaiba, linksSistemas, MolduraPainel } from '../moldura';
import { DiagramaParaiba } from './diagrama';
import { GraficosVolumeParaiba } from './volumes';
import '@/styles/painel.css';
import '@/styles/acesso/painel-interativo.css';

export const metadata: Metadata = { title: 'Painel de Segurança Hídrica — Paraíba do Sul' };

/**
 * Bacia do Paraíba do Sul: UHE Jaguari, transferência e transposição, o
 * diagrama unifilar da bacia e os gráficos de volume dos reservatórios. Quem vê só esta página (Sala Vale do Paraíba) não
 * vê os cartões dos sistemas produtores da RMSP nem as outras abas do painel.
 */
export default async function ParaibaDoSul({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { usuario, data, hoje, acesso } = await abrirPainelParaiba(searchParams);
  fontes(data);

  return (
    <MolduraPainel pagina="paraiba-do-sul" usuario={usuario} data={data} hoje={hoje} somente={acesso === 'paraiba' ? 'paraiba-do-sul' : undefined}>
      <AvisosPainel data={data} />
      {acesso === 'completo' && <SistemasPainel data={data} links={linksSistemas(data, hoje)} />}
      <section className="pnl-kpis pi-kpis">
        <KpisParaiba data={data} />
      </section>
      <section className="pi-card pi-paraiba-diagrama" aria-label="Diagrama unifilar — Bacia do Rio Paraíba do Sul">
        <h3>
          <i className="bi bi-diagram-3" /> Diagrama unifilar — Bacia do Rio Paraíba do Sul
        </h3>
        <DiagramaParaiba data={data} hoje={hoje} />
      </section>
      <GraficosVolumeParaiba data={data} hoje={hoje} />
      <section className="pnl-grid pi-grade">
        <SecaoTransposicao data={data} />
      </section>
    </MolduraPainel>
  );
}
