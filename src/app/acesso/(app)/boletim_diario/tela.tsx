'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import { Canvas } from '@/components/graficos-php';
import type { DadosDiario } from '@/lib/boletins-sala/diario';
import type { HistoricoMensal } from '@/lib/boletins-sala/diario-historico';

/**
 * Tela do Boletim Diário da SSAP: busca os dados (/api/acesso/boletim_diario/dados),
 * monta as folhas A4 deitadas e deixa tudo editável. As edições ficam neste
 * navegador: as do dia, por dia; o histórico mensal, por mês; os limiares do
 * PPDC, até serem trocados. "Gerar PDF" imprime só as folhas.
 */

const BASE = '/api/acesso/boletim_diario';
const API = `${BASE}/dados`;
// área da imagem do IPMet: [lonMin, latMin, lonMax, latMax] (a mesma de lib/boletins-sala/radares.ts)
const AREA_IPMET = [-56, -27, -42, -18] as const;
const LOGO = '/legado/logo/spaguas.png';

// ------------------------------------------------------------------ edições

type Edicoes = Record<string, string>;
type Guarda = { ed: Edicoes; editar: (k: string, v: string) => void; imagens: Record<string, string>; trocarImagem: (k: string, url: string | null) => void };
const Contexto = createContext<Guarda>({ ed: {}, editar: () => {}, imagens: {}, trocarImagem: () => {} });

/** Onde a edição é guardada: limiares do PPDC ficam; histórico vale pelo mês; o resto, pelo dia. */
const chaveGuarda = (k: string, dia: string) => (k.startsWith('ppdc|') ? 'boletim_diario:ppdc' : k.startsWith('hist|') ? `boletim_diario:hist:${dia.slice(0, 7)}` : `boletim_diario:dia:${dia}`);

function ler(chave: string): Edicoes {
  try {
    return (JSON.parse(localStorage.getItem(chave) || '{}') as Edicoes) || {};
  } catch {
    return {};
  }
}

/** Texto editável: mostra a edição guardada ou o texto padrão (gerado dos dados). */
function Ed({ k, padrao = '', tag: Tag = 'span', className }: { k: string; padrao?: string; tag?: 'span' | 'p' | 'div' | 'td' | 'h1' | 'h2' | 'h3' | 'dd' | 'small'; className?: string }) {
  const { ed, editar } = useContext(Contexto);
  const ref = useRef<HTMLElement>(null);
  const editado = Object.prototype.hasOwnProperty.call(ed, k);
  const valor = editado ? ed[k]! : padrao;
  useEffect(() => {
    if (ref.current && ref.current.innerText !== valor) ref.current.innerText = valor;
  }, [valor]);
  return (
    <Tag
      // @ts-expect-error — a mesma ref serve a todas as tags
      ref={ref}
      className={`${className ?? ''}${editado ? ' editado' : ''}`}
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => editar(k, (e.currentTarget as HTMLElement).innerText)}
      onPaste={(e: ClipboardEvent) => {
        // colar só texto (sem formatação de outro programa)
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text'));
      }}
    />
  );
}

