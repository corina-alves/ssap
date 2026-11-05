'use client';

import type { Chart } from 'chart.js';
import { useRef, useState } from 'react';
import { GraficoComparativoVolumes } from '@/components/boletim-mensal/graficos';
import type { TabelaVolumes } from '@/lib/hidrologia/volumes-mensais';

/**
 * Gráfico "Comparativo do ano e mês anterior com o ano e mês atual (%)" do
 * boletim mensal e o texto "Análise dos Sistemas Produtores" — os mesmos dados
 * da tabela de volumes, com PNG do gráfico e cópia do texto.
 */
export function GraficoVolumesSistemas({ t, texto }: { t: TabelaVolumes; texto: string | null }) {
  const grafico = useRef<Chart<'bar', (number | null)[], string> | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function baixar() {
    if (!grafico.current) return;
    const a = document.createElement('a');
    a.href = grafico.current.toBase64Image('image/png', 1);
    a.download = `comparativo_volumes_sistemas_${t.datas.atual}.png`;
    a.click();
  }

  async function copiarTexto() {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setAviso('Texto copiado.');
    } catch {
      setAviso('O navegador não permitiu copiar. Selecione o texto e use Ctrl+C.');
    }
  }

  return (
    <section className="acesso-card mb-3">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
        <div>
          <h2 className="h6 mb-0">Comparativo dos volumes úteis (%) do ano e mês anterior com o ano e mês atual</h2>
          <small className="text-secondary">Mesmos dados da tabela acima.</small>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={baixar}>
            <i className="bi bi-download" /> Gráfico (PNG)
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={copiarTexto} disabled={!texto}>
            <i className="bi bi-clipboard" /> Copiar texto
          </button>
        </div>
      </div>
      <div className="row g-3 align-items-center">
        <div className="col-xl-8">
          <div className="acesso-grafico acesso-grafico--sistema">
            <GraficoComparativoVolumes t={t} grafico={grafico} />
          </div>
        </div>
        <div className="col-xl-4">
          <h3 className="h6">Análise dos Sistemas Produtores</h3>
          <p className="small mb-1" style={{ textAlign: 'justify' }}>
            {texto ?? 'Sem dados de volume para montar a análise.'}
          </p>
          {aviso && <div className="small text-success">{aviso}</div>}
        </div>
      </div>
    </section>
  );
}
