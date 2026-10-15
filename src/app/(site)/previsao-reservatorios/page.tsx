import type { Metadata } from 'next';
import '@/styles/legado/pagina-previsao-reservatorios.css';
import { GraficoPrevisaoSistemas } from '@/components/graficos-php';
import { centroArea, MapaPontos } from '@/components/graficos/mapa-pontos';
import { MapaSistemas } from '@/components/graficos/mapa-sistemas';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { dataBr, dataHora } from '@/lib/formato';
import { classeChuva } from '@/lib/hidrologia/previsao';
import areas from '@/conteudo/sistemas-produtores-areas.json';
import { contornoSP, type Contorno } from '@/lib/integracoes/ibge';
import { CENTROIDES_SISTEMAS, previsaoSistemas } from '@/lib/integracoes/openmeteo';

export const metadata: Metadata = {
  title: 'Previsão para os Sistemas Produtores',
  description: 'Chuva prevista pela Open-Meteo para os sete sistemas produtores da RMSP, com horizonte de até sete dias.',
};

const fmt = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const soma = (vs: (number | null)[], n: number) => vs.slice(0, n).reduce<number>((s, v) => s + (v ?? 0), 0);

export default async function PrevisaoReservatorios() {
  const [r, c] = await Promise.all([previsaoSistemas(7), contornoSP()]);
  const s = r.ok ? r.dados : [];
  const n = Math.max(1, s.length);
  const media = (dias: number) => s.reduce((t, x) => t + soma(x.chuvaMm, dias), 0) / n;
  const maior = s.reduce<(typeof s)[number] | null>((m, x) => (!m || soma(x.chuvaMm, 7) > soma(m.chuvaMm, 7) ? x : m), null);
  const datas = s[0]?.datas ?? [];
  const titulo = 'Chuva prevista em 7 dias na área de drenagem de cada sistema produtor';
  const mapa = s.map((x) => {
    const ctr = CENTROIDES_SISTEMAS.find((p) => p.sistema === x.sistema)!;
    const area = areas.features.find((f) => f.properties.sistema === x.sistema)?.geometry.coordinates as Contorno | undefined;
    const dica = { valor: `Hoje: ${fmt(soma(x.chuvaMm, 1))} mm`, rotulo: `${x.sistema} · 7 dias: ${fmt(soma(x.chuvaMm, 7))} mm` };
    return { nome: x.sistema, lat: ctr.lat, lon: ctr.lon, chuvaMm: soma(x.chuvaMm, 7), area, dias: x.chuvaMm, dica };
  });
  const cards = [
    { rot: 'Chuva hoje (média)', val: `${fmt(media(1))} mm`, ico: 'bi-cloud-rain', cls: 'card-primary' },
    { rot: 'Acumulado 48 h (média)', val: `${fmt(media(2))} mm`, ico: 'bi-cloud-drizzle', cls: 'card-primary' },
    { rot: 'Acumulado 72 h (média)', val: `${fmt(media(3))} mm`, ico: 'bi-cloud-rain-heavy', cls: 'card-primary' },
    { rot: 'Acumulado 7 dias (média)', val: `${fmt(media(7))} mm`, ico: 'bi-calendar-week', cls: 'card-success' },
    { rot: 'Maior acumulado 7 dias', val: maior ? `${fmt(soma(maior.chuvaMm, 7))} mm` : '—', sub: maior?.sistema, ico: 'bi-arrow-up-circle', cls: 'card-warning' },
  ];

  return (
    <>
      <Hero
        kicker="Meteorologia"
        titulo="Previsão para os Sistemas Produtores"
        texto="Chuva prevista pela Open-Meteo para os sete sistemas produtores da Região Metropolitana de São Paulo, com horizonte de até sete dias. Somente dados reais da API."
        icone="bi-cloud-rain-heavy"
      />
      <Principal>
        <Secao titulo="Panorama da previsão" subtitulo="Chuva acumulada prevista para o conjunto dos sistemas produtores." icone="bi-clipboard-data">
          <div className={`sssp-status mb-3${r.ok ? '' : ' is-error'}`}>
            {r.ok ? `Previsão obtida em ${dataHora(r.obtidoEm)}${r.desatualizado ? ' (Open-Meteo indisponível agora: última previsão obtida)' : ''}.` : r.mensagem}
          </div>
          {r.ok && (
            <div className="row g-3">
              {cards.map((x) => (
                <div className="col-6 col-md-4 col-xl" key={x.rot}>
                  <div className={`card-spagua ${x.cls}`}>
                    <i className={`bi ${x.ico}`} />
                    <div className="card-spagua__rot">{x.rot}</div>
                    <div className="card-spagua__val">{x.val}</div>
                    {x.sub && <small>{x.sub}</small>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Secao>

        {r.ok && (
          <>
            <div className="row g-3">
              <div className="col-lg-6">
                <Secao titulo="Localização dos sistemas" subtitulo="Área de drenagem de cada sistema produtor, colorida pela chuva prevista em 7 dias. Passe o mouse para ver a chuva de hoje; clique para ver os demais horizontes." icone="bi-geo-alt">
                  <link rel="stylesheet" href="/acesso/vendor/leaflet/leaflet.css" precedence="default" />
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
                </Secao>
              </div>
              <div className="col-lg-6">
                <Secao titulo="Evolução diária" subtitulo="Chuva prevista por dia, para cada sistema produtor." icone="bi-graph-up">
                  <div className="prevrsv-grafico-wrap">
                    <GraficoPrevisaoSistemas
                      labels={datas.map((d) => dataBr(d).slice(0, 5))}
                      series={s.map((x) => ({ sistema: x.sistema, chuva: x.chuvaMm }))}
                    />
                  </div>
                </Secao>
              </div>
            </div>

            <Secao titulo="Chuva prevista por sistema" subtitulo="Acumulado por horizonte de tempo, em milímetros." icone="bi-table">
              <div className="table-responsive">
                <table className="table table-striped prevrsv-tabela">
                  <thead>
                    <tr>
                      <th>Sistema</th>
                      <th>Hoje</th>
                      <th>48 h</th>
                      <th>72 h</th>
                      <th>7 dias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.map((x) => (
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
              <p className="text-secondary small mt-2 mb-0">
                Fonte: Open-Meteo, no ponto central de cada sistema · atualizado a cada hora. Hoje = dia corrente; 48 h e 72 h = hoje
                somado aos 1 ou 2 dias seguintes.
              </p>
            </Secao>
          </>
        )}
      </Principal>
    </>
  );
}
