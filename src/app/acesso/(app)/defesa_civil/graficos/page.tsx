import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cache, Suspense } from 'react';
import '@/styles/acesso/postos-graficos.css';
import { Cabecalho } from '@/components/acesso/pecas';
import { Esqueleto, EsqueletoGrafico } from '@/components/carregamento';
import { acl } from '@/lib/auth/acl';
import { hojeSp, somarDias } from '@/lib/integracoes/comum';
import { analise, comparar, diaMes, diasEntre, fmtDif, fmtNivel, fmtVazao, MAX_DIAS, postosFluviometricos, seriePosto, type PostoSibh } from '@/lib/hidrologia/postos-graficos';
import { AnaliseEditavel } from './analise';
import { GraficoPosto } from './grafico-posto';
import { Seletor } from './seletor';

export const metadata: Metadata = { title: 'Gráficos de postos — Defesa Civil' };

const varios = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const um = (v: string | string[] | undefined) => varios(v)[0] ?? '';
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
/** 2026-10-17 → 17/10/2026 */
const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

// Cadastro dos postos: uma consulta por requisição, dividida entre o seletor e os cartões.
const cadastro = cache(postosFluviometricos);

async function SeletorPostos(props: { escolhidos: number[]; de: string; ate: string; diaRef: string; hoje: string }) {
  const postos = await cadastro();
  return <Seletor {...props} maxDias={MAX_DIAS} postos={postos.map((p) => ({ id: p.id, rotulo: `${p.prefixo} — ${p.nome}${p.cidade ? ` (${p.cidade})` : ''}` }))} />;
}

/** Cartão do posto como vai ficar, com os valores em esqueleto. */
function CartaoEsqueleto({ titulo, periodo }: { titulo: string; periodo: string }) {
  return (
    <div className="pg-item">
      <div className="pg-item__acoes" />
      <section className="pg-cartao">
        <header className="pg-cartao__topo">
          <h2>{titulo}</h2>
          <p>{periodo}</p>
        </header>
        <div className="pg-cartao__corpo">
          <div className="pg-kpis">
            <Esqueleto largura="45%" altura="1.4rem" />
          </div>
          <EsqueletoGrafico className="pg-grafico" altura="auto" rotulo="Carregando o gráfico do posto…" />
          <div className="pg-analise">
            <Esqueleto largura="40%" altura="1.2rem" />
            <Esqueleto />
            <Esqueleto />
            <Esqueleto largura="70%" />
          </div>
        </div>
      </section>
    </div>
  );
}

async function CartaoPosto({ posto, de, ate, diaRef }: { posto: PostoSibh; de: string; ate: string; diaRef: string }) {
  const titulo = `${posto.prefixo} — ${posto.nome}`;
  const pontos = await seriePosto(posto.id, de, ate);
  const periodo = `${dataBr(de)} a ${dataBr(ate)}`;
  if (!pontos || !pontos.length) {
    return (
      <div className="pg-item">
        <div className="pg-item__acoes" />
        <section className="pg-cartao">
          <header className="pg-cartao__topo">
            <h2>{titulo}</h2>
            <p>{periodo}</p>
          </header>
          <div className="pg-cartao__corpo">
            <p className="text-secondary mb-0">
              <i className="bi bi-cloud-slash me-1" />
              {pontos ? 'Sem leituras deste posto no período.' : 'Não foi possível obter as leituras do SIBH agora. Tente novamente em instantes.'}
            </p>
          </div>
        </section>
      </div>
    );
  }
  const ultimo = pontos.at(-1)!;
  const cn = comparar(pontos, 'nivel', diaRef);
  const cq = comparar(pontos, 'vazao', diaRef);
  return (
    <div className="pg-item">
      {/* Fora do cartão: o cartão (faixa azul até a análise) fica só com o conteúdo do comunicado. */}
      <div className="pg-item__acoes">
        <a
          className="btn btn-sm btn-outline-primary"
          href={`/acesso/defesa_civil/graficos/baixar?${new URLSearchParams({ p: String(posto.id), de, ate })}`}
          download
          title={`Leituras horárias de ${titulo}, ${periodo}, em planilha (CSV)`}
        >
          <i className="bi bi-download me-1" />
          Baixar dados (CSV)
        </a>
      </div>
      <section className="pg-cartao">
        <header className="pg-cartao__topo">
          <h2>{titulo}</h2>
          <p>
            {periodo} · última leitura {diaMes(ultimo.dia)} {ultimo.hora}
          </p>
        </header>
        <div className="pg-cartao__corpo">
          <div className="pg-kpis">
            {cn && (
              <span>
                <small>NÍVEL</small> <strong>{fmtNivel(cn.valor)}</strong> <em>{fmtDif('nivel', cn.dif)} vs. média de {diaMes(diaRef)}</em>
              </span>
            )}
            {cq && (
              <span>
                <small>VAZÃO</small> <strong>{fmtVazao(cq.valor)}</strong> <em>{fmtDif('vazao', cq.dif, cq.valor)} vs. média de {diaMes(diaRef)}</em>
              </span>
            )}
          </div>
          <GraficoPosto pontos={pontos.map(({ dia, hora, nivel, vazao }) => ({ dia, hora, nivel, vazao }))} titulo={`Nível${cq ? ' e vazão' : ''} de ${titulo}, ${periodo}`} />
          <AnaliseEditavel titulo={`Análise – ${posto.nome}`} automatico={analise(pontos, diaRef)} chave={`dc-analise:${posto.id}:${de}:${ate}:${diaRef}`} />
        </div>
      </section>
    </div>
  );
}

