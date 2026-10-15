import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Cabecalho } from '@/components/acesso/pecas';
import { ScriptsLegado } from '@/components/acesso/scripts-legado';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import limites from '@/conteudo/ugrhi.json';
import { acl } from '@/lib/auth/acl';
import { REGIONAIS, regionalDoPonto } from '@/lib/hidrologia/regionais-defesa-civil';
import {
  chuvaPorMunicipio,
  coordenadasPostos,
  HORAS_CHUVA,
  hora,
  LIMITE_CHUVA_MM,
  m,
  mapaUgrhi,
  SITUACOES,
  situacaoRios,
  texto,
  textoChuvaWhatsapp,
  textoWhatsapp,
  UGRHIS,
  type PontoChuva,
  type Posto,
  type Situacao,
} from '@/lib/hidrologia/situacao-rios';
import { Comunicado } from './comunicado';
import { MapaRegionais, type PostoMapa, type RegionalMapa } from './mapa-regionais';

export const metadata: Metadata = { title: 'Defesa Civil' };

const ORDEM = Object.keys(SITUACOES) as Situacao[];
const GRAVES = ['atencao', 'alerta', 'emergencia', 'extravasamento'] as const;
const ICONES: Record<Situacao, string> = {
  extravasamento: 'bi-exclamation-octagon-fill',
  emergencia: 'bi-exclamation-triangle-fill',
  alerta: 'bi-exclamation-circle-fill',
  atencao: 'bi-eye-fill',
  normal: 'bi-check-circle-fill',
};
const SETAS = { elevacao: ['bi-arrow-up-right', 'Subindo'], reducao: ['bi-arrow-down-right', 'Descendo'], estavel: ['bi-arrow-right', 'Estável'] } as const;

const nomeUgrhi = (u: number) => (UGRHIS[u] ? `UGRHI ${u} — ${UGRHIS[u]}` : 'Sem UGRHI');
const pior = (lista: Posto[]): Situacao => lista[0]?.situacao ?? 'normal'; // já vem ordenado por gravidade
/** Regional da Defesa Civil onde o ponto cai (pela coordenada). */
const nomeRegionalDoPonto = (lat: number, lng: number) => {
  const r = regionalDoPonto(lat, lng);
  return r === null ? '—' : REGIONAIS[r]!.nome;
};
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

type Geometria = { type: string; coordinates: unknown };
/** Limite (GeoJSON) de uma UGRHI — camada LimiteUGRHI do DataGEO. */
function limiteUgrhi(u: number): Geometria | null {
  const f = (limites as { features: { properties: { codigo: number }; geometry: Geometria }[] }).features.find((x) => Number(x.properties.codigo) === u);
  return f?.geometry ?? null;
}

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtArquivo = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Defesa Civil — painel de alerta dos rios, córregos e piscinões.
 *   1. Resumo do estado e mapa das regionais da Defesa Civil, com os pontos
 *      monitorados na cor da situação e a contagem por regional.
 *   2. Os 15 municípios do estado com os maiores acumulados de chuva.
 *   3. Por UGRHI: mapa (limite, chuva acumulada acima de 10 mm e estações
 *      telemétricas, que vira imagem para o WhatsApp), as mensagens prontas
 *      para copiar e as tabelas dos pontos e da chuva acumulada por posto.
 * Aberto a quem vê o painel de alguma Sala de Situação.
 */
