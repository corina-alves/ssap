import type { Metadata } from 'next';
import Form from 'next/form';
import { cache, Suspense } from 'react';
import { Consultando } from '@/components/carregamento';
import { GraficoPrevisaoMunicipio } from '@/components/graficos-php';
import { FonteOpenMeteo } from '@/components/fonte-open-meteo';
import { texto } from '@/components/paginacao';
import { Principal, Secao } from '@/components/site/layout';
import { dataBr, dataHora } from '@/lib/formato';
import { localizarMunicipio, type Local } from '@/lib/hidrologia/previsao';
import { municipiosSP } from '@/lib/integracoes/ibge';
import { condicao, previsaoMunicipio } from '@/lib/integracoes/openmeteo';
import { Cartoes, PrevisaoEsqueleto, SecaoBusca } from './esqueleto';

export const metadata: Metadata = {
  title: 'Previsão para os Municípios',
  description: 'Chuva, probabilidade de precipitação, temperatura, umidade e vento nos próximos 7 dias para os municípios de São Paulo.',
};

const fmt = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const soma = (vs: (number | null)[], n: number) => vs.slice(0, n).reduce<number>((s, v) => s + (v ?? 0), 0);

// Uma consulta por requisição, dividida entre o status e a previsão.
const localizar = cache(localizarMunicipio);

async function PrevisaoMunicipio({ local }: { local: Local }) {
  const r = await previsaoMunicipio(local.lat, local.lon);
  if (!r.ok) return <div className="sssp-status is-error">{r.mensagem}</div>;
  const { dias, umidadeAtual } = r.dados;
  const hoje = dias[0];
  const amanha = dias[1];
  const chuvas = dias.map((d) => d.chuvaMm);
  const tmax = Math.max(...dias.map((d) => d.tmax ?? -99));
  const tmin = Math.min(...dias.map((d) => d.tmin ?? 99));
  const valores = [
    { val: `${fmt(hoje?.chuvaMm)} mm`, sub: `${fmt(hoje?.probabilidade, 0)}% de prob.` },
    { val: `${fmt(amanha?.chuvaMm)} mm`, sub: `${fmt(amanha?.probabilidade, 0)}% de prob.` },
    { val: `${fmt(soma(chuvas, 3))} mm` },
    { val: `${fmt(soma(chuvas, 7))} mm` },
    { val: `${fmt(tmax, 0)}°C`, sub: `mín. ${fmt(tmin, 0)}°C` },
    { val: `${fmt(umidadeAtual, 0)}%`, sub: 'agora' },
  ];

  return (
    <>
      <Secao titulo="Resumo do município" subtitulo="Principais números da previsão para a localidade selecionada." icone="bi-clipboard-data">
        {r.desatualizado && <div className="sssp-status is-error mb-2">Open-Meteo indisponível agora; previsão de {dataHora(r.obtidoEm)}.</div>}
        <Cartoes valores={valores} />
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
            Atualizado em {dataHora(r.obtidoEm)} · <FonteOpenMeteo />
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

/** Localiza o município (IBGE + geocodificação) e então busca a previsão. */
async function PrevisaoDoLocal({ municipio }: { municipio: string }) {
  const local = await localizar(municipio);
  return local.ok ? <PrevisaoMunicipio local={local.local} /> : null;
}

async function StatusLocal({ municipio }: { municipio: string }) {
  const local = await localizar(municipio);
  return (
    <div className={`sssp-status mt-3${local.ok ? '' : ' is-error'}`}>
      {local.ok ? (municipio ? `${local.local.nome} selecionado.` : 'São Paulo selecionado como referência principal.') : local.mensagem}
    </div>
  );
}

/** Sugestões do campo de município (lista do IBGE); chegam depois do formulário. */
async function ListaMunicipios() {
  const lista = await municipiosSP();
  if (!lista.ok) return null;
  return (
    <datalist id="municipios-sp">
      {lista.dados.map((m) => (
        <option key={m.codigoIbge} value={m.nome} />
      ))}
    </datalist>
  );
}

/** Formulário e títulos na hora; previsão e sugestões chegam cada uma quando a sua fonte responder. */
export default async function Previsao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const municipio = texto(sp.municipio, 80);

  return (
    <Principal>
      <SecaoBusca>
        <Form action="" scroll={false} className="prev-busca">
          <div className="sssp-field">
            <label htmlFor="buscaMunicipio">Município</label>
            <input
              id="buscaMunicipio"
              name="municipio"
              list="municipios-sp"
              defaultValue={municipio || 'São Paulo'}
              placeholder="Digite o nome"
              autoComplete="off"
              required
            />
            <Suspense fallback={null}>
              <ListaMunicipios />
            </Suspense>
          </div>
          <button className="btn btn-primary" type="submit">
            <i className="bi bi-cloud-sun me-2" />
            Ver previsão
          </button>
        </Form>
        <Suspense fallback={<Consultando className="sssp-status mt-3" />}>
          <StatusLocal municipio={municipio} />
        </Suspense>
      </SecaoBusca>

      <Suspense fallback={<PrevisaoEsqueleto nome={municipio || 'São Paulo'} />}>
        <PrevisaoDoLocal municipio={municipio} />
      </Suspense>
    </Principal>
  );
}