/** Número digitado na tela ("12,5") ou o padrão; null se vazio. */
function useNumero() {
  const { ed } = useContext(Contexto);
  return (k: string, padrao: number | null = null): number | null => {
    if (!Object.prototype.hasOwnProperty.call(ed, k)) return padrao;
    const n = Number(ed[k]!.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    return ed[k]!.trim() === '' || Number.isNaN(n) ? null : n;
  };
}

/**
 * Espaço de imagem: mostra a imagem buscada pelo servidor (`padrao`), se houver;
 * dá para trocar enviando arquivo, colando (Ctrl+V) ou arrastando. A imagem
 * trocada vale só enquanto a página está aberta.
 */
function Imagem({ k, dica, padrao }: { k: string; dica: string; padrao?: string }) {
  const { imagens, trocarImagem } = useContext(Contexto);
  const [falhou, setFalhou] = useState<string | null>(null);
  const url = imagens[k] ?? (padrao && falhou !== padrao ? padrao : undefined);
  const receber = (arquivos: FileList | null | undefined) => {
    const f = [...(arquivos ?? [])].find((a) => a.type.startsWith('image/'));
    if (f) trocarImagem(k, URL.createObjectURL(f));
  };
  return (
    <div
      className={`bd-imagem${url ? '' : ' vazia'}`}
      tabIndex={0}
      onPaste={(e: ClipboardEvent) => receber(e.clipboardData.files)}
      onDragOver={(e: DragEvent) => e.preventDefault()}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        receber(e.dataTransfer.files);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? (
        <img src={url} alt={dica} onError={() => setFalhou(url)} />
      ) : (
        <span>
          {padrao ? `${dica}: não foi possível buscar automaticamente.` : dica}
          <br />
          Clique aqui e cole (Ctrl+V), arraste o arquivo ou use &quot;Enviar imagem&quot;.
        </span>
      )}
      <div className="bd-trocar">
        <label>
          Enviar imagem
          <input type="file" accept="image/*" onChange={(e) => receber(e.target.files)} />
        </label>
        {imagens[k] && (
          <button type="button" onClick={() => trocarImagem(k, null)}>
            {padrao ? 'Voltar à automática' : 'Remover'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- formatos

const n = (v: number | null | undefined, casas = 1) => (v === null || v === undefined ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const dataHoraBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
const lista = (itens: string[]) => (itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : (itens[0] ?? ''));
const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;

// ------------------------------------------------------------------- mapas

type Anel = [number, number][];
type Projecao = { L: number; A: number; X: (lon: number) => number; Y: (lat: number) => number };

/** Projeção plana do estado, corrigida pela latitude média. */
function projetar(contorno: Anel[], L = 560, borda = 10): Projecao | null {
  const pts = contorno.flat();
  if (!pts.length) return null;
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const [lonMin, lonMax, latMin, latMax] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const k = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  const esc = (L - 2 * borda) / ((lonMax - lonMin) * k);
  const r = (v: number) => Math.round(v * 10) / 10;
  return { L, A: Math.round((latMax - latMin) * esc + 2 * borda), X: (lon) => r(borda + (lon - lonMin) * k * esc), Y: (lat) => r(borda + (latMax - lat) * esc) };
}
const caminho = (aneis: Anel[], p: Projecao) => aneis.map((a) => `M${a.map(([x, y]) => `${p.X(x)},${p.Y(y)}`).join('L')}Z`).join('');

function Mapa({ p, rotulo, children }: { p: Projecao | null; rotulo: string; children: ReactNode }) {
  if (!p) return <div className="bd-imagem vazia">Mapa indisponível (malha do IBGE sem resposta).</div>;
  return (
    <div className="bd-mapa">
      <svg viewBox={`0 0 ${p.L} ${p.A}`} role="img" aria-label={rotulo}>
        {children}
      </svg>
    </div>
  );
}

// escala do mapa interpolado (mm) — as mesmas classes do boletim
const ESCALA: [number, string][] = [
  [0, '#e0ffff'], [1, '#00cfff'], [2, '#0a84b8'], [5, '#0000b0'], [7, '#80ff60'], [10, '#00c880'], [15, '#5a8000'], [20, '#005000'],
  [25, '#ffff00'], [30, '#ffc000'], [40, '#ff9a00'], [50, '#d85a00'], [75, '#ffb0f0'], [100, '#ff2080'], [250, '#8000b0'],
];
const corEscala = (v: number | null) => (v === null ? '#f2f2f2' : (ESCALA.findLast(([lim]) => v >= lim) ?? ESCALA[0]!)[1]); // leitura negativa (erro do posto) cai na primeira classe
const CLASSES_POSTO: [number, string, string][] = [[70, '#f0506e', '> 70 mm'], [30, '#f57c00', '30 <> 70 mm'], [10, '#f5b800', '10 <> 30 mm'], [0, '#1ec997', '< 10 mm']];
const corPosto = (v: number) => (CLASSES_POSTO.find(([lim]) => v >= lim) ?? CLASSES_POSTO.at(-1)!)[1];
const CORES_SITUACAO: Record<string, string> = { normal: '#1ec997', atencao: '#b8a000', alerta: '#ffb060', emergencia: '#c800ff', extravasamento: '#f0506e' };
const ORDEM_SITUACAO = ['normal', 'atencao', 'alerta', 'emergencia', 'extravasamento'] as const;

// ------------------------------------------------------------------ folhas

function Topo({ k, titulo }: { k: string; titulo: string }) {
  return (
    <header className="bd-topo">
      <Ed tag="small" k="agencia" padrao="Agência de Águas do Estado de São Paulo" />
      <Ed tag="h2" k={k} padrao={titulo} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO} alt="SP Águas" />
    </header>
  );
}

function Capa({ d }: { d: DadosDiario }) {
  return (
    <section className="bd-pagina bd-capa">
      <svg className="bd-ondas" viewBox="0 0 1123 793" preserveAspectRatio="none" aria-hidden="true">
        <path d="M392 342 C520 150 760 160 1123 120 L1123 190 C820 280 600 230 392 342Z" fill="#c2ebd9" />
        <path d="M356 474 C520 290 780 300 1123 236 L1123 330 C820 430 580 360 356 474Z" fill="#c3d2ee" />
        <path d="M292 614 C480 420 780 440 1123 340 L1123 470 C820 580 540 500 292 614Z" fill="#c2d6fd" />
      </svg>
      <div className="bd-capa-texto">
        <Ed tag="h1" k="capa_titulo" padrao="Boletim Diário" />
        <Ed tag="p" k="capa_sala" padrao="Sala de Situação Alfredo Pisani - SSAP" />
        <Ed tag="p" k="capa_periodo" padrao={`${dataHoraBr(d.periodo.inicio)} até ${dataHoraBr(d.periodo.fim)}`} />
      </div>
      <div className="bd-capa-logos">
        {/* eslint-disable @next/next/no-img-element */}
        <img src={LOGO} alt="SP Águas" />
        <img src="/legado/logo/brasaosp.png" alt="Governo do Estado de São Paulo" />
        {/* eslint-enable @next/next/no-img-element */}
      </div>
    </section>
  );
}

function Pluviometria({ d, p }: { d: DadosDiario; p: Projecao | null }) {
  const postos = useMemo(() => [...d.chuva.postos].sort((a, b) => a.v - b.v), [d]);
  const municipios = useMemo(() => (p ? d.municipios.map((m) => ({ codigo: m.codigo, nome: m.nome, idw: m.idw, d: caminho(m.aneis, p) })) : []), [d, p]);
  const maiores = d.chuva.cidades.filter((c) => c.maxima > 0).slice(0, 5);
  const relato =
    'As imagens acima apresentam o acumulado de precipitação das últimas 24 horas, obtido por interpolação IDW a partir de dados telemétricos. ' +
    (maiores.length
      ? `De acordo com as estações hidrológicas, os maiores volumes de chuva foram registrados nos municípios de ${lista(maiores.map((c) => `${c.cidade} com ${n(c.maxima)} mm`))}.`
      : 'De acordo com as estações hidrológicas, não houve registro de chuva no período.');
  return (
    <section className="bd-pagina">
      <Topo k="t_pluv" titulo="Dados de Pluviometria" />
      <div className="bd-duas">
        <div className="bd-col">
          <Ed tag="h3" className="bd-titulo" k="pluv_t1" padrao="Acumulado de chuva das últimas 24h" />
          <Mapa p={p} rotulo="Acumulado de chuva em 24 horas por posto pluviométrico">
            {p && <path className="estado" d={caminho(d.contorno, p)} />}
            {p &&
              postos.map((x) =>
                x.v < 1 ? (
                  <circle key={x.id} cx={p.X(x.lng)} cy={p.Y(x.lat)} r={1.6} fill="#1ec997" opacity={0.55} />
                ) : (
                  <g key={x.id}>
                    <title>{`${x.nome} (${x.cidade}): ${n(x.v)} mm`}</title>
                    <circle cx={p.X(x.lng)} cy={p.Y(x.lat)} r={7} fill={corPosto(x.v)} stroke="#fff" strokeWidth={0.8} />
                    <text className="rot" x={p.X(x.lng)} y={p.Y(x.lat)}>
                      {Math.round(x.v)}
                    </text>
                  </g>
                ),
              )}
          </Mapa>
          <div className="bd-legenda">
            {[...CLASSES_POSTO].reverse().map(([, cor, rotulo]) => (
              <span key={rotulo} style={{ background: cor }}>
                {rotulo}
              </span>
            ))}
          </div>
          <Ed tag="p" className="bd-fonte" k="pluv_f1" padrao="Fonte: Chuva agora - SIBH" />
        </div>
        <div className="bd-col">
          <Ed tag="h3" className="bd-titulo" k="pluv_t2" padrao="Interpolação dos pluviômetros a partir do método IDW" />
          <Mapa p={p} rotulo="Chuva de 24 horas interpolada por município (IDW)">
            {municipios.map((m) => (
              <path key={m.codigo} className="mun" d={m.d} fill={corEscala(m.idw)}>
                <title>{`${m.nome}: ${m.idw === null ? 'sem posto no raio' : `${n(m.idw)} mm`}`}</title>
              </path>
            ))}
          </Mapa>
          <div className="bd-escala">
            {ESCALA.map(([lim, cor]) => (
              <span key={lim}>
                <i style={{ background: cor }} />
                <b>{lim}</b>
              </span>
            ))}
          </div>
          <Ed
            tag="p"
            className="bd-fonte"
            k="pluv_f2"
            padrao={`Elaborado pela equipe técnica da Sala de Situação Alfredo Pisani - SSAP. Parâmetros: Potência=${n(d.idw.potencia)}, Suavização=${n(d.idw.suavizacao, 2)} e Raio=${n(d.idw.raioGraus)}°.`}
          />
        </div>
      </div>
      <Ed tag="h3" className="bd-rotulo" k="pluv_rot" padrao="Relatos 24h" />
      <Ed tag="div" className="bd-caixa" k="pluv_relato" padrao={relato} />
    </section>
  );
}

const LEGENDA = { position: 'top' as const, labels: { boxWidth: 22, boxHeight: 7, font: { size: 9 }, color: '#222' } };
const base = { responsive: true, maintainAspectRatio: false, animation: false as const, devicePixelRatio: 2 };

function Municipios({ d, h }: { d: DadosDiario; h: HistoricoMensal | null }) {
  const num = useNumero();
  const histMun = (cidade: string) => h?.municipios[cidade] ?? null;
  const histUgrhi = (codigo: number) => h?.ugrhis[codigo] ?? null;
  const linhas = d.chuva.cidades.map((c) => ({
    ...c,
    vMax: num(`mun|${c.cidade}|max`, c.maxima),
    vMed: num(`mun|${c.cidade}|med`, c.media),
    vAcum: num(`mun|${c.cidade}|acum`, c.mes),
    vHist: num(`hist|mun|${c.cidade}`, histMun(c.cidade)),
  }));
  const ugrhis = d.chuva.ugrhis.map((u) => ({ ...u, v24: num(`ugrhi|${u.codigo}|v24`, u.media), vAcum: num(`ugrhi|${u.codigo}|acum`, u.mes), vHist: num(`hist|ugrhi|${u.codigo}`, histUgrhi(u.codigo)) }));
  const escalas = { x: { ticks: { font: { size: 9 }, maxRotation: 35, minRotation: 35, color: '#222' }, grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'Precipitação (mm)', font: { size: 9 } }, ticks: { font: { size: 9 }, color: '#222' } } };
  return (
    <>
      <section className="bd-pagina">
        <Topo k="t_pluv" titulo="Dados de Pluviometria" />
        <div className="bd-duas" style={{ flex: 1 }}>
          <div className="bd-col">
            <Ed tag="h3" className="bd-titulo" k="mun_t" padrao={'Municípios com os maiores acumulados de chuvas observadas\nnas últimas 24h (mm) (Rede Telemétrica)'} />
            <table className="bd-tab">
              <thead>
                <tr>
                  <th>Municípios</th>
                  <th>Chuva Máximo (mm)</th>
                  <th>Chuva Média (mm)</th>
                  <th>Acum. média mês (mm)</th>
                  <th>Histórico mensal (mm)</th>
                </tr>
              </thead>
              <tbody>
                {d.chuva.cidades.map((c) => (
                  <tr key={c.cidade}>
                    <Ed tag="td" k={`mun|${c.cidade}|nome`} padrao={c.cidade} />
                    <Ed tag="td" k={`mun|${c.cidade}|max`} padrao={n(c.maxima)} />
                    <Ed tag="td" k={`mun|${c.cidade}|med`} padrao={n(c.media)} />
                    <Ed tag="td" k={`mun|${c.cidade}|acum`} padrao={n(c.mes)} />
                    <Ed tag="td" k={`hist|mun|${c.cidade}`} padrao={n(histMun(c.cidade))} />
                  </tr>
                ))}
              </tbody>
            </table>
            <Ed
              tag="p"
              className="bd-notas"
              k="mun_notas"
              padrao={
                '1- Máximo Registrado - Volume máximo (mm) registrado por um posto pluviométrico do município.\n' +
                '2- Média Registrada - Soma do Volume (mm) de todos os postos do município / n° de postos.\n' +
                '3- Acumulado média mês - Soma da média (mm) registrada do primeiro dia do mês até o momento.\n' +
                '4- Histórico mensal - Volume médio mensal calculado a partir da série histórica disponível.'
              }
            />
          </div>
          <div className="bd-col">
            <Ed tag="h3" className="bd-titulo" k="mun_g1" padrao="Comparação de Precipitação por Município" />
            <div className="bd-grafico">
              <Canvas
                sssp={false}
                chave={JSON.stringify(linhas)}
                rotulo="Chuva média, máxima, acumulada no mês e histórico mensal por município"
                montar={() => ({
                  type: 'bar',
                  data: {
                    labels: linhas.map((l) => l.cidade),
                    datasets: [
                      { label: 'Chuva Média (mm)', data: linhas.map((l) => l.vMed), backgroundColor: '#66bb6a' },
                      { label: 'Chuva Máximo (mm)', data: linhas.map((l) => l.vMax), backgroundColor: '#42a5f5' },
                      { label: 'Acum. média mês (mm)', data: linhas.map((l) => l.vAcum), backgroundColor: '#ff7043' },
                      { label: 'Histórico mensal (mm)', data: linhas.map((l) => l.vHist), backgroundColor: '#ffca28' },
                    ],
                  },
                  options: { ...base, plugins: { legend: LEGENDA }, scales: escalas },
                })}
              />
            </div>
            <Ed tag="h3" className="bd-titulo" k="mun_g2" padrao="Chuva média acumulada por UGRHI" />
            <div className="bd-grafico">
              <Canvas
                sssp={false}
                chave={JSON.stringify(ugrhis)}
                rotulo="Chuva média de 24 horas, acumulada no mês e histórico mensal por UGRHI"
                montar={() => ({
                  type: 'bar',
                  data: {
                    labels: ugrhis.map((u) => u.nome),
                    datasets: [
                      { label: 'Chuva Acumulada (mm)', data: ugrhis.map((u) => u.v24), backgroundColor: '#42a5f5' },
                      { label: 'Acum. mensal (mm)', data: ugrhis.map((u) => u.vAcum), backgroundColor: '#ff7043' },
                      { label: 'Histórico mensal (mm)', data: ugrhis.map((u) => u.vHist), backgroundColor: '#ffca28' },
                    ],
                  },
                  options: { ...base, plugins: { legend: LEGENDA }, scales: { ...escalas, x: { ...escalas.x, ticks: { ...escalas.x.ticks, font: { size: 8 }, autoSkip: false } } } },
                })}
              />
            </div>
          </div>
        </div>
      </section>
      <details className="bd-apoio sem-imprimir">
        <summary>
          Dados do gráfico &quot;Chuva média acumulada por UGRHI&quot; (não sai no PDF){h ? ` — histórico: média de ${h.anos[0]} a ${h.anos[1]}, por amostra de ${h.postosPorUgrhi} postos do SIBH em cada UGRHI` : ' — calculando a média histórica…'}
        </summary>
        <table>
          <thead>
            <tr>
              <th>UGRHI</th>
              <th>Chuva 24 h (mm)</th>
              <th>Acum. mensal (mm)</th>
              <th>Histórico mensal (mm)</th>
            </tr>
          </thead>
          <tbody>
            {d.chuva.ugrhis.map((u) => (
              <tr key={u.codigo}>
                <td>
                  {u.codigo} — {u.nome}
                </td>
                <Ed tag="td" k={`ugrhi|${u.codigo}|v24`} padrao={n(u.media)} />
                <Ed tag="td" k={`ugrhi|${u.codigo}|acum`} padrao={n(u.mes)} />
                <Ed tag="td" k={`hist|ugrhi|${u.codigo}`} padrao={n(histUgrhi(u.codigo))} />
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

/** Acumulado do IPMet (imagem transparente do servidor) sobre o contorno do estado. */
function RadarIpmet({ d, versao }: { d: DadosDiario; versao: string }) {
  const { imagens } = useContext(Contexto);
  const [falhou, setFalhou] = useState(false);
  const [x0, y0, x1, y1] = AREA_IPMET;
  const p = useMemo(() => projetar([[[x0, y0], [x1, y1]]], 560, 0), [x0, y0, x1, y1]);
  // imagem enviada à mão, ou IPMet fora do ar: volta ao espaço de imagem comum
  if (imagens.radar_ipmet || falhou || !p) return <Imagem k="radar_ipmet" dica="Imagem do radar do IPMet (acumulado de 24 h)" />;
  return (
    <>
      <div className="bd-mapa bd-mapa--radar">
        <svg viewBox={`0 0 ${p.L} ${p.A}`} role="img" aria-label="Acumulado de chuva em 24 horas estimado pelos radares do IPMet">
          <image href={`${BASE}/radar?fonte=ipmet&v=${versao}`} x={0} y={0} width={p.L} height={p.A} preserveAspectRatio="none" onError={() => setFalhou(true)} />
          <path className="contorno" d={caminho(d.contorno, p)} />
        </svg>
        <div className="bd-trocar sem-imprimir">
          <Trocar k="radar_ipmet" />
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bd-escala-img" src={`${BASE}/radar?fonte=ipmet-escala`} alt="Escala de cores do acumulado, em milímetros" />
    </>
  );
}

/** Botão "Enviar imagem" avulso (para trocar uma imagem automática). */
function Trocar({ k }: { k: string }) {
  const { trocarImagem } = useContext(Contexto);
  return (
    <label>
      Enviar imagem
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) trocarImagem(k, URL.createObjectURL(f));
        }}
      />
    </label>
  );
}

function Radares({ d }: { d: DadosDiario }) {
  const versao = encodeURIComponent(d.gerado_em);
  return (
    <section className="bd-pagina">
      <Topo k="t_radar" titulo="Acumulado dos Radares" />
      <div className="bd-duas" style={{ flex: 1 }}>
        <div className="bd-col">
          <Ed tag="h3" className="bd-titulo" k="radar_t1" padrao="Acumulado das 24h (mm) - Radar Ipmet" />
          <RadarIpmet d={d} versao={versao} />
          <Ed tag="p" className="bd-fonte" k="radar_f1" padrao="Produzido pelo Ipmet. Disponível em: IPMET" />
          <Ed tag="h3" className="bd-rotulo" k="radar_rot" padrao="Análise" />
          <Ed tag="div" className="bd-caixa" k="radar_analise" padrao="As imagens dos radares do IPMet/UNESP e da SP Águas apresentam a precipitação acumulada nas últimas 24 horas." />
        </div>
        <div className="bd-col">
          <Ed tag="h3" className="bd-titulo" k="radar_t2" padrao="Acumulado das 24h (mm) - Radar SP-Águas" />
          <Imagem k="radar_spaguas" dica="Imagem do radar da SP Águas / SAISP (acumulado de 24 h)" padrao={`${BASE}/radar?fonte=saisp&v=${encodeURIComponent(d.periodo.fim)}`} />
          <div className="bd-escala">
            {ESCALA.map(([lim, cor]) => (
              <span key={lim}>
                <i style={{ background: cor }} />
                <b>{lim}</b>
              </span>
            ))}
          </div>
          <Ed tag="p" className="bd-fonte" k="radar_f2" padrao="Produzido pelo Radar 600S-Selex, Banda S, 850 KW, Doppler, Dupla Polarização. Disponível em: SAISP" />
        </div>
      </div>
    </section>
  );
}

function Fluviometria({ d, p }: { d: DadosDiario; p: Projecao | null }) {
  const f = d.fluviometria;
  const pontos = useMemo(() => [...f.pontos].sort((a, b) => ORDEM_SITUACAO.indexOf(a.situacao) - ORDEM_SITUACAO.indexOf(b.situacao)), [f]);
  const nomes = (s: string) => f.graves.filter((g) => g.situacao === s).map((g) => g.nome);
  const graves = (['extravasamento', 'emergencia'] as const).flatMap((s) => {
    const l = nomes(s);
    return l.length ? [`${f.situacoes[s]} ${l.length === 1 ? 'no posto' : 'nos postos'} ${lista(l)}`] : [];
  });
  const demais = [plural(f.contagem.alerta, 'posto', 'postos') + ' em nível de Alerta', plural(f.contagem.atencao, 'posto', 'postos') + ' em nível de Atenção', plural(f.contagem.normal, 'posto', 'postos') + ' em nível Normal'];
  const texto = `De acordo com os registros das redes telemétricas públicas do Estado de São Paulo nas últimas 24h ${graves.length ? `registraram-se níveis de ${graves.join(' e ')}, ` : 'não houve postos em nível de Extravasamento ou Emergência; registraram-se '}${lista(demais)}.`;
  return (
    <section className="bd-pagina">
      <Topo k="t_flu" titulo="Dados de Fluviometria" />
      <div style={{ width: 700, margin: '0 auto' }}>
        <Mapa p={p} rotulo="Situação dos postos fluviométricos do estado">
          {p && <path className="estado" d={caminho(d.contorno, p)} />}
          {p &&
            pontos.map((x) => (
              <circle key={x.id} cx={p.X(x.lng)} cy={p.Y(x.lat)} r={x.situacao === 'normal' ? 3.6 : 4.4} fill={CORES_SITUACAO[x.situacao]} stroke="#333" strokeWidth={0.4}>
                <title>{`${x.nome} (${x.cidade}): ${f.situacoes[x.situacao]}`}</title>
              </circle>
            ))}
        </Mapa>
        <div className="bd-legenda">
          {ORDEM_SITUACAO.map((s) => (
            <span key={s} style={{ background: CORES_SITUACAO[s] }}>
              {f.situacoes[s]}
            </span>
          ))}
        </div>
        <Ed tag="p" className="bd-fonte" k="flu_fonte" padrao="Fonte: Chuva agora - SIBH" />
      </div>
      <Ed tag="h3" className="bd-rotulo" k="flu_rot" padrao="Análise das redes telemétricas" />
      <Ed tag="div" className="bd-caixa" k="flu_analise" padrao={texto} />
    </section>
  );
}

function duracao(min: number | null) {
  if (min === null) return '';
  return `${Math.floor(min / 1440)} dias ${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;
}

function Extravasamento({ e, situacoes }: { e: DadosDiario['extravasamentos'][number]; situacoes: DadosDiario['fluviometria']['situacoes'] }) {
  const k = `extr|${e.id}|`;
  return (
    <section className="bd-pagina">
      <Topo k="t_extr" titulo="Gráfico do Extravasamento" />
      <div className="bd-cartoes">
        {([...ORDEM_SITUACAO].reverse() as (keyof typeof situacoes)[]).map((s) => (
          <div key={s} className={s}>
            <strong>{situacoes[s]}</strong>
            <Ed k={`${k}pct|${s}`} padrao={`${e.percentual[s].toFixed(2)}%`} />
          </div>
        ))}
      </div>
      <Ed tag="h3" className="bd-titulo" k={`${k}titulo`} padrao={`Dados fluviométricos do posto - ${e.prefixo} - ${e.nome}`} />
      <div className="bd-grafico">
        <Canvas
          sssp={false}
          chave={JSON.stringify(e.serie)}
          rotulo={`Nível do posto ${e.nome} nas últimas 24 horas`}
          montar={() => ({
            type: 'line',
            data: {
              labels: e.serie.map(([t]) => t.slice(11)),
              datasets: [
                { label: 'Nível (m)', data: e.serie.map(([, v]) => v), borderColor: '#2e9b1f', borderWidth: 1.4, pointRadius: 0, tension: 0.3 },
                { label: 'Extravasamento', data: e.serie.map(() => e.cota), borderColor: '#dc0714', borderWidth: 1.4, borderDash: [10, 8], pointRadius: 0 },
              ],
            },
            options: {
              ...base,
              plugins: { legend: { position: 'right', labels: { boxWidth: 26, boxHeight: 1, font: { size: 11 }, color: '#222' } } },
              scales: {
                x: { title: { display: true, text: 'Horas' }, ticks: { font: { size: 9 }, maxTicksLimit: 25, maxRotation: 0, color: '#222' } },
                y: { title: { display: true, text: 'Nível (m)' }, ticks: { font: { size: 9 }, color: '#222' } },
              },
            },
          })}
        />
      </div>
      <table className="bd-tab bd-tab--cinza">
        <thead>
          <tr>
            <th>Posto</th>
            <th>Município</th>
            <th>UGRHI</th>
            <th>Início do extravasamento</th>
            <th>Fim do extravasamento</th>
            <th>Duração</th>
            <th>Cota de extravasamento (m)</th>
            <th>Nível máximo (m)</th>
            <th>Estado Atual</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Ed tag="td" k={`${k}posto`} padrao={e.nome} />
            <Ed tag="td" k={`${k}cidade`} padrao={e.cidade} />
            <Ed tag="td" k={`${k}ugrhi`} padrao={e.ugrhi.toLocaleUpperCase('pt-BR')} />
            <Ed tag="td" k={`${k}inicio`} padrao={e.inicio ?? ''} />
            <Ed tag="td" k={`${k}fim`} padrao={e.fim ?? ''} />
            <Ed tag="td" k={`${k}duracao`} padrao={duracao(e.duracaoMin)} />
            <Ed tag="td" k={`${k}cota`} padrao={n(e.cota, 2)} />
            <Ed tag="td" k={`${k}max`} padrao={n(e.nivelMaximo, 2)} />
            <Ed tag="td" k={`${k}estado`} padrao={situacoes[e.situacao]} />
          </tr>
        </tbody>
      </table>
    </section>
  );
}

const CORES_SISTEMA: Record<string, string> = {
  Cantareira: '#a88bc4', 'Alto Tietê': '#6fb96f', Guarapiranga: '#c9a03c', Cotia: '#7676b4', 'Rio Grande': '#4a67b0', 'Rio Claro': '#d98360', 'São Lourenço': '#d64f73', Billings: '#8c2a80', 'Paraíba do Sul': '#6fbcd6',
};

function Sistemas({ d }: { d: DadosDiario }) {
  const s = d.sistemas;
  const num = useNumero();
  const produtores = s.lista.filter((x) => !x.sim);
  // Billings e Paraíba do Sul aparecem na arte original sem dado automático: ficam para preencher.
  const cartoes = [...produtores.map((x) => ({ nome: x.nome, volume: n(x.volume) && `${n(x.volume)} %`, afluente: n(x.afluente, 2) && `${n(x.afluente, 2)} m³/s`, defluente: n(x.defluente, 2) && `${n(x.defluente, 2)} m³/s`, chuva: n(x.chuvaDia) && `${n(x.chuvaDia)} mm` })), ...['Billings', 'Paraíba do Sul'].map((nome) => ({ nome, volume: '', afluente: '', defluente: '', chuva: '' }))];
  const linhas = s.lista.map((x) => ({ ...x, vAtual: num(`sis|${x.id}|atual`, x.volume), vAnt: num(`sis|${x.id}|ant`, x.volumeAnoAnterior) }));
  const maior = produtores.filter((x) => x.difAno !== null).sort((a, b) => b.difAno! - a.difAno!)[0];
  const analise = maior
    ? `O sistema produtor da Rede Metropolitana de São Paulo (RMSP) ${maior.nome} apresentou a maior diferença ${maior.difAno! >= 0 ? 'positiva' : 'negativa'} de ${n(Math.abs(maior.difAno!), 2)} p.p. em comparação com o mesmo dia no ano anterior, hoje apresenta o volume atual de ${n(maior.volume, 2)}% e no ano anterior estava com ${n(maior.volumeAnoAnterior, 2)}%.`
    : 'Dados dos sistemas produtores indisponíveis no momento.';
  return (
    <>
      <section className="bd-pagina">
        <Topo k="t_sis" titulo="Sistemas Produtores da RMSP" />
        <div className="bd-sistemas">
          {cartoes.map((c) => (
            <div className="bd-sistema" key={c.nome} style={{ '--cor': CORES_SISTEMA[c.nome] } as React.CSSProperties}>
              <Ed tag="h3" k={`sisc|${c.nome}|nome`} padrao={c.nome} />
              <dl>
                <dt>Volume Útil</dt>
                <Ed tag="dd" k={`sisc|${c.nome}|vol`} padrao={c.volume} />
                <dt>Vazão afluente</dt>
                <Ed tag="dd" k={`sisc|${c.nome}|afl`} padrao={c.afluente} />
                <dt>Vazão defluente</dt>
                <Ed tag="dd" k={`sisc|${c.nome}|def`} padrao={c.defluente} />
                <dt>Chuva</dt>
                <Ed tag="dd" k={`sisc|${c.nome}|chuva`} padrao={c.chuva} />
              </dl>
            </div>
          ))}
        </div>
        <Ed tag="p" className="bd-fonte" k="sis_fonte" padrao="Fonte: SABESP - Mananciais (volume do Cantareira: ANA)" />
      </section>

      <section className="bd-pagina">
        <Topo k="t_sis" titulo="Sistemas Produtores da RMSP" />
        <div className="bd-duas" style={{ flex: 1 }}>
          <div className="bd-col">
            <Ed tag="h3" className="bd-titulo" k="sis_g" padrao="Comparação entre volume atual x volume no ano anterior (%)" />
            <div className="bd-grafico">
              <Canvas
                sssp={false}
                chave={JSON.stringify(linhas.map((l) => [l.vAtual, l.vAnt]))}
                rotulo="Volume atual e volume no ano anterior de cada sistema produtor"
                montar={({ ChartDataLabels }) => ({
                  type: 'bar',
                  data: {
                    labels: linhas.map((l) => l.nome),
                    datasets: [
                      { label: 'Volume Atual (%)', data: linhas.map((l) => l.vAtual), backgroundColor: '#9bd0dd' },
                      { label: 'Volume Ano Anterior (%)', data: linhas.map((l) => l.vAnt), backgroundColor: '#7388c4' },
                    ],
                  },
                  options: {
                    ...base,
                    plugins: { legend: LEGENDA, datalabels: { anchor: 'end', align: 'start', color: '#111', font: { size: 9 }, formatter: (v: number | null) => (v === null ? '' : v.toFixed(2)) } },
                    scales: {
                      x: { title: { display: true, text: 'Mananciais', font: { size: 9 } }, ticks: { font: { size: 9 }, maxRotation: 35, minRotation: 35, color: '#222' }, grid: { display: false } },
                      y: { beginAtZero: true, suggestedMax: 110, title: { display: true, text: 'Volume (%)', font: { size: 9 } }, ticks: { color: '#222' } },
                    },
                  },
                  plugins: [ChartDataLabels],
                })}
              />
            </div>
          </div>
          <div className="bd-col">
            <Ed tag="h3" className="bd-titulo" k="sis_t" padrao="Volume dos Sistemas Produtores (Sabesp)" />
            <table className="bd-tab bd-tab--alta">
              <thead>
                <tr>
                  <th>Sistema</th>
                  <th>Volume Atual (%)</th>
                  <th>Volume Ano Anterior (%)</th>
                  <th>Diferença Vol. Anual (%)</th>
                  <th>Chuva (mm)</th>
                  <th>Acumulado no Mês (mm)</th>
                  <th>Média Histórica (mm)</th>
                </tr>
              </thead>
              <tbody>
                {s.lista.map((x) => (
                  <tr key={x.id}>
                    <td>{x.nome}</td>
                    <Ed tag="td" k={`sis|${x.id}|atual`} padrao={n(x.volume, 2)} />
                    <Ed tag="td" k={`sis|${x.id}|ant`} padrao={n(x.volumeAnoAnterior, 2)} />
                    <Ed tag="td" k={`sis|${x.id}|dif`} padrao={n(x.difAno, 2)} />
                    <Ed tag="td" k={`sis|${x.id}|chuva`} padrao={x.sim ? '-' : n(x.chuvaDia)} />
                    <Ed tag="td" k={`sis|${x.id}|mes`} padrao={x.sim ? '-' : n(x.chuvaMes)} />
                    <Ed tag="td" k={`sis|${x.id}|hist`} padrao={x.sim ? '-' : n(x.chuvaMediaHistorica)} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Ed tag="h3" className="bd-rotulo" k="sis_rot" padrao="Análise dos Sistemas Produtores" />
        <Ed tag="div" className="bd-caixa" k="sis_analise" padrao={analise} />
      </section>
    </>
  );
}

function Ppdc({ d, p }: { d: DadosDiario; p: Projecao | null }) {
  const num = useNumero();
  const municipios = useMemo(() => (p ? d.municipios.map((m) => ({ codigo: m.codigo, nome: m.nome, chuva72: m.chuva72, d: caminho(m.aneis, p) })) : []), [d, p]);
  return (
    <section className="bd-pagina">
      <Topo k="t_ppdc" titulo={'Acumulados das Últimas 72h e Limiares Críticos do PPDC dos\nMunicípios do Estado de São Paulo'} />
      <div className="bd-duas" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <div className="bd-col">
          <div style={{ width: 470, margin: '0 auto' }}>
            <Mapa p={p} rotulo="Municípios com posto pluviométrico com leitura nas últimas 72 horas">
              {municipios.map((m) => (
                <path key={m.codigo} className="mun" d={m.d} fill={m.chuva72 === null ? '#a9a9bb' : '#5fd4ae'}>
                  <title>{`${m.nome}: ${m.chuva72 === null ? 'sem posto com leitura' : `${n(m.chuva72)} mm em 72 h`}`}</title>
                </path>
              ))}
            </Mapa>
          </div>
          <Ed tag="p" className="bd-fonte" k="ppdc_fonte" padrao="Elaborado pela equipe da SP-Águas. Fonte: SIBH" />
        </div>
        <div className="bd-col">
          <Ed tag="h3" className="bd-titulo" k="ppdc_t" padrao={'Plano Preventivo de Defesa Civil específico para\nescorregamentos'} />
          <Ed
            tag="div"
            className="bd-caixa"
            k="ppdc_texto"
            padrao={'"O PPDC - Plano Preventivo de Defesa Civil específico para escorregamentos nas encostas da Serra do Mar no Estado de São Paulo (Decreto Estadual nº 30,860 de 04/12/1989, redefinido pelo Decreto Estadual nº42,565 de 01/12/1997) tem por objetivo principal evitar a ocorrência de mortes, com a remoção preventiva e temporária da população que ocupa as áreas de risco, antes que os escorregamentos atinjam suas moradias"'}
          />
        </div>
      </div>
      <table className="bd-tab" style={{ marginTop: 10, width: '92%', alignSelf: 'center' }}>
        <thead>
          <tr>
            <th>Município</th>
            <th>Chuva Máx. (mm)</th>
            <th>Média Mensal (mm)</th>
            <th>PPDC (Limiar de Chuva)</th>
            <th>Fonte</th>
            <th>Status</th>
            <th style={{ width: 190 }}>(%) PPDC</th>
          </tr>
        </thead>
        <tbody>
          {d.ppdc.cidades.map((c) => {
            const chuva = num(`p72|${c.cidade}|max`, Math.round(c.maxima));
            const limiar = num(`ppdc|${c.cidade}|limiar`);
            const pct = chuva !== null && limiar ? Math.round((100 * chuva) / limiar) : null;
            return (
              <tr key={c.cidade}>
                <Ed tag="td" k={`p72|${c.cidade}|nome`} padrao={c.cidade} />
                <Ed tag="td" k={`p72|${c.cidade}|max`} padrao={String(Math.round(c.maxima))} />
                <Ed tag="td" k={`p72|${c.cidade}|media`} />
                <Ed tag="td" k={`ppdc|${c.cidade}|limiar`} />
                <Ed tag="td" k={`ppdc|${c.cidade}|fonte`} />
                <Ed tag="td" k={`p72|${c.cidade}|status`} padrao={pct === null ? '' : pct >= 100 ? 'Acima do limiar' : 'Normal'} />
                <td className="bd-barra-ppdc">
                  {pct !== null && <i style={{ width: `${Math.min(100, pct)}%` }} />}
                  <b>{pct ?? ''}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Previsao() {
  return (
    <section className="bd-pagina">
      <Topo k="t_prev" titulo="Previsão do Tempo" />
      <div className="bd-duas" style={{ flex: 1 }}>
        <div className="bd-col">
          <Imagem k="previsao" dica="Imagem da previsão (ex.: modelo COSMO do INMET)" />
          <Ed tag="p" className="bd-fonte" k="prev_fonte" padrao="Fonte: INMET" />
        </div>
        <div className="bd-col">
          <Ed tag="h3" className="bd-titulo" k="prev_t" padrao="Previsão do Tempo para os dias seguintes" />
          <Ed tag="div" className="bd-caixa bd-caixa--alta" k="prev_texto" padrao="" />
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------- tela

export function TelaDiario({ hoje }: { hoje: string }) {
  const [dados, setDados] = useState<DadosDiario | null>(null);
  const [status, setStatus] = useState<{ msg: string; erro: boolean }>({ msg: 'Carregando dados…', erro: false });
  const [historico, setHistorico] = useState<HistoricoMensal | null>(null);
  const [avisoHistorico, setAvisoHistorico] = useState('calculando a média histórica do mês (na primeira vez do mês leva alguns minutos)…');
  const [ed, setEd] = useState<Edicoes>({});
  const [imagens, setImagens] = useState<Record<string, string>>({});

  // edições guardadas neste navegador
  useEffect(() => {
    setEd({ ...ler('boletim_diario:ppdc'), ...ler(`boletim_diario:hist:${hoje.slice(0, 7)}`), ...ler(`boletim_diario:dia:${hoje}`) });
  }, [hoje]);

  const editar = useCallback(
    (k: string, v: string) => {
      setEd((atual) => {
        const novo = { ...atual, [k]: v };
        const chave = chaveGuarda(k, hoje);
        try {
          localStorage.setItem(chave, JSON.stringify(Object.fromEntries(Object.entries(novo).filter(([x]) => chaveGuarda(x, hoje) === chave))));
        } catch {
          setStatus({ msg: 'Não foi possível salvar as edições neste navegador.', erro: true });
        }
        return novo;
      });
    },
    [hoje],
  );
  const trocarImagem = useCallback((k: string, url: string | null) => {
    setImagens((atual) => {
      if (atual[k]) URL.revokeObjectURL(atual[k]);
      const novo = { ...atual };
      if (url) novo[k] = url;
      else delete novo[k];
      return novo;
    });
  }, []);

  const carregar = useCallback(async (atualizar: boolean) => {
    setStatus({ msg: 'Consultando SIBH, SABESP, ANA e IBGE…', erro: false });
    try {
      const r = await fetch(API + (atualizar ? '?atualizar=1' : ''), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const j = (await r.json()) as DadosDiario & { erro?: string };
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      setDados(j);
      setStatus({ msg: `Dados de ${dataHoraBr(j.gerado_em)}${j.falhas.length ? ` — sem resposta agora: ${j.falhas.join(', ')} (confira os valores)` : '.'}`, erro: j.falhas.length > 0 });
    } catch (e) {
      setStatus({ msg: `Não foi possível carregar os dados: ${e instanceof Error ? e.message : e}`, erro: true });
    }
  }, []);
  useEffect(() => {
    void carregar(false);
  }, [carregar]);

  // média histórica do mês (municípios das tabelas e UGRHIs): consulta demorada, à parte
  const cidades = useMemo(() => (dados ? [...new Set([...dados.chuva.cidades, ...dados.ppdc.cidades].map((c) => c.cidade))].sort() : []), [dados]);
  const consulta = cidades.map((c) => `cidade=${encodeURIComponent(c)}`).join('&');
  useEffect(() => {
    if (!consulta) return;
    let cancelado = false;
    fetch(`${BASE}/historico?${consulta}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(async (r) => {
        const j = (await r.json()) as HistoricoMensal & { erro?: string };
        if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
        if (cancelado) return;
        setHistorico(j);
        setAvisoHistorico(j.falhas ? `${j.falhas} consultas ao SIBH falharam; a média histórica pode estar incompleta (recarregue a página para completar).` : '');
      })
      .catch((e) => !cancelado && setAvisoHistorico(`média histórica indisponível (${e instanceof Error ? e.message : e}); preencha à mão ou recarregue a página.`));
    return () => {
      cancelado = true;
    };
  }, [consulta]);

  const projecao = useMemo(() => (dados ? projetar(dados.contorno) : null), [dados]);

  const descartar = () => {
    if (!window.confirm('Descartar as edições de hoje neste boletim? O histórico mensal e os limiares do PPDC são mantidos.')) return;
    try {
      localStorage.removeItem(`boletim_diario:dia:${hoje}`);
    } catch {
      /* ignora */
    }
    setEd({ ...ler('boletim_diario:ppdc'), ...ler(`boletim_diario:hist:${hoje.slice(0, 7)}`) });
  };
  const imprimir = () => {
    // o nome sugerido do arquivo vem do título da página
    const titulo = document.title;
    document.title = `Boletim_SSAP_${hoje.replace(/-/g, '')}`;
    window.print();
    document.title = titulo;
  };

  return (
    <Contexto.Provider value={{ ed, editar, imagens, trocarImagem }}>
      <section className="acesso-card mb-3 sem-imprimir">
        <div className="bd-barra">
          <button type="button" className="btn btn-primary" onClick={() => void carregar(true)}>
            <i className="bi bi-arrow-repeat me-1" /> Atualizar dados
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={descartar}>
            Descartar edições de hoje
          </button>
          <button type="button" className="btn btn-success" onClick={imprimir} disabled={!dados}>
            <i className="bi bi-file-earmark-pdf me-1" /> Gerar PDF
          </button>
          <span className={`bd-status${status.erro ? ' erro' : ''}`} role="status">
            {status.msg}
            {avisoHistorico && ` Histórico: ${avisoHistorico}`}
          </span>
        </div>
        <p className="bd-dica">
          Clique em qualquer texto ou valor para corrigir. As imagens dos radares são buscadas automaticamente (dá para trocar); na área tracejada da previsão, envie ou cole a imagem. As
          edições ficam salvas neste navegador; as imagens enviadas valem só enquanto a página estiver aberta. Em &quot;Gerar PDF&quot;, escolha <strong>Salvar como PDF</strong>, papel <strong>A4</strong>, orientação <strong>Paisagem</strong> e margens{' '}
          <strong>Nenhuma</strong>.
        </p>
      </section>

      {dados && (
        <div className="bd-folhas">
          <Capa d={dados} />
          <Pluviometria d={dados} p={projecao} />
          <Municipios d={dados} h={historico} />
          <Radares d={dados} />
          <Fluviometria d={dados} p={projecao} />
          {dados.extravasamentos.map((e) => (
            <Extravasamento key={e.id} e={e} situacoes={dados.fluviometria.situacoes} />
          ))}
          <Sistemas d={dados} />
          <Ppdc d={dados} p={projecao} />
          <Previsao />
        </div>
      )}
    </Contexto.Provider>
  );
}