export default async function DefesaCivil({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await acl();
  if (!a.podeEmAlguma('visualizar_dashboard')) redirect('/acesso/sem-acesso');

  const sp = await searchParams;
  const [situacao, coordenadas] = await Promise.all([situacaoRios(um(sp.atualizar) === '1'), coordenadasPostos()]);
  const { postos } = situacao;

  // Regional da Defesa Civil de cada ponto (pela coordenada do posto no SIBH).
  const regionalDe = new Map<string, number>();
  const postosMapa: PostoMapa[] = [];
  for (const p of postos) {
    const c = coordenadas[p.id];
    if (!c) continue;
    const r = regionalDoPonto(c.lat, c.lng);
    if (r !== null) regionalDe.set(p.id, r);
    postosMapa.push({ id: p.id, rotulo: `${p.prefixo} — ${p.nome}`, cidade: p.cidade, lat: c.lat, lng: c.lng, situacao: p.situacao, regional: r === null ? null : REGIONAIS[r]!.nome });
  }
  const nomeRegional = (p: Posto) => (regionalDe.has(p.id) ? REGIONAIS[regionalDe.get(p.id)!]!.nome : '—');
  const regionais = REGIONAIS.map((r, i) => {
    const lista = postos.filter((p) => regionalDe.get(p.id) === i); // já em ordem de gravidade
    const contagem = Object.fromEntries(ORDEM.map((k) => [k, lista.filter((p) => p.situacao === k).length])) as Record<Situacao, number>;
    return { ...r, ordem: i, lista, contagem, pior: lista.length ? pior(lista) : null, total: lista.length, fora: lista.length - contagem.normal };
  });
  const regionaisMapa: RegionalMapa[] = regionais.map(({ nome, centro, pior: p, total, fora }) => ({ nome, centro, pior: p, total, fora }));
  const regionaisTabela = [...regionais].sort(
    (x, y) => (x.pior ? ORDEM.indexOf(x.pior) : 99) - (y.pior ? ORDEM.indexOf(y.pior) : 99) || y.fora - x.fora || x.ordem - y.ordem,
  );
  const semRegional = postos.length - regionalDe.size;

  const porUgrhi = new Map<number, Posto[]>();
  for (const p of postos) porUgrhi.set(p.ugrhi, [...(porUgrhi.get(p.ugrhi) ?? []), p]);
  const ugrhisComPosto = [...porUgrhi.keys()].sort(
    (x, y) => ORDEM.indexOf(pior(porUgrhi.get(x)!)) - ORDEM.indexOf(pior(porUgrhi.get(y)!)) || x - y,
  );

  const filtro = um(sp.ugrhi);
  const horas = HORAS_CHUVA[Number(um(sp.horas))] ? Number(um(sp.horas)) : 24; // chuva acumulada do mapa
  const chuvaUgrhi = /^d+$/.test(um(sp.chuva_ugrhi)) && UGRHIS[Number(um(sp.chuva_ugrhi))] ? Number(um(sp.chuva_ugrhi)) : null; // ranking de chuva: estado ou uma UGRHI
  const mostrar =
    filtro === 'todas'
      ? ugrhisComPosto
      : /^\d+$/.test(filtro) && UGRHIS[Number(filtro)]
        ? [Number(filtro)] // com ou sem posto com cota: mostra o mapa
        : ugrhisComPosto.filter((u) => pior(porUgrhi.get(u)!) !== 'normal');

  const totais = Object.fromEntries(ORDEM.map((k) => [k, postos.filter((p) => p.situacao === k).length])) as Record<Situacao, number>;
  const situacaoPorId = new Map(postos.map((p) => [p.id, p.situacao]));
  const geradoEm = new Date(situacao.gerado_em * 1000);
  const quando = `${fmtDataHora.format(geradoEm)} ${hora(situacao.gerado_em)}`;

  const [blocos, chuvaEstado] = await Promise.all([
    Promise.all(mostrar.map(async (u) => ({ u, lista: porUgrhi.get(u) ?? [], mapa: await mapaUgrhi(u, horas) }))),
    chuvaPorMunicipio(horas, chuvaUgrhi),
  ]);

  const parametros = new URLSearchParams();
  if (filtro) parametros.set('ugrhi', filtro);
  if (horas !== 24) parametros.set('horas', String(horas));
  if (chuvaUgrhi !== null) parametros.set('chuva_ugrhi', String(chuvaUgrhi));
  parametros.set('atualizar', '1');

  return (
    <>
      <link rel="stylesheet" href="/acesso/vendor/leaflet/leaflet.css" precedence="default" />
      <Cabecalho
        titulo="Defesa Civil — situação dos rios, córregos e piscinões"
        subtitulo={`Postos fluviométricos do SIBH com cotas de alerta, por regional da Defesa Civil e por UGRHI. Dados de ${hora(situacao.gerado_em)} (atualiza a cada 3 min).`}
        trilha={[
          ['Painel', '/acesso'],
          ['Defesa Civil', null],
        ]}
        acoes={
          <a className="btn btn-outline-primary" href={`/acesso/defesa_civil?${parametros}`}>
            <i className="bi bi-arrow-clockwise me-1" /> Atualizar
          </a>
        }
      />

      {situacao.falhas.length > 0 && (
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle" /> O SIBH não respondeu tudo agora ({situacao.falhas.join(', ')}).{' '}
          {postos.length ? 'Parte dos dados pode estar desatualizada.' : 'Tente atualizar em instantes.'}
        </div>
      )}

      <div className="row g-2 mb-3">
        {ORDEM.map((k) => (
          <div key={k} className="col-6 col-md">
            <div className={`acesso-kpi dc-kpi dc-kpi--${k}`}>
              <i className={`bi ${ICONES[k]}`} />
              <div>
                <span className="acesso-kpi__valor">{totais[k]}</span>
                <span className="acesso-kpi__rotulo">{SITUACOES[k]}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="acesso-card mb-4">
        <h2 className="acesso-card__titulo">
          <i className="bi bi-shield-shaded" /> Regionais da Defesa Civil
        </h2>
        <div className="row g-3">
          <div className="col-xl-7">
            <MapaRegionais regionais={regionaisMapa} postos={postosMapa} />
            <p className="small text-secondary mt-1 mb-0">
              Triângulos: pontos monitorados, na cor da situação. O número ao lado do nome da regional é a quantidade de pontos fora do normal. Clique
              em um ponto ou em uma regional para ver os detalhes.
            </p>
          </div>
          <div className="col-xl-5">
            <div className="table-responsive dc-regionais">
              <table className="table table-sm align-middle mb-0 dc-tabela">
                <thead>
                  <tr>
                    <th>Regional</th>
                    <th>Situação</th>
                    <th className="text-end">Pontos</th>
                    <th>Fora do normal</th>
                  </tr>
                </thead>
                <tbody>
                  {regionaisTabela.map((r) => (
                    <tr key={r.nome}>
                      <td className="fw-semibold text-nowrap">{r.nome}</td>
                      <td>{r.pior ? <span className={`dc-selo dc-selo--${r.pior}`}>{SITUACOES[r.pior]}</span> : <span className="text-secondary">sem ponto</span>}</td>
                      <td className="text-end">{r.total}</td>
                      <td>
                        {r.fora ? (
                          <span className="d-flex flex-wrap gap-1">
                            {GRAVES.filter((k) => r.contagem[k]).map((k) => (
                              <span
                                key={k}
                                className={`dc-selo dc-selo--${k}`}
                                title={r.lista
                                  .filter((p) => p.situacao === k)
                                  .map((p) => `${p.prefixo} ${p.nome}`)
                                  .join('; ')}
                              >
                                {r.contagem[k]} {SITUACOES[k].toLocaleLowerCase('pt-BR')}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small text-secondary mt-2 mb-0">
              Divisas de <code>regionais_defesa_civil.geojson</code>. As subdivisões I-2.1/I-2.2 e M-4.1/M-4.2 não têm divisa traçada entre si no arquivo e
              aparecem juntas.
              {semRegional > 0 &&
                ` ${semRegional} ${semRegional === 1 ? 'ponto está sem coordenada no SIBH e não entra' : 'pontos estão sem coordenada no SIBH e não entram'} no mapa.`}
            </p>
          </div>
        </div>
      </section>

      <section className="acesso-card mb-4" id="chuva">
        <h2 className="acesso-card__titulo">
          <i className="bi bi-cloud-rain-heavy" /> Chuva — {chuvaEstado.municipios.length || 15} municípios com os maiores acumulados nas últimas {HORAS_CHUVA[horas]}
        </h2>
        <form className="row g-2 align-items-end mb-3" method="get" action="/acesso/defesa_civil#chuva">
          {filtro && <input type="hidden" name="ugrhi" value={filtro} />}
          {horas !== 24 && <input type="hidden" name="horas" value={horas} />}
          <div className="col-md-6">
            <label className="form-label small" htmlFor="chuva_ugrhi">
              Abrangência
            </label>
            <SelectAutoEnvio className="form-select" id="chuva_ugrhi" name="chuva_ugrhi" defaultValue={chuvaUgrhi === null ? '' : String(chuvaUgrhi)}>
              <option value="">Todo o estado</option>
              {Object.keys(UGRHIS).map((u) => (
                <option key={u} value={u}>
                  {nomeUgrhi(Number(u))}
                </option>
              ))}
            </SelectAutoEnvio>
          </div>
        </form>
        {chuvaEstado.falhou && (
          <div className="alert alert-warning py-2 small">O SIBH não respondeu agora; a lista usa a última cópia disponível da chuva acumulada.</div>
        )}
        {chuvaEstado.municipios.length ? (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0 dc-tabela">
              <thead>
                <tr>
                  <th className="text-end">#</th>
                  <th>Município</th>
                  <th>Regional</th>
                  <th>UGRHI</th>
                  <th className="text-end">Chuva (mm)</th>
                  <th>Posto com o maior acumulado</th>
                </tr>
              </thead>
              <tbody>
                {chuvaEstado.municipios.map((c, i) => (
                  <tr key={c.cidade}>
                    <td className="text-end text-secondary">{i + 1}</td>
                    <td className="fw-semibold">{c.cidade}</td>
                    <td className="text-nowrap">{nomeRegionalDoPonto(c.lat, c.lng)}</td>
                    <td>{nomeUgrhi(c.ugrhi)}</td>
                    <td className="text-end fw-semibold">{m(c.v, 1)}</td>
                    <td>{c.posto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mb-0 text-secondary">
            Nenhum município com chuva registrada nas últimas {HORAS_CHUVA[horas]}
            {chuvaUgrhi !== null && ` na ${nomeUgrhi(chuvaUgrhi)}`}.
          </p>
        )}
        <p className="small text-secondary mt-2 mb-0">
          {chuvaUgrhi === null ? 'Todo o estado' : `Só os pluviômetros da ${nomeUgrhi(chuvaUgrhi)}`}. O acumulado do município é o do pluviômetro que mais
          registrou chuva nele. O período é o escolhido em &quot;Chuva no mapa&quot;, logo abaixo.
        </p>
      </section>

      <h2 className="h5 mb-2">
        <i className="bi bi-water" /> Situação por UGRHI
      </h2>
      <form className="acesso-card mb-3 row g-2 align-items-end mx-0" method="get">
        {chuvaUgrhi !== null && <input type="hidden" name="chuva_ugrhi" value={chuvaUgrhi} />}
        <div className="col-md-6">
          <label className="form-label small" htmlFor="ugrhi">
            UGRHI
          </label>
          <SelectAutoEnvio className="form-select" id="ugrhi" name="ugrhi" defaultValue={filtro}>
            <option value="">UGRHIs com algum ponto fora do normal</option>
            <option value="todas">Todas as UGRHIs</option>
            {Object.keys(UGRHIS).map((u) => (
              <option key={u} value={u}>
                {nomeUgrhi(Number(u))}
                {porUgrhi.has(Number(u)) ? ` (${porUgrhi.get(Number(u))!.length} pontos)` : ''}
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
        <div className="col-md-2">
          <label className="form-label small" htmlFor="horas">
            Chuva no mapa
          </label>
          <SelectAutoEnvio className="form-select" id="horas" name="horas" defaultValue={String(horas)}>
            {Object.entries(HORAS_CHUVA).map(([h, rot]) => (
              <option key={h} value={h}>
                Últimas {rot}
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
        <div className="col-md-4 small text-secondary">
          {postos.length} pontos monitorados no estado (com cota de alerta e leitura na última hora). Nível em metros; cotas ortométricas
          aparecem com a altitude.
        </div>
      </form>

      {mostrar.length === 0 && (
        <div className="acesso-card">
          <p className="mb-0">
            <i className="bi bi-check-circle-fill text-success" />{' '}
            {postos.length
              ? 'Todos os pontos monitorados estão em condição normal. Escolha uma UGRHI acima para ver o texto e a lista.'
              : 'Sem dados do SIBH no momento.'}
          </p>
        </div>
      )}

      {blocos.map(({ u, lista, mapa }) => {
        const fora = lista.filter((p) => p.situacao !== 'normal');
        const limite = limiteUgrhi(u);
        const nFlu = mapa.estacoes.filter((e) => e.t === 'flu').length;
        const cfgMapa = {
          ugrhi: u,
          titulo: nomeUgrhi(u),
          subtitulo: `Chuva acumulada nas últimas ${HORAS_CHUVA[horas]} (postos acima de ${m(LIMITE_CHUVA_MM, 0)} mm) e estações telemétricas · ${quando}`,
          limite,
          chuva: mapa.chuva,
          estacoes: mapa.estacoes.map((e) => ({ ...e, s: situacaoPorId.get(e.id) ?? null })),
          arquivo: `mapa_ugrhi${u}_${fmtArquivo.format(geradoEm).replace(/[-:]/g, '').replace(' ', '_')}`,
          mensagem: `zap-${u}`,
        };
        const tabelas: [string, Posto[], boolean][] = [];
        if (fora.length) tabelas.push(['Pontos fora do normal', fora, true]);
        if (lista.length) tabelas.push([`Todos os ${lista.length} pontos monitorados`, lista, false]);
        // Chuva acumulada no período escolhido, do maior para o menor.
        const periodoChuva = `nas últimas ${HORAS_CHUVA[horas]}`;
        const tabelasChuva: [string, PontoChuva[], boolean][] = [];
        if (mapa.chuva.length) tabelasChuva.push([`Chuva acima de ${m(LIMITE_CHUVA_MM, 0)} mm ${periodoChuva} — ${mapa.chuva.length} ${mapa.chuva.length === 1 ? 'posto' : 'postos'}`, mapa.chuva, true]);
        if (mapa.chuva_todos.length) tabelasChuva.push([`Chuva ${periodoChuva} — ${mapa.chuva_todos.length === 1 ? 'o único posto pluviométrico' : `todos os ${mapa.chuva_todos.length} postos pluviométricos`} com leitura`, mapa.chuva_todos, false]);

        return (
          <section key={u} className={`acesso-card mb-3 dc-ugrhi dc-ugrhi--${pior(lista)}`}>
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <h2 className="h5 mb-0">{nomeUgrhi(u)}</h2>
              <div className="d-flex flex-wrap gap-1">
                {ORDEM.map((k) => {
                  const n = lista.filter((p) => p.situacao === k).length;
                  return n ? (
                    <span key={k} className={`dc-selo dc-selo--${k}`}>
                      {n} {SITUACOES[k].toLocaleLowerCase('pt-BR')}
                    </span>
                  ) : null;
                })}
              </div>
            </div>

            <div className="row g-3 mb-3">
              {limite && (
                <div className="col-xl-7">
                  <div className="dc-mapa-bloco">
                    <div className="small mb-2">
                      <strong>
                        <i className="bi bi-map" /> Mapa da UGRHI
                      </strong>{' '}
                      — {mapa.chuva.length} {mapa.chuva.length === 1 ? 'posto' : 'postos'} com chuva acima de {m(LIMITE_CHUVA_MM, 0)} mm nas últimas{' '}
                      {HORAS_CHUVA[horas]}
                      {mapa.chuva[0] ? ` (máx. ${m(mapa.chuva[0].v, 1)} mm)` : ''} · {mapa.estacoes.length - nFlu} pluviométricas e {nFlu} fluviométricas
                      telemétricas
                    </div>
                    {mapa.falhas.length > 0 && (
                      <div className="alert alert-warning py-2 small mb-2">
                        O SIBH não respondeu agora ({mapa.falhas.join(', ')}); o mapa usa a última cópia disponível.
                      </div>
                    )}
                    <div
                      className="dc-mapa"
                      id={`mapa-${u}`}
                      data-dc-mapa={JSON.stringify(cfgMapa)}
                      role="img"
                      aria-label={`Mapa da ${nomeUgrhi(u)} com chuva acumulada e estações telemétricas`}
                    />
                    <div className="d-flex flex-wrap gap-2 mt-2">
                      <button type="button" className="btn btn-sm btn-success" data-dc-enviar={`mapa-${u}`}>
                        <i className="bi bi-whatsapp" /> Enviar mapa + mensagem
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" data-dc-baixar={`mapa-${u}`}>
                        <i className="bi bi-download" /> Baixar mapa (imagem)
                      </button>
                    </div>
                    <p className="small text-secondary mt-1 mb-0" data-dc-aviso={`mapa-${u}`} hidden />
                  </div>
                </div>
              )}
              <div className={limite ? 'col-xl-5' : 'col-12'}>
                <ul className="nav nav-tabs dc-abas" role="tablist">
                  <li className="nav-item" role="presentation">
                    <button className="nav-link active" type="button" role="tab" data-bs-toggle="tab" data-bs-target={`#aba-zap-${u}`} aria-controls={`aba-zap-${u}`} aria-selected="true">
                      <i className="bi bi-whatsapp dc-zap-icone" /> WhatsApp
                    </button>
                  </li>
                  <li className="nav-item" role="presentation">
                    <button className="nav-link" type="button" role="tab" data-bs-toggle="tab" data-bs-target={`#aba-texto-${u}`} aria-controls={`aba-texto-${u}`} aria-selected="false">
                      <i className="bi bi-megaphone" /> Comunicado
                    </button>
                  </li>
                </ul>
                <div className="tab-content dc-abas__conteudo">
                  <div className="tab-pane fade show active" id={`aba-zap-${u}`} role="tabpanel">
                    <label className="form-label small text-secondary" htmlFor={`zap-${u}`}>
                      Mensagem com ícones; *negrito* aparece em negrito no WhatsApp.
                    </label>
                    <textarea
                      className="form-control dc-texto dc-zap"
                      id={`zap-${u}`}
                      rows={Math.min(22, 14 + 3 * fora.length)}
                      defaultValue={textoWhatsapp(lista, nomeUgrhi(u), situacao.gerado_em, textoChuvaWhatsapp(mapa.chuva, horas))}
                    />
                    <div className="mt-2">
                      <button type="button" className="btn btn-sm btn-success" data-copiar={`zap-${u}`}>
                        <i className="bi bi-clipboard" /> Copiar mensagem
                      </button>{' '}
                      <button type="button" className="btn btn-sm btn-outline-success" data-whatsapp={`zap-${u}`}>
                        <i className="bi bi-whatsapp" /> Abrir no WhatsApp
                      </button>
                      <span className="small text-success ms-2" data-copiado-de={`zap-${u}`} hidden>
                        Copiado!
                      </span>
                    </div>
                  </div>
                  <div className="tab-pane fade" id={`aba-texto-${u}`} role="tabpanel">
                    <p className="small text-secondary mb-2">
                      Texto corrido, para e-mail ou ofício. Clique para corrigir; ao copiar, o negrito vai junto.
                    </p>
                    <Comunicado
                      key={situacao.gerado_em}
                      titulo={`Situação dos rios e córregos — ${nomeUgrhi(u)}`}
                      quando={`Dados de ${quando}`}
                      texto={texto(lista, (t) => `**${t}**`)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {tabelas.map(([titulo, linhas, aberta]) => (
              <details key={titulo} className="dc-detalhes" open={aberta}>
                <summary>{titulo}</summary>
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0 dc-tabela">
                    <thead>
                      <tr>
                        <th>Situação</th>
                        <th>Posto</th>
                        <th>Município</th>
                        <th>Regional</th>
                        <th className="text-end">Nível (m)</th>
                        <th>Hora</th>
                        <th>Tendência (1 h)</th>
                        <th className="text-end">Atenção</th>
                        <th className="text-end">Alerta</th>
                        <th className="text-end">Emergência</th>
                        <th className="text-end">Extravas.</th>
                        <th className="text-end">Acima da cota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <span className={`dc-selo dc-selo--${p.situacao}`}>{SITUACOES[p.situacao]}</span>
                          </td>
                          <td>
                            <strong>{p.prefixo}</strong> {p.nome}
                            {p.piscinao && <span className="badge text-bg-light border ms-1">piscinão</span>}
                          </td>
                          <td>{p.cidade}</td>
                          <td className="text-nowrap">{nomeRegional(p)}</td>
                          <td className="text-end fw-semibold">{m(p.nivel, 3)}</td>
                          <td>
                            {p.hora ? (
                              hora(p.hora)
                            ) : (
                              <span className="text-secondary" title="Média da última hora">
                                média 1 h
                              </span>
                            )}
                          </td>
                          <td>
                            {p.tendencia ? (
                              <>
                                <i className={`bi ${SETAS[p.tendencia][0]}`} /> {SETAS[p.tendencia][1]}{' '}
                                <small className="text-secondary">
                                  ({(p.variacao_1h ?? 0) >= 0 ? '+' : ''}
                                  {m(p.variacao_1h, 3)} m)
                                </small>
                              </>
                            ) : (
                              <span className="text-secondary">—</span>
                            )}
                          </td>
                          {GRAVES.map((k) => (
                            <td key={k} className="text-end">
                              {m(p.cotas[k], 2)}
                            </td>
                          ))}
                          <td className="text-end">{p.acima !== null ? `+${m(p.acima, 3)} m` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}

            {tabelasChuva.map(([titulo, linhas, aberta]) => (
              <details key={titulo} className="dc-detalhes" open={aberta}>
                <summary>{titulo}</summary>
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0 dc-tabela">
                    <thead>
                      <tr>
                        <th>Posto</th>
                        <th>Município</th>
                        <th>Regional</th>
                        <th className="text-end">Chuva (mm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.p}</strong> {c.n}
                          </td>
                          <td>{c.c}</td>
                          <td className="text-nowrap">{nomeRegionalDoPonto(c.lat, c.lng)}</td>
                          <td className="text-end fw-semibold">{m(c.v, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </section>
        );
      })}

      <p className="small text-secondary">
        Fonte: SIBH — SP Águas. &quot;Acima da cota&quot; = quanto o nível passou da cota da situação. A tendência compara a última leitura
        com a de cerca de 1 h antes. Postos que não passaram de nenhuma cota mostram a média da última hora.
      </p>

      <ScriptsLegado scripts={['/acesso/js/defesa-civil.js', '/acesso/vendor/leaflet/leaflet.js', '/acesso/js/defesa-civil-mapa.js']} />
    </>
  );
}
