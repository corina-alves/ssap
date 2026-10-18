import type { ReactNode } from 'react';
import { EsqueletoGrafico } from '@/components/carregamento';
import { Secao } from '@/components/site/layout';
import { ID_CANTAREIRA, ID_SIM } from '@/lib/integracoes/sabesp';

export const SERIES = [
  { id: 'graficoCantareira', titulo: 'Sistema Cantareira', label: 'Cantareira', icone: 'bi-droplet-half', sistema: ID_CANTAREIRA, cor: '#0a4677' },
  { id: 'graficoSIM', titulo: 'Sistema Integrado Metropolitano — SIM', label: 'SIM', icone: 'bi-water', sistema: ID_SIM, cor: '#087ca4' },
];
export type Serie = (typeof SERIES)[number];

export const esqueletoSerie = (s: Serie) => <EsqueletoGrafico altura={430} rotulo={`Carregando a série do ${s.label}…`} />;

/** Seção do filtro; no loading.tsx, só com o status de consulta. */
export function Referencia({ children }: { children: ReactNode }) {
  return (
    <Secao titulo="Data de referência" subtitulo="Escolha o dia e o mês usados na comparação entre os anos." icone="bi-calendar3">
      {children}
    </Secao>
  );
}

/** Um gráfico por série, lado a lado; `grafico` dá o conteúdo de cada um. */
export function GradeSeries({ grafico }: { grafico: (s: Serie) => ReactNode }) {
  return (
    <div className="row g-4">
      {SERIES.map((s) => (
        <div key={s.id} className="col-xl-6">
          <Secao titulo={s.titulo} subtitulo="Volume útil na data de referência de cada ano." icone={s.icone}>
            {grafico(s)}
          </Secao>
        </div>
      ))}
    </div>
  );
}