async function Cartoes({ ids, de, ate, diaRef }: { ids: number[]; de: string; ate: string; diaRef: string }) {
  const postos = await cadastro();
  const porId = new Map(postos.map((p) => [p.id, p]));
  const periodo = `${dataBr(de)} a ${dataBr(ate)}`;
  return (
    <div className="pg-cartoes">
      {ids.map((id) => {
        const posto = porId.get(id);
        if (!posto) return null;
        return (
          <Suspense key={`${id}:${de}:${ate}:${diaRef}`} fallback={<CartaoEsqueleto titulo={`${posto.prefixo} — ${posto.nome}`} periodo={periodo} />}>
            <CartaoPosto posto={posto} de={de} ate={ate} diaRef={diaRef} />
          </Suspense>
        );
      })}
    </div>
  );
}

/**
 * Defesa Civil — gráficos de postos: qualquer posto fluviométrico do SIBH,
 * nível e vazão hora a hora no período escolhido, a última leitura comparada
 * com a média de um dia e a análise em texto (editável) para o acompanhamento.
 */
export default async function GraficosPostos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await acl();
  if (!a.podeEmAlguma('visualizar_dashboard')) redirect('/acesso/sem-acesso');

  const sp = await searchParams;
  const hoje = hojeSp();
  let ate = RE_DATA.test(um(sp.ate)) && um(sp.ate) <= hoje ? um(sp.ate) : hoje;
  let de = RE_DATA.test(um(sp.de)) && um(sp.de) <= hoje ? um(sp.de) : somarDias(ate, -1);
  if (de > ate) [de, ate] = [ate, de];
  if (diasEntre(de, ate).length > MAX_DIAS) de = somarDias(ate, -(MAX_DIAS - 1));
  const diaRef = RE_DATA.test(um(sp.ref)) && um(sp.ref) >= de && um(sp.ref) <= ate ? um(sp.ref) : de;
  const ids = [...new Set(varios(sp.p).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 8);

  return (
    <>
      <Cabecalho
        titulo="Gráficos de postos"
        subtitulo="Nível e vazão de qualquer posto fluviométrico do SIBH no período escolhido, com a última leitura comparada à média de um dia e a análise para o acompanhamento."
        trilha={[
          ['Painel', '/acesso'],
          ['Defesa Civil', '/acesso/defesa_civil'],
          ['Gráficos de postos', null],
        ]}
      />
      <Suspense fallback={<div className="acesso-card mb-3"><Esqueleto altura="2.4rem" /><Esqueleto largura="40%" /></div>}>
        <SeletorPostos key={`${ids.join()}|${de}|${ate}|${diaRef}`} escolhidos={ids} de={de} ate={ate} diaRef={diaRef} hoje={hoje} />
      </Suspense>
      {ids.length > 0 && (
        <Suspense fallback={null}>
          <Cartoes ids={ids} de={de} ate={ate} diaRef={diaRef} />
        </Suspense>
      )}
    </>
  );
}
