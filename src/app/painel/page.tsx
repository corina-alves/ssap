import type { Metadata } from 'next';
import Form from 'next/form';
import Link from 'next/link';
import { Suspense } from 'react';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { dataBr, dataHora } from '@/lib/formato';
import { hojeSp } from '@/lib/integracoes/comum';
import { Relogio } from './ao-vivo';
import { CorpoPainel, DataReferencia } from './corpo';

export const metadata: Metadata = {
  title: 'Painel de Situação Hídrica — RMSP',
  description: 'Painel de parede com volume, precipitação, vazão natural e transposição do Paraíba do Sul dos sistemas produtores da RMSP.',
};

// --- página ----------------------------------------------------------------

export default async function Painel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const data = dataDaUrl((await searchParams).data);

  return (
    <div className="pnl" id="pnl">
      <link rel="stylesheet" href="/acesso/vendor/leaflet/leaflet.css" precedence="default" />

      <header className="pnl-top">
        <div className="pnl-brand">
          <Link href="/" title="Voltar ao site da Sala de Situação">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/legado/logo/spaguas_white.png" alt="SP Águas" />
          </Link>
          <div>
            <h1>Painel de Situação Hídrica</h1>
            <span>Região Metropolitana de São Paulo - Sala de Situação Alfredo Pisani</span>
          </div>
        </div>
        <Form action="" scroll={false} className="pnl-busca" key={data}>
          <label htmlFor="pnlDataInput">
            <i className="bi bi-calendar3" /> Data de referência
          </label>
          <div className="pnl-busca-campo">
            <input type="date" id="pnlDataInput" name="data" defaultValue={data} min="2010-01-01" max={hojeSp()} />
            <button type="submit" title="Buscar" aria-label="Buscar">
              <i className="bi bi-search" />
            </button>
          </div>
        </Form>

        <div className="pnl-top-meta">
          <Relogio />
          <div className="pnl-data">
            Referência:{' '}
            <Suspense fallback={<strong>{dataBr(data)}</strong>}>
              <DataReferencia data={data} />
            </Suspense>
          </div>
          <div className="pnl-atualiza">
            <i className="bi bi-arrow-repeat" /> atualiza a cada 10 min · {dataHora(new Date())}
          </div>
        </div>
      </header>

      <CorpoPainel data={data} />
    </div>
  );
}
