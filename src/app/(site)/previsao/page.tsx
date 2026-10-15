import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import '@/styles/legado/pagina-previsao.css';
import { GraficoPrevisaoMunicipio } from '@/components/graficos-php';
import { MapaGrade } from '@/components/graficos/mapa-grade';
import { texto } from '@/components/paginacao';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { dataBr, dataHora } from '@/lib/formato';
import { localizarMunicipio, type Local } from '@/lib/hidrologia/previsao';
import { contornoSP, municipiosSP } from '@/lib/integracoes/ibge';
import { condicao, gradeEstado, previsaoMunicipio } from '@/lib/integracoes/openmeteo';

export const metadata: Metadata = {
  title: 'Previsão para os Municípios',
  description: 'Chuva, probabilidade de precipitação, temperatura, umidade e vento nos próximos 7 dias para os municípios de São Paulo.',
};

const fmt = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const soma = (vs: (number | null)[], n: number) => vs.slice(0, n).reduce<number>((s, v) => s + (v ?? 0), 0);

/** Horizontes do mapa (dias somados a partir de hoje). */
const HORIZONTES = { '1': 'Hoje', '2': '48 h', '3': '72 h', '7': '7 dias' } as const;
type Horizonte = keyof typeof HORIZONTES;

async function PrevisaoMunicipio({ local }: { local: Local }) {
  const r = await previsaoMunicipio(local.lat, local.lon);
  if (!r.ok) return <div className="sssp-status is-error">{r.mensagem}</div>;
  const { dias, umidadeAtual } = r.dados;
  const hoje = dias[0];
  const amanha = dias[1];
  const chuvas = dias.map((d) => d.chuvaMm);
  const tmax = Math.max(...dias.map((d) => d.tmax ?? -99));
  const tmin = Math.min(...dias.map((d) => d.tmin ?? 99));
  const cards = [
    { rot: 'Chuva hoje', val: `${fmt(hoje?.chuvaMm)} mm`, sub: `${fmt(hoje?.probabilidade, 0)}% de prob.`, ico: 'bi-cloud-rain', cls: 'card-primary' },
    { rot: 'Chuva amanhã', val: `${fmt(amanha?.chuvaMm)} mm`, sub: `${fmt(amanha?.probabilidade, 0)}% de prob.`, ico: 'bi-cloud-drizzle', cls: 'card-primary' },
    { rot: 'Acumulado 3 dias', val: `${fmt(soma(chuvas, 3))} mm`, ico: 'bi-cloud-rain-heavy', cls: 'card-primary' },
    { rot: 'Acumulado 7 dias', val: `${fmt(soma(chuvas, 7))} mm`, ico: 'bi-calendar-week', cls: 'card-success' },
    { rot: 'Temp. máxima (7 d)', val: `${fmt(tmax, 0)}°C`, sub: `mín. ${fmt(tmin, 0)}°C`, ico: 'bi-thermometer-sun', cls: 'card-warning' },
    { rot: 'Umidade do ar', val: `${fmt(umidadeAtual, 0)}%`, sub: 'agora', ico: 'bi-droplet-half', cls: 'card-primary' },
  ];

  return (
    <>
      <Secao titulo="Resumo do município" subtitulo="Principais números da previsão para a localidade selecionada." icone="bi-clipboard-data">
        {r.desatualizado && <div className="sssp-status is-error mb-2">Open-Meteo indisponível agora; previsão de {dataHora(r.obtidoEm)}.</div>}
        <div className="row g-3">
          {cards.map((c) => (
            <div className="col-6 col-md-4 col-xl-2" key={c.rot}>
              <div className={`card-spagua ${c.cls}`}>
                <i className={`bi ${c.ico}`} />
                <div className="card-spagua__rot">{c.rot}</div>
                <div className="card-spagua__val">{c.val}</div>
                {c.sub && <small>{c.sub}</small>}
              </div>
            </div>
          ))}
        </div>
      </Secao>

      <div className="prev-destaque mb-3">
        <div className="weather-main">
          <div className="d-flex justify-content-between gap-3 flex-wrap">
            <div>
              <div className="text-secondary small">PREVISÃO PRINCIPAL</div>
              <div className="weather-place">{local.nome}</div>
              <div className="text-secondary">
                {hoje ? `${dataBr(hoje.data)} · ${condicao(hoje.codigo)}` : '—'}
              </div>
            </div>
            <div className="text-end">
              <div className="weather-rain">{fmt(hoje?.chuvaMm)} mm</div>
              <small className="text-secondary">chuva prevista hoje</small>
            </div>
          </div>
          <div className="weather-meta">
            <div>
              <small>
                <i className="bi bi-cloud-rain" />
                Probabilidade
              </small>
              <br />
              <strong>{fmt(hoje?.probabilidade, 0)}%</strong>
            </div>
            <div>
              <small>
                <i className="bi bi-thermometer-half" />
                Temperatura
              </small>
              <br />
              <strong>
                {fmt(hoje?.tmin)}° / {fmt(hoje?.tmax)}°C
              </strong>
            </div>
            <div>
              <small>
                <i className="bi bi-droplet-half" />
                Umidade do ar
              </small>
              <br />
              <strong>{fmt(umidadeAtual, 0)}%</strong>
            </div>
            <div>
              <small>
                <i className="bi bi-wind" />
                Vento máx.
              </small>
              <br />
              <strong>{fmt(hoje?.ventoKmh)} km/h</strong>
            </div>
          </div>
          <div className="text-secondary small mt-3">
            Atualizado em {dataHora(r.obtidoEm)} · Fonte: Open-Meteo
          </div>
        </div>
        <Secao titulo="Chuva prevista" subtitulo="Acumulado diário para os próximos 7 dias." icone="bi-cloud-rain">
          <div className="weather-chart">
            <GraficoPrevisaoMunicipio
              labels={dias.map((d) => new Date(`${d.data}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }))}
              chuva={dias.map((d) => d.chuvaMm)}
              tmax={dias.map((d) => d.tmax)}
              tmin={dias.map((d) => d.tmin)}
            />
          </div>
        </Secao>
      </div>

      <Secao titulo="Próximos 7 dias" subtitulo="Chuva, probabilidade e temperatura em cada dia." icone="bi-calendar-week">
        <div className="weather-days">
          {dias.map((x, i) => (
            <article className={`weather-day${i === 0 ? ' active' : ''}`} key={x.data}>
              <div className="day">{dataBr(x.data)}</div>
              <div className="small text-secondary">{condicao(x.codigo)}</div>
              <div className="rain">
                <i className="bi bi-droplet-fill" /> {fmt(x.chuvaMm)} mm
              </div>
              <div className="small">{fmt(x.probabilidade, 0)}% de chuva</div>
              <div className="mt-2">
                <strong>{fmt(x.tmax)}°</strong> / {fmt(x.tmin)}°C
              </div>
            </article>
          ))}
        </div>
      </Secao>
    </>
  );
}

async function MapaEstado({ horizonte, municipio, local }: { horizonte: Horizonte; municipio: string; local: Local | null }) {
  const [g, c] = await Promise.all([gradeEstado(Number(horizonte)), contornoSP()]);
  const q = (h: string) => `/previsao?${new URLSearchParams({ ...(municipio ? { municipio } : {}), horizonte: h })}#mapa`;
  return (
    <>
      <div className="prev-horizonte" role="group" aria-label="Horizonte de previsão">
        {Object.entries(HORIZONTES).map(([h, rotulo]) => (
          <Link key={h} href={q(h)} className={h === horizonte ? 'is-ativo' : undefined} aria-current={h === horizonte ? 'true' : undefined} scroll={false}>
            {rotulo}
          </Link>
        ))}
      </div>
      {!g.ok ? (
        <div className="sssp-status is-error">{g.mensagem}</div>
      ) : (
        <div className="prev-mapa-wrap">
          <MapaGrade
            titulo={`Chuva acumulada prevista no Estado de São Paulo — ${HORIZONTES[horizonte].toLowerCase()}`}
            contorno={c.ok ? c.dados : null}
            pontos={g.dados}
            passoLat={0.55}
            passoLon={0.65}
            marcador={local}
          />
          <div className="sssp-status mt-2">
            Grade de {g.dados.length} pontos (Open-Meteo), recortada pelo contorno do Estado (IBGE) · {dataHora(g.obtidoEm)}.
          </div>
        </div>
      )}
    </>
  );
}

export default async function Previsao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const municipio = texto(sp.municipio, 80);
  const h = texto(sp.horizonte, 2);
  const horizonte: Horizonte = h in HORIZONTES ? (h as Horizonte) : '1';
  const [local, lista] = await Promise.all([localizarMunicipio(municipio), municipiosSP()]);

  return (
    <>
      <Hero
        kicker="Meteorologia"
        titulo="Previsão para os Municípios de São Paulo"
        texto="São Paulo é a referência principal. Pesquise qualquer município do Estado para consultar chuva, probabilidade de precipitação, temperatura, umidade do ar e vento nos próximos 7 dias."
        icone="bi-cloud-sun"
      />
      <Principal>
        <Secao titulo="Consultar município" subtitulo="Digite o nome ou escolha um município do Estado de São Paulo." icone="bi-search">
          <form className="prev-busca" method="get">
            <div className="sssp-field">
              <label htmlFor="buscaMunicipio">Município</label>
              <input
                id="buscaMunicipio"
                name="municipio"
                list="municipios-sp"
                defaultValue={local.ok ? local.local.nome : municipio}
                placeholder="Digite o nome"
                autoComplete="off"
                required
              />
              {lista.ok && (
                <datalist id="municipios-sp">
                  {lista.dados.map((m) => (
                    <option key={m.codigoIbge} value={m.nome} />
                  ))}
                </datalist>
              )}
            </div>
            {horizonte !== '1' && <input type="hidden" name="horizonte" value={horizonte} />}
            <button className="btn btn-primary" type="submit">
              <i className="bi bi-cloud-sun me-2" />
              Ver previsão
            </button>
          </form>
          <div className={`sssp-status mt-3${local.ok ? '' : ' is-error'}`}>
            {local.ok
              ? municipio
                ? `${local.local.nome} selecionado.`
                : 'São Paulo selecionado como referência principal.'
              : local.mensagem}
          </div>
        </Secao>

        {local.ok && (
          <Suspense fallback={<div className="sssp-status">Consultando a previsão...</div>}>
            <PrevisaoMunicipio local={local.local} />
          </Suspense>
        )}

        <Secao
          id="mapa"
          titulo="Chuva prevista no Estado de São Paulo"
          subtitulo="Grade de precipitação acumulada, com dados reais da Open-Meteo. Escolha o horizonte de tempo."
          icone="bi-map"
        >
          <Suspense fallback={<div className="sssp-status">Carregando mapa...</div>}>
            <MapaEstado horizonte={horizonte} municipio={municipio} local={local.ok ? local.local : null} />
          </Suspense>
        </Secao>
      </Principal>
    </>
  );
}
