import type { Metadata } from 'next';
import Form from 'next/form';
import { cache, Suspense } from 'react';
import { Consultando, EsqueletoGrafico } from '@/components/carregamento';
import { GraficoCurvaContingencia } from '@/components/graficos-php';
import { Principal } from '@/components/site/layout';
import { dadosCurva, PERIODO_CURVA } from '@/lib/hidrologia/curva';
import { RE_DATA } from '@/lib/integracoes/comum';
import { Cartoes, Periodo, SecaoProjecao } from './cartoes';

export const metadata: Metadata = {
  title: 'Curva de Contingência',
  description: 'Projeção de volume útil do SIM e do Sistema Cantareira, comparando o observado com as curvas de referência.',
};

const data = (v: string | string[] | undefined, padrao: string) => {
  const t = (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
  return RE_DATA.test(t) && t >= '2010-01-01' && t <= '2100-12-31' ? t : padrao;
};

// Uma consulta por requisição, dividida entre o status, os cartões e o gráfico.
const dados = cache(dadosCurva);

async function CartoesCurva({ inicio, fim }: { inicio: string; fim: string }) {
  return <Cartoes d={await dados(inicio, fim)} />;
}

async function Status({ inicio, fim }: { inicio: string; fim: string }) {
  const d = await dados(inicio, fim);
  return d.observado.length === 0 ? (
    <div className="sssp-status is-error">Sem volume observado no período (fora do intervalo ou SABESP indisponível).</div>
  ) : (
    <div className="sssp-status is-ok">Curva completa — meta e observado do mesmo dia estão destacados.</div>
  );
}

async function Grafico({ inicio, fim }: { inicio: string; fim: string }) {
  const d = await dados(inicio, fim);
  return (
    <>
      <div style={{ position: 'relative', height: 470 }}>
        <GraficoCurvaContingencia inicio={d.inicio} fim={d.fim} curvaSim={d.curvaSim} curvaCantareira={d.curvaCantareira} observado={d.observado} fonteCantareira={d.fonteCantareira} />
      </div>
      <div className="credito-grafico mt-3 text-end">
        Volume observado — SIM: Sabesp · Cantareira: {d.fonteCantareira}. Elaborado pela Sala de Situação Alfredo Pisani
      </div>
    </>
  );
}

export default async function CurvaContingencia({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  let inicio = data(sp.inicio, PERIODO_CURVA.inicio);
  let fim = data(sp.fim, PERIODO_CURVA.fim);
  // Mesma regra de dadosCurva: datas invertidas são trocadas.
  if (inicio > fim) [inicio, fim] = [fim, inicio];
  // Troca de período: os blocos voltam ao esqueleto até os novos dados chegarem.
  const periodo = `${inicio}|${fim}`;

  return (
    <Principal>
      <Periodo>
        <Form action="" scroll={false} className="sssp-filter-grid">
          <div className="sssp-field">
            <label htmlFor="inicio">Data inicial</label>
            <input type="date" id="inicio" name="inicio" defaultValue={inicio} />
          </div>
          <div className="sssp-field">
            <label htmlFor="fim">Data final</label>
            <input type="date" id="fim" name="fim" defaultValue={fim} />
          </div>
          <div className="sssp-field">
            <button type="submit" className="btn btn-primary">
              <i className="bi bi-arrow-repeat me-1" /> Atualizar
            </button>
          </div>
          <Suspense key={periodo} fallback={<Consultando>Consultando os volumes observados…</Consultando>}>
            <Status inicio={inicio} fim={fim} />
          </Suspense>
        </Form>
      </Periodo>

      <Suspense key={periodo} fallback={<Cartoes d={null} />}>
        <CartoesCurva inicio={inicio} fim={fim} />
      </Suspense>

      <SecaoProjecao>
        <Suspense key={periodo} fallback={<EsqueletoGrafico altura={470} rotulo="Carregando a projeção de volume…" />}>
          <Grafico inicio={inicio} fim={fim} />
        </Suspense>
      </SecaoProjecao>
    </Principal>
  );
}
