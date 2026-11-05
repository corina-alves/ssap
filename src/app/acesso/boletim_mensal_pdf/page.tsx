import type { Metadata } from 'next';
import '@/styles/acesso/boletim-mensal.css';
import { Imprimir } from '@/components/boletim-mensal/barra';
import { FolhasBoletim } from '@/components/boletim-mensal/folhas';
import { exigirSala } from '@/lib/auth/acl';
import { dadosBoletim, mesExtenso, PERMISSAO_VER, SALA_BOLETIM_MENSAL } from '@/lib/boletins-sala/boletim-mensal';
import { opcoesFim } from '@/lib/hidrologia/sistemas-ssd';

export const metadata: Metadata = { title: 'Boletim mensal — PDF' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Versão de impressão do Boletim Mensal (fora do menu da área): só os slides,
 * um por página de 1280 × 720 px. "Imprimir / Salvar PDF" usa a impressão do
 * navegador (destino "Salvar como PDF").
 */
export default async function BoletimMensalPdf({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const sala = await exigirSala(um(sp.s) || SALA_BOLETIM_MENSAL, PERMISSAO_VER);
  const opcoes = opcoesFim();
  const mes = opcoes.find((o) => o.valor === um(sp.mes))?.valor ?? opcoes[0]!.valor;
  const d = await dadosBoletim(sala.id, mes);
  return (
    <main className="py-3" style={{ background: '#e9edf1', minHeight: '100vh' }}>
      <div className="bm-so-tela container mb-3 d-flex flex-wrap align-items-center gap-3">
        <Imprimir />
        <span className="small text-secondary">
          Boletim mensal de {mesExtenso(mes)} — {sala.nome}. Na janela de impressão: destino <strong>Salvar como PDF</strong>, margens <strong>Nenhuma</strong> e{' '}
          <strong>Gráficos de plano de fundo</strong> marcado.
        </span>
      </div>
      <FolhasBoletim d={d} salaId={sala.id} editavel={false} />
    </main>
  );
}
