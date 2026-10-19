import type { ReactNode } from 'react';
import { Esqueleto, EsqueletoGrafico } from '@/components/carregamento';
import { Secao } from '@/components/site/layout';

const CARTOES = [
  { rot: 'Chuva hoje', ico: 'bi-cloud-rain', cls: 'card-primary' },
  { rot: 'Chuva amanhã', ico: 'bi-cloud-drizzle', cls: 'card-primary' },
  { rot: 'Acumulado 3 dias', ico: 'bi-cloud-rain-heavy', cls: 'card-primary' },
  { rot: 'Acumulado 7 dias', ico: 'bi-calendar-week', cls: 'card-success' },
  { rot: 'Temp. máxima (7 d)', ico: 'bi-thermometer-sun', cls: 'card-warning' },
  { rot: 'Umidade do ar', ico: 'bi-droplet-half', cls: 'card-primary' },
];

/** Cartões do resumo; sem `valores`, os mesmos cartões com os números em esqueleto. */
export function Cartoes({ valores }: { valores?: { val: string; sub?: string }[] }) {
  return (
    <div className="row g-3">
      {CARTOES.map((c, i) => (
        <div className="col-6 col-md-4 col-xl-2" key={c.rot}>
          <div className={`card-spagua ${c.cls}`}>
            <i className={`bi ${c.ico}`} />
            <div className="card-spagua__rot">{c.rot}</div>
            {valores ? <div className="card-spagua__val">{valores[i]!.val}</div> : <Esqueleto className="esq-valor" />}
            {valores?.[i]!.sub && <small>{valores[i]!.sub}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A previsão do município como vai ficar, em esqueleto. */
export function PrevisaoEsqueleto({ nome }: { nome: string }) {
  return (
    <>
      <Secao titulo="Resumo do município" subtitulo="Principais números da previsão para a localidade selecionada." icone="bi-clipboard-data">
        <Cartoes />
      </Secao>
      <div className="prev-destaque mb-3">
        <div className="weather-main">
          <div className="text-secondary small">PREVISÃO PRINCIPAL</div>
          <div className="weather-place">{nome}</div>
          <Esqueleto largura="45%" />
          <Esqueleto className="esq-valor mt-3" largura="35%" />
          <Esqueleto className="esq-linha mt-3" />
          <Esqueleto className="esq-linha" largura="80%" />
        </div>
        <Secao titulo="Chuva prevista" subtitulo="Acumulado diário para os próximos 7 dias." icone="bi-cloud-rain">
          <EsqueletoGrafico className="weather-chart" altura="auto" />
        </Secao>
      </div>
      <Secao titulo="Próximos 7 dias" subtitulo="Chuva, probabilidade e temperatura em cada dia." icone="bi-calendar-week">
        <div className="weather-days">
          {Array.from({ length: 7 }, (_, i) => (
            <article className="weather-day" key={i}>
              <Esqueleto largura="70%" />
              <Esqueleto largura="50%" />
              <Esqueleto className="esq-valor" largura="60%" />
              <Esqueleto largura="80%" />
            </article>
          ))}
        </div>
      </Secao>
    </>
  );
}

/** Seção da busca de município; no loading.tsx, só com o status de consulta. */
export function SecaoBusca({ children }: { children: ReactNode }) {
  return (
    <Secao titulo="Consultar município" subtitulo="Digite o nome ou escolha um município do Estado de São Paulo." icone="bi-search">
      {children}
    </Secao>
  );
}

/** Seção do mapa de chuva prevista no estado. */
export function SecaoMapa({ children }: { children: ReactNode }) {
  return (
    <Secao
      id="mapa"
      titulo="Chuva prevista no Estado de São Paulo"
      subtitulo="Grade de precipitação acumulada, com dados reais da Open-Meteo. Escolha o horizonte de tempo."
      icone="bi-map"
    >
      {children}
    </Secao>
  );
}
