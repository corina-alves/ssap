import { FonteOpenMeteo } from '@/components/fonte-open-meteo';
import type { ReactNode } from 'react';
import { Consultando, Esqueleto, EsqueletoGrafico, EsqueletoTabela } from '@/components/carregamento';
import { Principal, Secao } from '@/components/site/layout';
import { CENTROIDES_SISTEMAS } from '@/lib/integracoes/openmeteo';

export const COLUNAS = ['Sistema', 'Hoje', '48 h', '72 h', '7 dias'];
const CARTOES = [
  { rot: 'Chuva hoje (média)', ico: 'bi-cloud-rain', cls: 'card-primary' },
  { rot: 'Acumulado 48 h (média)', ico: 'bi-cloud-drizzle', cls: 'card-primary' },
  { rot: 'Acumulado 72 h (média)', ico: 'bi-cloud-rain-heavy', cls: 'card-primary' },
  { rot: 'Acumulado 7 dias (média)', ico: 'bi-calendar-week', cls: 'card-success' },
  { rot: 'Maior acumulado 7 dias', ico: 'bi-arrow-up-circle', cls: 'card-warning' },
];

export function Cartoes({ valores }: { valores?: { val: string; sub?: string }[] }) {
  return (
    <div className="row g-3">
      {CARTOES.map((x, i) => (
        <div className="col-6 col-md-4 col-xl" key={x.rot}>
          <div className={`card-spagua ${x.cls}`}>
            <i className={`bi ${x.ico}`} />
            <div className="card-spagua__rot">{x.rot}</div>
            {valores ? <div className="card-spagua__val">{valores[i]!.val}</div> : <Esqueleto className="esq-valor" />}
            {valores?.[i]!.sub && <small>{valores[i]!.sub}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

type Blocos = { panorama: ReactNode; mapa: ReactNode; evolucao: ReactNode; tabela: ReactNode };

/** Esqueleto de cada bloco: fallback dos <Suspense> da página e conteúdo do loading.tsx. */
export const ESQUELETOS: Blocos = {
  panorama: (
    <>
      <Consultando className="sssp-status mb-3" />
      <Cartoes />
    </>
  ),
  mapa: <EsqueletoGrafico altura={460} rotulo="Carregando o mapa…" />,
  evolucao: <EsqueletoGrafico className="prevrsv-grafico-wrap" altura="auto" />,
  tabela: <EsqueletoTabela colunas={COLUNAS} linhas={CENTROIDES_SISTEMAS.length} className="table table-striped prevrsv-tabela" />,
};

/** Seções da página; cada bloco de dados entra no seu lugar. */
export function Estrutura({ panorama, mapa, evolucao, tabela }: Blocos) {
  return (
    <Principal>
      <Secao titulo="Panorama da previsão" subtitulo="Chuva acumulada prevista para o conjunto dos sistemas produtores." icone="bi-clipboard-data">
        {panorama}
      </Secao>

      <div className="row g-3">
        <div className="col-lg-6">
          <Secao titulo="Localização dos sistemas" subtitulo="Área de drenagem de cada sistema produtor, colorida pela chuva prevista em 7 dias. Passe o mouse para ver a chuva de hoje; clique para ver os demais horizontes." icone="bi-geo-alt">
            <link rel="stylesheet" href="/acesso/vendor/leaflet/leaflet.css" precedence="default" />
            {mapa}
          </Secao>
        </div>
        <div className="col-lg-6">
          <Secao titulo="Evolução diária" subtitulo="Chuva prevista por dia, para cada sistema produtor." icone="bi-graph-up">
            {evolucao}
          </Secao>
        </div>
      </div>

      <Secao titulo="Chuva prevista por sistema" subtitulo="Acumulado por horizonte de tempo, em milímetros." icone="bi-table">
        {tabela}
        <p className="text-secondary small mt-2 mb-0">
          <FonteOpenMeteo />, no ponto central de cada sistema · atualizado a cada hora. Hoje = dia corrente; 48 h e 72 h = hoje
          somado aos 1 ou 2 dias seguintes.
        </p>
      </Secao>
    </Principal>
  );
}
