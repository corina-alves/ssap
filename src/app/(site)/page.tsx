import Link from 'next/link';
import { Suspense } from 'react';
import '@/styles/legado/estilo-inicio.css';
import '@/styles/legado/index.css';
import '@/styles/legado/index-inline.css';
import '@/styles/legado/pagina-inicio-volume.css';
import '@/styles/legado/pagina-inicio-faixas.css';
import '@/styles/legado/pagina-inicio-salas.css';
import '@/styles/legado/pagina-inicio-hero.css';
import { texto } from '@/components/paginacao';
import { dataBr, dataHora } from '@/lib/formato';
import { hojeSp } from '@/lib/integracoes/comum';
import { municipiosSP } from '@/lib/integracoes/ibge';
import { previsaoSistemas } from '@/lib/integracoes/openmeteo';
import { chuvaAgora } from '@/lib/integracoes/sibh';
import { AcompanhamentoVolume } from './acompanhamento-volume';
import { FaixasAtuacao } from './faixas-atuacao';
import { PrevisaoHero } from './previsao-hero';
import { previsaoHero } from './previsao-hero-acao';
import { SalasSituacao } from './salas-situacao';

/** Página inicial — mesma estrutura do index.php do site PHP. */

const fmt = (v: number | null | undefined, casas = 1, suf = '') =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}${suf}`;
const soma = (vs: (number | null)[], n: number) => vs.slice(0, n).reduce<number>((s, v) => s + (v ?? 0), 0);

const ACESSO_RAPIDO = [
  { href: '/monitoramento_hidrologico', cor: 'card-blue', icone: 'bi-broadcast-pin', titulo: 'Monitoramento', texto: 'Rede de chuvas, rios, níveis e vazões.' },
  { href: '/reservatorios', cor: 'card-cyan', icone: 'bi-droplet-half', titulo: 'Reservatórios', texto: 'Volumes, descargas e curvas operacionais.' },
  { href: '/precipitacao', cor: 'card-green', icone: 'bi-cloud-rain-heavy', titulo: 'Precipitação', texto: 'Chuva observada nos sistemas produtores.' },
  { href: '/vazao', cor: 'card-orange', icone: 'bi-water', titulo: 'Vazões', texto: 'Vazão natural, afluência e médias históricas.' },
  { href: '/protocolo_escassez', cor: 'card-purple', icone: 'bi-shield-exclamation', titulo: 'Escassez Hídrica', texto: 'Estágios, indicadores e ações de contingência.' },
  { href: 'https://hidroapp.spaguas.sp.gov.br/', cor: 'card-red', icone: 'bi-bar-chart-line', titulo: 'HidroApp', texto: 'Indicadores para apoio à gestão hídrica.', externo: true },
];

const DESTAQUES = [
  { href: 'https://apps.spaguas.sp.gov.br/sibh/chuva_agora/', img: 'chuvaagora.png', cor: 'azul', icone: 'bi-cloud-drizzle', titulo: 'Chuva Agora', texto: 'Monitoramento em tempo real das chuvas registradas no Estado.', acao: 'Acessar mapa', externo: true },
  { href: 'https://hidroapp.spaguas.sp.gov.br/', img: 'hidroapp.png', cor: 'verde', icone: 'bi-bar-chart-line', titulo: 'HidroApp', texto: 'Indicadores de disponibilidade, clima e vulnerabilidade hídrica.', acao: 'Acessar indicadores', externo: true },
  { href: 'https://www.saisp.br/estaticos/sitenovo/home.html', img: null, cor: 'indigo', icone: 'bi-bullseye', titulo: 'Radar SP Águas', texto: 'Acompanhamento meteorológico e radar de Ponte Nova.', acao: 'Acessar radar', externo: true },
  { href: '/protocolo_escassez', img: 'protocolo_escassez.png', cor: 'laranja', icone: 'bi-file-earmark-text', titulo: 'Protocolo de Escassez', texto: 'Consulte o enquadramento e as medidas previstas para cada estágio.', acao: 'Consultar estágios' },
];

function Atalho({ href, externo, className, style, children }: { href: string; externo?: boolean; className: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return externo ? (
    <a href={href} target="_blank" rel="noopener" className={className} style={style}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className} style={style}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------

/** Lista de municípios e previsão inicial do cartão; a troca de município é feita no cliente. */
async function CartaoPrevisao({ municipio }: { municipio: string }) {
  const [lista, inicial] = await Promise.all([municipiosSP(), previsaoHero(municipio)]);
  return <PrevisaoHero municipios={lista.ok ? lista.dados.map((m) => m.nome) : ['São Paulo']} municipio={municipio} inicial={inicial} />;
}

async function ChuvaAgora() {
  const r = await chuvaAgora(0.2);
  const cabeca = (titulo: string, sub: string, selo: string) => (
    <div className="sibh-now-head">
      <div className="sibh-now-title">
        <div className="sibh-now-icon">
          <i className="bi bi-cloud-rain-heavy" />
        </div>
        <div>
          <h3>{titulo}</h3>
          <p>{sub}</p>
        </div>
      </div>
      <span className="sibh-live">{selo}</span>
    </div>
  );
  if (!r.ok) {
    return (
      <div className="sibh-now-panel">
        {cabeca('Monitoramento pluviométrico SIBH', 'Última 1 hora', 'SIBH')}
        <div className="sibh-error">
          <i className="bi bi-cloud-slash fs-3 d-block mb-2" />
          {r.mensagem}
        </div>
      </div>
    );
  }
  const c = r.dados;
  return (
    <div className="sibh-now-panel">
      {cabeca('Monitoramento pluviométrico em tempo real', 'Última 1 hora · SIBH / SP-Águas', r.desatualizado ? 'Últimos dados obtidos' : 'Dados observados')}
      <div className="sibh-now-body">
        <div className="sibh-metrics">
          <div className="sibh-metric is-rain">
            <small>Maior chuva registrada</small>
            <strong>{fmt(c.maximaMm)} mm</strong>
            <span>maior valor entre os postos com leitura</span>
          </div>
          <div className="sibh-metric">
            <small>Chuva média da rede</small>
            <strong>{fmt(c.mediaMm)} mm</strong>
            <span>média das leituras válidas</span>
          </div>
          <div className="sibh-metric is-green">
            <small>Postos com chuva</small>
            <strong>{c.postosComChuva.toLocaleString('pt-BR')}</strong>
            <span>postos com valor acima de 0,2 mm</span>
          </div>
          <div className="sibh-metric">
            <small>Postos com leitura</small>
            <strong>{c.postosMonitorados.toLocaleString('pt-BR')}</strong>
            <span>leituras válidas recebidas do SIBH</span>
          </div>
        </div>
        <div className="sibh-detail-grid">
          <div className="sibh-top">
            <div className="sibh-top-head">
              <strong> TOP 5 DA ÚLTIMA 1 HORA </strong>
              <small className="text-secondary">mm</small>
            </div>
            <ul className="sibh-top-list">
              {c.maiores.length ? (
                c.maiores.map((p, i) => (
                  <li key={p.prefixo}>
                    <div className="sibh-station">
                      <strong>
                        {i + 1}. {p.nome}
                      </strong>
                      <small>{p.municipio ?? p.prefixo}</small>
                    </div>
                    <div className="sibh-rain-value">{fmt(p.chuvaMm)} mm</div>
                  </li>
                ))
              ) : (
                <li>
                  <div className="sibh-station">
                    <strong>Nenhuma chuva acima de 0,2 mm.</strong>
                    <small> Nenhuma estação registrou volume significativo de chuva na última hora.</small>
                  </div>
                </li>
              )}
            </ul>
          </div>
          <div className="sibh-summary">
            <div>
              <div className="sibh-summary-icon">
                <i className="bi bi-activity" />
              </div>
              <h4>
                {c.postosComChuva > 0
                  ? 'Há registro de chuva na rede hidrometeorológica do Sistema Integrado de Bacias Hidrográficas (SIBH).'
                  : 'Sem chuva significativa na última hora na rede do SIBH.'}
              </h4>
              <p>
                Este resumo é calculado com as leituras disponibilizadas pelo SIBH. Para mapa, localização e detalhes de cada posto,
                consulte o Chuva Agora.
              </p>
            </div>
            <p style={{ textAlign: 'center' }}>
              <a className="btn btn-sm btn-success" target="_blank" rel="noopener" href="https://apps.spaguas.sp.gov.br/sibh/chuva_agora/">
                <i className="bi bi-map me-1" /> Acessar Chuva Agora
              </a>
            </p>
          </div>
        </div>
        <div className="sibh-updated">
          <i className="bi bi-clock me-1" />
          Atualizado em {dataHora(r.obtidoEm)}. Dados do SIBH atualizados a cada 10 minutos.
        </div>
      </div>
    </div>
  );
}

async function PrevisaoSistemas() {
  const r = await previsaoSistemas(7);
  if (!r.ok) return <div className="col-12 text-center text-secondary py-4">{r.mensagem}</div>;
  return (
    <>
      {r.dados.map((s) => {
        const hoje = s.chuvaMm[0] ?? null;
        return (
          <div className="col-lg-3 col-md-4 col-sm-6" key={s.sistema}>
            <Link href="/previsao-reservatorios" className={`previsao-card text-center d-block text-decoration-none${s.sistema === 'Cantareira' ? ' cantareira' : ''}`}>
              <h5>{s.sistema}</h5>
              <div className="display-5 my-3" aria-hidden>
                {(hoje ?? 0) >= 5 ? '🌧️' : '⛅'}
              </div>
              <strong className="text-info">{fmt(hoje)} mm</strong>
              <br />
              <small className="text-secondary">Chuva hoje</small>
              <hr />
              <small>
                Próx. 72h: <strong>{fmt(soma(s.chuvaMm, 3))} mm</strong>
              </small>
              <br />
              <small>
                Prob. chuva: <strong>{fmt(s.probabilidade[0] ?? null, 0, '%')}</strong>
              </small>
              <br />
              <small>
                🌙 {fmt(s.tmin[0] ?? null, 1, '°C')} | ☀️ {fmt(s.tmax[0] ?? null, 1, '°C')}
              </small>
            </Link>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------

export default async function Inicio({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const municipio = texto((await searchParams).municipio, 80) || 'São Paulo';

  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="row align-items-center g-5">
            <div className="col-lg-7">
              <div className="hero-content">
                <div className="hero-tag">
                  <i className="bi bi-broadcast-pin" />
                  Monitoramento hidrológico e meteorológico
                </div>
                <h1>
                  Sala de Situação
                  <span>Alfredo Pisani</span>
                </h1>
                <p>
                  Monitoramento integrado de chuvas, níveis, vazões, reservatórios e condições meteorológicas para apoio à gestão dos
                  recursos hídricos do Estado de São Paulo.
                </p>
                <div className="hp-estado">
                  <strong>Monitoramento ativo</strong>
                  <span>Dados hidrológicos • meteorológicos • reservatórios</span>
                </div>
                <div className="hero-actions">
                  <a href="#painel" className="btn btn-primary">
                    <i className="bi bi-bar-chart-fill" />
                    Acessar painel
                    <i className="bi bi-arrow-right" />
                  </a>
                  <a href="https://apps.spaguas.sp.gov.br/sibh/chuva_agora/" target="_blank" rel="noopener" className="btn btn-outline-light">
                    <i className="bi bi-cloud-rain-heavy-fill" />
                    Chuva Agora
                    <i className="bi bi-arrow-right" />
                  </a>
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="hero-weather-card">
                <div className="hero-weather-header">
                  <div className="hero-weather-icon">
                    <i className="bi bi-geo-alt-fill" />
                  </div>
                  <h2>Previsão meteorológica</h2>
                  <span className="hp-data">
                    <i className="bi bi-calendar3" />
                    {dataBr(hojeSp())}
                  </span>
                </div>
                <Suspense fallback={<div className="text-secondary py-4 text-center">Carregando previsão...</div>}>
                  <CartaoPrevisao municipio={municipio} />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="main-area" id="painel">
        <div className="container">
          <section className="mb-5">
            <div className="section-head">
              <div>
                <h2>Acesso rápido</h2>
                <p>Principais áreas de consulta e acompanhamento.</p>
              </div>
            </div>
            <div className="row row-cols-2 row-cols-md-3 row-cols-xl-6 g-3">
              {ACESSO_RAPIDO.map((a) => (
                <div className="col" key={a.titulo}>
                  <Atalho href={a.href} externo={a.externo} className={`quick-card ${a.cor} d-block`}>
                    <div className="quick-icon">
                      <i className={`bi ${a.icone}`} />
                    </div>
                    <strong>{a.titulo}</strong>
                    <p>{a.texto}</p>
                    <span className="quick-arrow">
                      <i className="bi bi-arrow-right" />
                    </span>
                  </Atalho>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-5 sibh-now-section" id="chuva-agora-sibh">
            <div className="section-head">
              <div>
                <h2>Chuva Agora</h2>
                <p>Leituras observadas na rede pluviométrica da SP-Águas na última hora.</p>
              </div>
            </div>
            <Suspense fallback={<div className="sibh-now-panel"><div className="sibh-now-body"><div className="sibh-metrics"><div className="sibh-skeleton" /><div className="sibh-skeleton" /><div className="sibh-skeleton" /><div className="sibh-skeleton" /></div></div></div>}>
              <ChuvaAgora />
            </Suspense>
          </section>

          <section className="mb-5">
            <div className="section-head">
              <div>
                <h2>Acompanhamento de Volume</h2>
                <p>Evolução do Cantareira e documentos de referência.</p>
              </div>
            </div>
            <Suspense fallback={<div className="text-secondary py-4 text-center">Carregando dados...</div>}>
              <AcompanhamentoVolume />
            </Suspense>
          </section>

          <section className="systems-wrap" id="sistemas">
            <div className="section-head">
              <div>
                <h2>Previsão dos Sistemas Produtores</h2>
                <p>Chuva, probabilidade e temperatura nas áreas de influência da RMSP.</p>
              </div>
              <a href="https://sssp.spaguas.sp.gov.br/ssdsp/" className="btn btn-sm btn-primary p-2" target="_blank" rel="noopener">
                Acessar SSD
                <i className="bi bi-box-arrow-up-right ms-1" />
              </a>
            </div>
            <div className="row g-3">
              <Suspense fallback={<div className="col-12 text-center text-secondary py-4">Carregando previsão dos sistemas produtores...</div>}>
                <PrevisaoSistemas />
              </Suspense>
            </div>
          </section>

          <section className="mt-5">
            <div className="section-head">
              <div>
                <h2>Rede de Salas de Situação</h2>
                <p>Parcerias regionais para monitoramento e acompanhamento das condições hidrológicas.</p>
              </div>
            </div>
            <SalasSituacao />
          </section>

          <section className="mt-5">
            <div className="section-head">
              <div>
                <h2>Acompanhamento das FAIXAS de atuação</h2>
                <p>
                  <strong>SP-Águas e Arsesp:</strong> Integração de dados e acompanhamento das condições hidrológicas.
                </p>
              </div>
            </div>
            <Suspense fallback={<div className="text-secondary py-4 text-center">Carregando dados...</div>}>
              <FaixasAtuacao />
            </Suspense>
          </section>

          <section className="mt-5">
            <div className="section-head">
              <div>
                <h2>Destaques e serviços</h2>
                <p>Acesso a produtos e plataformas de monitoramento.</p>
              </div>
            </div>
            <div className="row row-cols-1 row-cols-md-2 row-cols-xl-4 g-3">
              {DESTAQUES.map((d) => (
                <div className="col" key={d.titulo}>
                  <Atalho href={d.href} externo={d.externo} className={`dq-card dq-card--${d.cor}`}>
                    {d.img && <span className="dq-card__fundo" style={{ backgroundImage: `url('/legado/img/${d.img}')` }} />}
                    <span className="dq-card__icone">
                      <i className={`bi ${d.icone}`} />
                    </span>
                    <h3>{d.titulo}</h3>
                    <p>{d.texto}</p>
                    <span className="dq-card__acao">
                      {d.acao}
                      <i className="bi bi-arrow-right" />
                    </span>
                  </Atalho>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
