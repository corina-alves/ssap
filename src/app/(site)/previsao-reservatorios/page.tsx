import type { Metadata } from 'next';
import { connection } from 'next/server';
import { cache, Suspense } from 'react';
import { GraficoPrevisaoSistemas } from '@/components/graficos-php';
import { centroArea, MapaPontos } from '@/components/graficos/mapa-pontos';
import { MapaSistemas } from '@/components/graficos/mapa-sistemas';
import { dataBr, dataHora } from '@/lib/formato';
import { classeChuva } from '@/lib/hidrologia/previsao';
import areas from '@/conteudo/sistemas-produtores-areas.json';
import { contornoSP, type Contorno } from '@/lib/integracoes/ibge';
import { CENTROIDES_SISTEMAS, previsaoSistemas } from '@/lib/integracoes/openmeteo';
import { Cartoes, COLUNAS, ESQUELETOS, Estrutura } from './estrutura';

export const metadata: Metadata = {
  title: 'Previsão para os Sistemas Produtores',
  description: 'Chuva prevista pela Open-Meteo para os sete sistemas produtores da RMSP, com horizonte de até sete dias.',
};

const fmt = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const soma = (vs: (number | null)[], n: number) => vs.slice(0, n).reduce<number>((s, v) => s + (v ?? 0), 0);

// Uma consulta por requisição, dividida entre os blocos da página.
const previsao = cache(() => previsaoSistemas(7));

function Erro({ mensagem }: { mensagem: string }) {
  return <div className="sssp-status is-error">{mensagem}</div>;
}

async function Panorama() {
  const r = await previsao();
  if (!r.ok) return <Erro mensagem={r.mensagem} />;
  const s = r.dados;
  const n = Math.max(1, s.length);
  const media = (dias: number) => s.reduce((t, x) => t + soma(x.chuvaMm, dias), 0) / n;
  const maior = s.reduce<(typeof s)[number] | null>((m, x) => (!m || soma(x.chuvaMm, 7) > soma(m.chuvaMm, 7) ? x : m), null);
  return (
    <>
      <div className="sssp-status mb-3">
        {`Previsão obtida em ${dataHora(r.obtidoEm)}${r.desatualizado ? ' (Open-Meteo indisponível agora: última previsão obtida)' : ''}.`}
      </div>
      <Cartoes
        valores={[
          { val: `${fmt(media(1))} mm` },
          { val: `${fmt(media(2))} mm` },
          { val: `${fmt(media(3))} mm` },
          { val: `${fmt(media(7))} mm` },
          { val: maior ? `${fmt(soma(maior.chuvaMm, 7))} mm` : '—', sub: maior?.sistema },
        ]}
      />
    </>
  );
}

/** Mapa das áreas de drenagem: espera a previsão (cores) e o contorno do Estado (IBGE), em paralelo. */
async function Mapa() {
  const [r, c] = await Promise.all([previsao(), contornoSP()]);
  if (!r.ok) return <Erro mensagem={r.mensagem} />;
  const titulo = 'Chuva prevista em 7 dias na área de drenagem de cada sistema produtor';
  const mapa = r.dados.map((x) => {
    const ctr = CENTROIDES_SISTEMAS.find((p) => p.sistema === x.sistema)!;
    const area = areas.features.find((f) => f.properties.sistema === x.sistema)?.geometry.coordinates as Contorno | undefined;
    const dica = { valor: `Hoje: ${fmt(soma(x.chuvaMm, 1))} mm`, rotulo: `${x.sistema} · 7 dias: ${fmt(soma(x.chuvaMm, 7))} mm` };
    return { nome: x.sistema, lat: ctr.lat, lon: ctr.lon, chuvaMm: soma(x.chuvaMm, 7), area, dias: x.chuvaMm, dica };
  });
  return (
    <MapaSistemas
      titulo={titulo}
      sistemas={mapa.flatMap((x) => {
        const centro = x.area && centroArea(x.area);
        if (!x.area || !centro) return [];
        return [
          {
            nome: x.nome,
            area: x.area,
            centro: [centro[1], centro[0]] as [number, number],
            classe: classeChuva(x.chuvaMm),
            linhas: [
              ['Hoje', `${fmt(soma(x.dias, 1))} mm`],
              ['48 h', `${fmt(soma(x.dias, 2))} mm`],
              ['72 h', `${fmt(soma(x.dias, 3))} mm`],
              ['7 dias', `${fmt(x.chuvaMm)} mm`],
            ] as [string, string][],
          },
        ];
      })}
    >
      <MapaPontos titulo={titulo} contorno={c.ok ? c.dados : null} margemGraus={0.12} pontos={mapa} />
    </MapaSistemas>
  );
}

async function Evolucao() {
  const r = await previsao();
  if (!r.ok) return <Erro mensagem={r.mensagem} />;
  const s = r.dados;
  const datas = s[0]?.datas ?? [];
  return (
    <div className="prevrsv-grafico-wrap">
      <GraficoPrevisaoSistemas labels={datas.map((d) => dataBr(d).slice(0, 5))} series={s.map((x) => ({ sistema: x.sistema, chuva: x.chuvaMm }))} />
    </div>
  );
}

async function Tabela() {
  const r = await previsao();
  if (!r.ok) return <Erro mensagem={r.mensagem} />;
  return (
    <div className="table-responsive">
      <table className="table table-striped prevrsv-tabela">
        <thead>
          <tr>
            {COLUNAS.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.dados.map((x) => (
            <tr key={x.sistema}>
              <td>{x.sistema}</td>
              <td>{fmt(soma(x.chuvaMm, 1))}</td>
              <td>{fmt(soma(x.chuvaMm, 2))}</td>
              <td>{fmt(soma(x.chuvaMm, 3))}</td>
              <td>
                <strong>{fmt(soma(x.chuvaMm, 7))}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Estrutura na hora; cada bloco (resumo, mapa, gráfico, tabela) entra quando a
 * Open-Meteo responder — o mapa espera também o contorno do IBGE, sem atrasar os demais.
 */
export default async function PrevisaoReservatorios() {
  // Previsão é dado do momento: nunca gerar esta página estática no build.
  await connection();
  return (
    <Estrutura
      panorama={
        <Suspense fallback={ESQUELETOS.panorama}>
          <Panorama />
        </Suspense>
      }
      mapa={
        <Suspense fallback={ESQUELETOS.mapa}>
          <Mapa />
        </Suspense>
      }
      evolucao={
        <Suspense fallback={ESQUELETOS.evolucao}>
          <Evolucao />
        </Suspense>
      }
      tabela={
        <Suspense fallback={ESQUELETOS.tabela}>
          <Tabela />
        </Suspense>
      }
    />
  );
}
