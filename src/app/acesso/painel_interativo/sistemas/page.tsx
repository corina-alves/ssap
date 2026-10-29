import type { Metadata } from 'next';
import { SISTEMAS } from '@/lib/hidrologia/painel-interativo';
import { abrirPainel, MolduraPainel } from '../moldura';
import { TelaPainel } from '../tela';
import { VISTAS, type Vista } from '../vistas';
import '@/styles/painel.css';
import '@/styles/acesso/painel-interativo.css';

export const metadata: Metadata = { title: 'Painel de Segurança Hídrica — análise por sistema' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Análise por sistema (dados do SSD): diagrama unifilar, gráficos por período e
 * reservatórios. ?sistema= e ?vista= abrem direto num sistema e numa sub-aba.
 */
export default async function Sistemas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { usuario, busca, data, hoje } = await abrirPainel(searchParams);
  const s = um(busca.sistema);
  const v = um(busca.vista);
  const sistema = SISTEMAS.some((x) => x.chave === s) ? s! : 'sim';
  const vista: Vista = VISTAS.some((x) => x.chave === v) ? (v as Vista) : 'diagrama';

  return (
    <MolduraPainel pagina="sistemas" usuario={usuario} data={data} hoje={hoje} manter={['sistema', 'vista']}>
      <section className="pi-analise" aria-label="Análise por sistema">
        <TelaPainel data={data} hoje={hoje} sistemaInicial={sistema} vistaInicial={vista} />
      </section>
    </MolduraPainel>
  );
}
