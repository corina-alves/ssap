import type { Metadata } from 'next';
import Form from 'next/form';
import { Suspense } from 'react';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { painelOutorgas } from '@/lib/hidrologia/outorgas';
import { hojeSp, textoReserva } from '@/lib/integracoes/comum';
import { Barra, Painel } from './painel';

export const metadata: Metadata = {
  title: 'Vazões Outorgadas',
  description: 'Vazões captadas em relação aos limites outorgados dos sistemas produtores da RMSP.',
};

async function Conteudo({ data }: { data: string }) {
  const r = await painelOutorgas(data);
  if (!r.ok) return <div className="alert alert-warning">{r.mensagem}</div>;
  return <Painel d={r.dados} aviso={r.desatualizado ? textoReserva(r.fonte, r.obtidoEm) : undefined} />;
}

export default async function VazoesOutorgadas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = dataDaUrl((await searchParams).data);

  return (
    <main className="public-content out-page">
      <div className="container">
        <Barra>
          <Form action="" scroll={false} className="out-date">
            <div>
              <label htmlFor="dataConsulta">Data de referência</label>
              <input type="date" id="dataConsulta" name="data" max={hojeSp()} min="2010-01-01" defaultValue={data} />
            </div>
            <button className="out-btn" type="submit">
              <i className="bi bi-arrow-clockwise" />
              Atualizar
            </button>
          </Form>
        </Barra>

        <Suspense key={data} fallback={<Painel d={null} />}>
          <Conteudo data={data} />
        </Suspense>

        <div className="out-info">
          <i className="bi bi-info-circle-fill" />
          <div>
            <strong>Sobre os dados:</strong> as vazões de captação são obtidas no resumo diário dos Sistemas Produtores. Para o Sistema
            Cantareira, considera-se atualmente <strong>33,0 m³/s de limite de retirada</strong>, acrescidos de{' '}
            <strong>8,5 m³/s da transposição do Paraíba do Sul</strong>. O percentual de utilização do Cantareira é calculado sobre o
            limite de retirada de 23,0 m³/s; a transposição é apresentada separadamente.
          </div>
        </div>
      </div>
    </main>
  );
}
