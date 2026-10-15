import geojson from '@/conteudo/ugrhi6-subbacias.json';
import rios from '@/conteudo/ugrhi6-rios.json';
import {
  anoMes, cargaMes, CHUVA_MAX_DIARIA_MM, CONAMA, diasDoMes, estatisticasNivel, EXUTORIO_PEDREIRA, EXUTORIOS_MAPA, FLUVIOMETRIA_TABELA, MESES, MESES_ABREV, NOMES,
  PARAMETROS, PARAMETROS_QUALIDADE, PONTOS_QUALIDADE, TIPOS,
  type DadosChuvaVazao, type DadosExutorios, type DadosMananciais, type SerieMes, type Tipo,
} from './boletim-integrado';
import { SUBBACIAS } from './rede-pluviometrica';

/**
 * Páginas dos três boletins mensais (porte de includes/boletins.php e
 * boletim_edicoes.php do PHP). Cada página é um "slide": na tela vira um
 * cartão e, na impressão ("Gerar PDF"), uma folha A4 paisagem com o título e
 * os logos. Os gráficos são desenhados no navegador pelo script original
 * (public/acesso/boletim_integrado/js/boletim_tela.js) a partir do JSON em
 * data-grafico. Valores e textos editados na tela valem para a tabela, para o
 * gráfico e para o PDF.
 */

export type Edicoes = { textos: Record<string, string>; valores: Record<string, number> };

const esc = (t: string | number) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (v: number | null | undefined, casas = 1) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const competencia = (ano: number, mes: number, sep = ' ') => `${MESES[mes - 1]}${sep}${ano}`;
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

const LOGOS =
  '<span class="slide-logos"><img src="/acesso/boletim_integrado/img/logo-spaguas.png" alt="SP Águas"><img src="/acesso/boletim_integrado/img/logo-cetesb.png" alt="CETESB">' +
  '<img src="/acesso/boletim_integrado/img/brasao.png" alt="Brasão do Estado de São Paulo"></span>';

/** Montagem de um boletim: aplica as edições e numera as seções (a chave de cada análise é o título + a ordem). */
class Montagem {
  private secoes = new Map<string, number>();
  constructor(readonly e: Edicoes) {}

  /** Valor efetivo: o ajustado na tela, se houver; senão o da fonte. */
  ajuste(chave: string, original: number | null): number | null {
    return Object.hasOwn(this.e.valores, chave) ? this.e.valores[chave]! : original;
  }

  /** Célula numérica editável no modo edição (data-chave/data-original). */
  celula(chave: string, original: number | null | undefined, casas = 1, sufixo = ''): string {
    const orig = original ?? null;
    const valor = this.ajuste(chave, orig);
    const ajustado = Object.hasOwn(this.e.valores, chave);
    const bruto = (v: number | null) => (v === null ? '' : String(Math.round(v * 1e6) / 1e6));
    return (
      `<span class="editavel${ajustado ? ' ajustado' : ''}" data-chave="${esc(chave)}" data-casas="${casas}" data-original="${bruto(orig)}" data-valor="${bruto(valor)}"` +
      `${ajustado ? ` title="Ajustado manualmente (original: ${orig === null ? 'sem dado' : num(orig, casas)})"` : ''}>${valor === null ? '—' : esc(num(valor, casas) + sufixo)}</span>`
    );
  }

  private chaveSecao(tituloHtml: string): string {
    const texto = semAcento(tituloHtml.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').replace(/&#\d+;|&\w+;/g, ' ')).toLowerCase();
    const base = (texto.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'secao').slice(0, 90);
    const n = (this.secoes.get(base) ?? 0) + 1;
    this.secoes.set(base, n);
    return `${base}.${n}`;
  }

  /** Página do boletim, com o bloco de análise da seção (aparece vazio só no modo edição). */
  slide(tituloHtml: string, conteudo: string): string {
    const secao = this.chaveSecao(tituloHtml);
    const texto = this.e.textos[secao] ?? '';
    const analise =
      `<div class="analise-tela${texto ? '' : ' vazia'}" data-secao="${esc(secao)}"><div class="analise-rotulo">Análise</div>` +
      `<div class="analise-texto">${esc(texto).replace(/\n/g, '<br>')}</div></div>`;
    return `<section class="slide-tela"><header class="slide-cab"><h3 class="slide-tela-titulo">${tituloHtml}</h3>${LOGOS}</header>${conteudo}${analise}</section>`;
  }

  /**
   * Séries diárias com valores editáveis ("prefixo.campo.AAAA-MM-DD"): devolve
   * as séries já ajustadas e a tabela dia a dia para conferir, alterar ou preencher.
   */
  seriesEditaveis<K extends string>(prefixo: string, series: Record<K, SerieMes>, rotulos: Record<K, string>): [Record<K, SerieMes>, string] {
    const campos = Object.keys(rotulos) as K[];
    const ajustadas = {} as Record<K, SerieMes>;
    for (const c of campos) ajustadas[c] = Object.fromEntries(Object.entries(series[c]).map(([d, v]) => [d, this.ajuste(`${prefixo}.${c}.${d}`, v)]));
    const datas = Object.keys(series[campos[0]!]);
    const linhas = datas.map(
      (d) => `<tr><td>${d.slice(8, 10)}/${d.slice(5, 7)}</td>${campos.map((c) => `<td>${this.celula(`${prefixo}.${c}.${d}`, series[c][d], 2)}</td>`).join('')}</tr>`,
    );
    const tabela =
      '<details class="dados-diarios"><summary>Ver, alterar ou entrar com os dados diários</summary><div class="rolagem"><table><tr><th>Data</th>' +
      `${campos.map((c) => `<th>${esc(rotulos[c])}</th>`).join('')}</tr>${linhas.join('')}</table></div></details>`;
    return [ajustadas, tabela];
  }
}

const grafico = (spec: object, alturaPx = 440) => `<div class="grafico-tela" style="height:${alturaPx}px"><canvas data-grafico="${esc(JSON.stringify(spec))}"></canvas></div>`;
const divisoria = (tituloHtml: string) => `<h2 class="divisoria-tela">${tituloHtml.replace(/<br>/g, ' — ')}</h2>`;
const aviso = (html: string) => `<div class="aviso">${html}</div>`;
const temDado = (series: SerieMes[]) => series.some((s) => Object.values(s).some((v) => v !== null));

/** Capa (só na impressão; na tela o cabeçalho da página já identifica o boletim). */
const capa = (tipo: Tipo, ano: number, mes: number) =>
  `<section class="capa-boletim"><div class="capa-linha1">MONITORAMENTO HIDROLÓGICO</div><div class="capa-linha2">${esc(TIPOS[tipo])}</div>` +
  `<div class="capa-bacia">Bacia Hidrográfica do Alto Tietê<br>(CBH-AT)</div><div class="capa-competencia">${esc(competencia(ano, mes))}</div>${LOGOS}</section>`;

// ---------------------------------------------------------------------------
// Mapa de localização (SVG)
// ---------------------------------------------------------------------------

type Ponto = { lat: number; lng: number; tipo: 'qualidade' | 'fluviometria' | 'pluviometria' | 'exutorio'; nome?: string };
const COR_SUBBACIA: Record<string, string> = { cabeceiras: '#CFE8F3', juqueri_cantareira: '#D9EAD3', penha_pinheiros: '#FCE5CD', pinheiros_pirapora: '#D9D2E9', cotia_guarapiranga: '#D0E0E3', billings_tamanduatei: '#FFF2CC' };
const COR_PONTO = { qualidade: '#198754', fluviometria: '#0B5ED7', pluviometria: '#17A2B8', exutorio: '#C00000' };
const ROTULO_PONTO = { qualidade: 'Qualidade (CETESB)', fluviometria: 'Fluviometria', pluviometria: 'Pluviometria', exutorio: 'Exutório' };

function mapa(m: Montagem, tituloMapa: string, pontos: Ponto[]): string {
  type Feicao = { properties: { nome_dashboard?: string }; geometry: { type: string; coordinates: unknown } };
  const feicoes = (geojson as unknown as { features: Feicao[] }).features.map((f) => ({
    nome: f.properties.nome_dashboard ?? '',
    aneis: ((f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][]).map((p) => p[0]!),
  }));
  const todos = [...feicoes.flatMap((f) => f.aneis.flat()), ...pontos.map((p) => [p.lng, p.lat])];
  let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, y] of todos as [number, number][]) [minX, maxX, minY, maxY] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minY, y), Math.max(maxY, y)];
  const [fx, fy] = [(maxX - minX) * 0.05, (maxY - minY) * 0.05];
  [minX, maxX, minY, maxY] = [minX - fx, maxX + fx, minY - fy, maxY + fy];
  const [w, h] = [1000, 557];
  const escala = Math.min((w - 20) / (maxX - minX), (h - 20) / (maxY - minY));
  const [ox, oy] = [(w - (maxX - minX) * escala) / 2, (h - (maxY - minY) * escala) / 2];
  const xy = (lng: number, lat: number) => `${(ox + (lng - minX) * escala).toFixed(1)} ${(oy + (maxY - lat) * escala).toFixed(1)}`;
  const caminho = (linha: number[][], maxPontos: number, fechar: boolean) => {
    const passo = Math.max(1, Math.ceil(linha.length / maxPontos));
    const pts = linha.filter((_, i) => i % passo === 0 || i === linha.length - 1);
    return `${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${xy(x!, y!)}`).join(' ')}${fechar ? ' Z' : ''}`;
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(tituloMapa)}"><rect width="${w}" height="${h}" fill="#EEF3F5" stroke="#9FB3BF"/>`;
  const rotulos: string[] = [];
  for (const f of feicoes) {
    const slug = Object.keys(SUBBACIAS).find((s) => semAcento(SUBBACIAS[s]!).replace(/[^a-z]/gi, '').toLowerCase() === semAcento(f.nome).replace(/[^a-z]/gi, '').toLowerCase());
    svg += `<path d="${f.aneis.map((a) => caminho(a, 350, true)).join(' ')}" fill="${COR_SUBBACIA[slug ?? ''] ?? '#E8EEF2'}" stroke="#688496" stroke-width="1.2" fill-rule="evenodd"/>`;
    const xs = f.aneis.flat().map((p) => p[0]!);
    const ys = f.aneis.flat().map((p) => p[1]!);
    const centro = xy((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2).split(' ');
    const attrs = `x="${centro[0]}" y="${centro[1]}" text-anchor="middle" font-size="15" font-weight="bold"`;
    rotulos.push(`<text ${attrs} fill="#fff" stroke="#fff" stroke-width="4">${esc(slug ? SUBBACIAS[slug]! : f.nome)}</text><text ${attrs} fill="#000">${esc(slug ? SUBBACIAS[slug]! : f.nome)}</text>`);
  }
  for (const linha of rios as number[][][]) svg += `<path d="${caminho(linha, 70, false)}" fill="none" stroke="#6FAED1" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`;
  // qualidade e exutórios por último, para ficarem por cima
  const ordem = { pluviometria: 0, fluviometria: 1, qualidade: 2, exutorio: 3 };
  for (const p of [...pontos].sort((a, b) => ordem[a.tipo] - ordem[b.tipo])) {
    const [x, y] = xy(p.lng, p.lat).split(' ');
    const destaque = p.tipo === 'qualidade' || p.tipo === 'exutorio';
    svg += `<circle cx="${x}" cy="${y}" r="${destaque ? 7 : 4.5}" fill="${COR_PONTO[p.tipo]}" stroke="${destaque ? '#083D24' : '#fff'}" stroke-width="${destaque ? 2 : 1}"/>`;
    if (p.nome) rotulos.push(`<text x="${Number(x) + 11}" y="${Number(y) + 5}" font-size="14" font-weight="bold" fill="#fff" stroke="#fff" stroke-width="4">${esc(p.nome)}</text><text x="${Number(x) + 11}" y="${Number(y) + 5}" font-size="14" font-weight="bold" fill="#7A0000">${esc(p.nome)}</text>`);
  }
  svg += `${rotulos.join('')}</svg>`;
  const tipos = [...new Set(pontos.map((p) => p.tipo))];
  const legenda = tipos.map((t) => `<span><i style="background:${COR_PONTO[t]}"></i>${ROTULO_PONTO[t]} (${pontos.filter((p) => p.tipo === t).length})</span>`).join('');
  return m.slide('Localização dos Pontos de Monitoramento', `<div class="mapa-titulo">${esc(tituloMapa)}</div><div class="mapa-svg">${svg}</div><div class="mapa-legenda">${legenda}</div>`);
}

// ---------------------------------------------------------------------------
// Boletim Chuva-Vazão
// ---------------------------------------------------------------------------

function paginasPluviometria(m: Montagem, d: DadosChuvaVazao['chuva'], ano: number, mes: number): string {
  const nomeMes = MESES[mes - 1]!;
  const campos = ['atual', 'minima', 'media', 'maxima'] as const;
  let tab =
    `<table class="tab-chuva"><thead><tr><th class="titulo-tab" colspan="5">CHUVA - ${esc(nomeMes.toUpperCase())} / ${ano} (mm)</th></tr><tr><th>SUB-BACIA</th><th>Acumulado<br>mês</th>` +
    `<th>Mín.<br>${nomeMes}<br>(${d.periodo})</th><th class="hist">Média<br>${nomeMes}<br>(${d.periodo})</th><th>Máx.<br>${nomeMes}<br>(${d.periodo})</th></tr></thead><tbody>`;
  d.linhas.forEach((l, i) => {
    const cel = (k: (typeof campos)[number]) => m.celula(`chuva.${l.slug}.${k}`, l[k]);
    tab += `<tr class="${i % 2 ? 'par' : 'impar'}"><td class="sub">${esc(l.nome)}</td><td><b>${cel('atual')}</b></td><td>${cel('minima')}</td><td>${cel('media')}</td><td>${cel('maxima')}</td></tr>`;
  });
  tab +=
    '</tbody></table><p class="nota">Chuva média por sub-bacia = média dos acumulados mensais dos postos pluviométricos SIBH com dados ' +
    `(leituras diárias &lt; 0 ou &gt; ${CHUVA_MAX_DIARIA_MM} mm descartadas). Mínima, média e máxima do mês em toda a série do SIBH (início em 2015).</p>`;

  // valores ajustados na tela valem para a tabela e para o gráfico
  const serie = (k: (typeof campos)[number]) => d.linhas.map((l) => m.ajuste(`chuva.${l.slug}.${k}`, l[k]));
  const per = d.periodo.replace(' a ', '-');
  // cores bem distintas: o mês do boletim em azul forte; mínima, média e máxima da série em âmbar, verde e vermelho
  const series = [
    { nome: `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`, cor: '#0039C4', valores: serie('atual') },
    { nome: `Mín (${per})`, cor: '#F59E0B', valores: serie('minima') },
    { nome: `Média (${per})`, cor: '#00B154', valores: serie('media') },
    { nome: `Máx (${per})`, cor: '#E11D48', valores: serie('maxima') },
  ];
  const g = grafico({ tipo: 'barras', titulo: `CHUVAS (mm) ${nomeMes.toUpperCase()} / ${ano}`, rotulos: d.linhas.map((l) => l.nome), series, unidade: 'mm' });
  return m.slide('PLUVIOMETRIA - ALTO TIETÊ', tab) + m.slide('PLUVIOMETRIA - ALTO TIETÊ', g);
}

const FAIXAS = [['normal', 'p-normal'], ['atencao', 'p-atencao'], ['alerta', 'p-alerta'], ['emergencia', 'p-emerg'], ['extravasamento', 'p-extrav']] as const;

function paginaEstatisticas(m: Montagem, postos: DadosChuvaVazao['fluviometria'], ano: number, mes: number): string {
  let h =
    `<table class="tab-flu"><thead><tr><th colspan="3">SP ÁGUAS - DADOS FLUVIOMÉTRICOS - SUB-BACIAS ALTO TIETÊ</th><th colspan="5">${esc(`${MESES[mes - 1]!.toLowerCase()}/${ano}`)}</th>` +
    '<th colspan="5">Tempo de Permanência (%) em:</th></tr><tr><th>Sub-bacias</th><th>Nº</th><th>Posto Fluviométrico</th><th>Unid</th><th>Média</th><th>Máximo</th><th>Mínimo</th><th>Quant</th>' +
    '<th>Normal</th><th>Atenção</th><th>Alerta</th><th>Emerg</th><th>Extrav</th></tr></thead><tbody>';
  for (const [sub] of FLUVIOMETRIA_TABELA) {
    const linhas: { html: string; vazao: boolean }[] = [];
    for (const p of postos.filter((x) => x.sub === sub)) {
      const cod = esc(p.codigo);
      if (!p.posto) {
        linhas.push({ html: `<td>${cod}</td><td class="al">Posto não localizado no SIBH</td><td colspan="10"></td>`, vazao: false });
        continue;
      }
      const nome = `<td>${cod}</td><td class="al">${esc(p.posto.nome)}</td>`;
      if (!p.leituras) {
        linhas.push({ html: `${nome}<td>Flu (m)</td><td colspan="9" class="al">leituras ainda chegando do SIBH — atualize em instantes</td>`, vazao: false });
        continue;
      }
      const st = estatisticasNivel(p.leituras, p.cotas);
      const c = (grupo: string, campo: string, v: number | undefined) => m.celula(`${grupo}.${p.codigo}.${campo}`, v ?? null, 2);
      const f = st.permanencia;
      linhas.push({
        html:
          `${nome}<td>Flu (m)</td><td>${c('flu', 'media', st.nivel?.media)}</td><td>${c('flu', 'maximo', st.nivel?.maximo)}</td><td>${c('flu', 'minimo', st.nivel?.minimo)}</td>` +
          `<td>${st.nivel ? num(st.nivel.quantidade, 0) : '—'}</td>${FAIXAS.map(([k, classe]) => `<td class="${f ? classe : ''}">${f ? m.celula(`perm.${p.codigo}.${k}`, f[k], 2, '%') : ''}</td>`).join('')}`,
        vazao: false,
      });
      if (st.vazao) {
        linhas.push({
          html: `${nome}<td>Q (m³/s)</td><td>${c('q', 'media', st.vazao.media)}</td><td>${c('q', 'maximo', st.vazao.maximo)}</td><td>${c('q', 'minimo', st.vazao.minimo)}</td><td>${num(st.vazao.quantidade, 0)}</td><td colspan="5"></td>`,
          vazao: true,
        });
      }
    }
    linhas.forEach((l, i) => (h += `<tr${l.vazao ? ' class="vazao"' : ''}>${i === 0 ? `<td class="grupo" rowspan="${linhas.length}">${esc(sub)}</td>` : ''}${l.html}</tr>`));
  }
  h +=
    '</tbody></table><p class="nota">Leituras de 10 min do SIBH. Permanência = % das leituras de nível em cada faixa das cotas de referência cadastradas no SIBH ' +
    '(Normal &lt; Atenção ≤ Alerta ≤ Emergência ≤ Extravasamento).</p>';
  return m.slide(`ESTATÍSTICAS BÁSICAS - VAZÃO E NÍVEL - ${esc(MESES[mes - 1]!.toUpperCase())}/${ano}`, h);
}

function paginasHidrogramas(m: Montagem, d: DadosChuvaVazao, ano: number, mes: number): string {
  let html = '';
  for (const hg of d.hidrogramas) {
    const titulo = `HIDROGRAMA POSTO TELEMÉTRICO<br>${esc(hg.titulo.toUpperCase())} - ${esc(MESES[mes - 1]!.toUpperCase())}/${ano}`;
    const p = d.fluviometria.find((x) => x.codigo === hg.codigo);
    if (!p?.posto) {
      html += m.slide(titulo, aviso(`Posto ${esc(hg.codigo)} não localizado na rede SIBH.`));
      continue;
    }
    if (!p.leituras) {
      html += m.slide(titulo, aviso(`As leituras de ${esc(p.posto.nome)} ainda estão chegando do SIBH. Atualize o boletim em instantes.`));
      continue;
    }
    const cod = hg.codigo;
    const st = estatisticasNivel(p.leituras, p.cotas);
    const chavesCota = ['atencao', 'alerta', 'emergencia', 'extravasamento'] as const;
    const cotas: Record<string, number> = {};
    for (const k of chavesCota) {
      const v = m.ajuste(`cota.${cod}.${k}`, p.cotas?.[k] ?? null);
      if (v !== null) cotas[k] = v;
    }
    // na tela, uma leitura por hora basta para desenhar o nível
    const nivel = p.leituras.filter((l, i) => i % 6 === 0 && l.nivel !== null).map((l) => [l.t, l.nivel]);
    const g = grafico({ tipo: 'hidrograma', titulo: p.posto.nome, nivel, chuva: hg.chuva.diario, cotas, ano, mes }, 560);
    const ed = (chave: string, v: number | null | undefined, casas = 2, suf = '') => m.celula(chave, v ?? null, casas, suf);
    const n = st.nivel;
    const f = st.permanencia;
    const ch = hg.chuva;
    const quadro =
      `<table class="quadro"><tr><th colspan="2">${esc(`${cod} ${p.posto.nome}`)} — ${esc(`${MESES[mes - 1]!.toLowerCase()}/${ano}`)}</th><th colspan="2">Cotas (m)</th><th colspan="2">Pluviometria (mm)</th></tr>` +
      `<tr><td>Média</td><td>${ed(`flu.${cod}.media`, n?.media)}</td><td>Atenção</td><td>${ed(`cota.${cod}.atencao`, p.cotas?.atencao)}</td><td>Acumulada mensal</td><td>${ed(`plu.${cod}.acumulada`, ch.acumulada, 1)}</td></tr>` +
      `<tr><td>Máximo</td><td>${ed(`flu.${cod}.maximo`, n?.maximo)}</td><td>Alerta</td><td>${ed(`cota.${cod}.alerta`, p.cotas?.alerta)}</td><td>Máxima diária</td><td>${ed(`plu.${cod}.maxima_diaria`, ch.maxima_diaria, 1)}</td></tr>` +
      `<tr><td>Mínimo</td><td>${ed(`flu.${cod}.minimo`, n?.minimo)}</td><td>Emergência</td><td>${ed(`cota.${cod}.emergencia`, p.cotas?.emergencia)}</td><td>Dias com chuva</td><td>${ed(`plu.${cod}.dias_com_chuva`, ch.dias_com_chuva, 0)}</td></tr>` +
      `<tr><td>Quantidade</td><td>${n ? num(n.quantidade, 0) : '—'}</td><td>Extravasamento</td><td>${ed(`cota.${cod}.extravasamento`, p.cotas?.extravasamento)}</td><td>Média dias com chuva</td><td>${ed(`plu.${cod}.media_dias_com_chuva`, ch.media_dias_com_chuva, 1)}</td></tr>` +
      `<tr><td class="p-normal">% Normal</td><td>${ed(`perm.${cod}.normal`, f?.normal, 2, '%')}</td><td class="p-atencao">% Atenção</td><td>${ed(`perm.${cod}.atencao`, f?.atencao, 2, '%')}</td><td class="p-alerta">% Alerta</td><td>${ed(`perm.${cod}.alerta`, f?.alerta, 2, '%')}</td></tr>` +
      `<tr><td class="p-emerg">% Emergência</td><td>${ed(`perm.${cod}.emergencia`, f?.emergencia, 2, '%')}</td><td class="p-extrav">% Extravasamento</td><td>${ed(`perm.${cod}.extravasamento`, f?.extravasamento, 2, '%')}</td><td colspan="2"></td></tr></table>`;
    html += m.slide(titulo, g + quadro);
  }
  return html;
}

export function htmlChuvaVazao(d: DadosChuvaVazao, ano: number, mes: number, e: Edicoes): string {
  const m = new Montagem(e);
  const pontos: Ponto[] = [
    ...d.mapa.pluviometria.map((p) => ({ lat: p.lat, lng: p.lng, tipo: 'pluviometria' as const })),
    ...d.fluviometria.filter((p) => p.posto).map((p) => ({ lat: p.posto!.lat, lng: p.posto!.lng, tipo: 'fluviometria' as const })),
  ];
  return (
    capa('chuva_vazao', ano, mes) +
    mapa(m, 'MAPA SISTEMA DE MONITORAMENTO DE ALERTA DA BACIA HIDROGRÁFICA DO ALTO TIETÊ', pontos) +
    divisoria('DADOS PLUVIOMÉTRICOS<br>SUB-BACIAS ALTO TIETÊ') +
    paginasPluviometria(m, d.chuva, ano, mes) +
    divisoria('DADOS FLUVIOMÉTRICOS<br>PRINCIPAIS PONTOS DO SISTEMA<br>DE ALERTA/INUNDAÇÃO') +
    paginaEstatisticas(m, d.fluviometria, ano, mes) +
    paginasHidrogramas(m, d, ano, mes)
  );
}

// ---------------------------------------------------------------------------
// Boletim Mananciais
// ---------------------------------------------------------------------------

function graficoReservatorio(titulo: string, s: Record<string, SerieMes>, nomes: { barras: string; linhas: [string, string][]; volume: [string, string] }): string {
  return grafico({
    tipo: 'armazenamento', titulo, datas: Object.keys(s[nomes.volume[0]]!),
    barras: { nome: nomes.barras, valores: Object.values(s.chuva!) },
    linhas: nomes.linhas.map(([campo, nome]) => ({ nome, valores: Object.values(s[campo]!) })),
    volume: { nome: nomes.volume[1], valores: Object.values(s[nomes.volume[0]]!) },
  });
}

function paginasArmazenamento(m: Montagem, d: DadosMananciais, ano: number, mes: number): string {
  const vazia = Object.fromEntries(diasDoMes(ano, mes).map((dia) => [dia, null])) as SerieMes;
  let html = '';
  for (const s of d.sistemas) {
    const [aj, tabelaDias] = m.seriesEditaveis(
      `arm.${s.slug}`,
      { chuva: s.series.chuva ?? vazia, qnat: s.series.qnat ?? vazia, qjus: s.series.qjus ?? vazia, volume: s.series.volume ?? vazia },
      { chuva: 'Chuva (mm)', qnat: 'Qnat (m³/s)', qjus: 'Qjus (m³/s)', volume: 'Volume (%)' },
    );
    const titulo = `Condições de Armazenamento do ${esc(s.titulo)}`;
    if (!temDado(Object.values(aj))) {
      html += m.slide(titulo, aviso(`SSD SP Águas sem dados de ${esc(s.nome)} em ${esc(competencia(ano, mes, '/'))}.`) + tabelaDias);
      continue;
    }
    const g = graficoReservatorio(`ÍNDICE DE ARMAZENAMENTO DO ${s.nome.toUpperCase()} - ${MESES_ABREV[mes - 1]!.toUpperCase()}/${ano}`, aj, {
      barras: 'Chuva (mm)', linhas: [['qnat', 'Qnat (m³/s)'], ['qjus', 'Qjus (m³/s)']], volume: ['volume', 'Volume operacional (%)'],
    });
    html += m.slide(titulo, `${g}<p class="nota">Fonte: SSD SP Águas — chuva, vazão natural (Qnat), vazão defluente (Qjus) e volume útil (%) diários.</p>${tabelaDias}`);
  }
  return html;
}

function paginaHistorico(m: Montagem, d: DadosMananciais['historico'], ano: number, mes: number): string {
  // o ano do boletim em azul forte; os anteriores em cores bem diferentes entre si
  const cores = ['#0039C4', '#F59E0B', '#00B154', '#8B5CF6', '#94A3B8'];
  const series = [];
  for (let a = d.anoIni; a <= ano; a++) {
    series.push({ nome: String(a), cor: cores[(ano - a) % cores.length], valores: Array.from({ length: 12 }, (_, i) => d.volume[anoMes(a, i + 1)] ?? null) });
  }
  const g1 = grafico({ tipo: 'barras', titulo: 'Armazenamento nos Mananciais', rotulos: MESES_ABREV.map((x) => x.toUpperCase()), series, unidade: '%', max: 100 }, 380);
  const meses = Object.keys(d.producao).sort();
  const g2 = grafico(
    { tipo: 'linha', titulo: 'Produção Média Mensal', rotulos: meses.map((ym) => `${MESES_ABREV[Number(ym.slice(5)) - 1]!.toUpperCase()}/${ym.slice(2, 4)}`), valores: meses.map((ym) => d.producao[ym]), unidade: 'm³/s' },
    340,
  );
  return m.slide(
    `Histórico dos Sistemas Produtores<br>Armazenamento e Produção - ${esc(competencia(ano, mes, '/'))}`,
    `${g1}${g2}<p class="nota nota-fonte">Fonte: SSD SP Águas (Sistemas Sabesp RMSP: volume útil e vazão tratada). Dados sujeitos a alterações.</p>`,
  );
}

/** Dias conformes e não conformes ao padrão CONAMA 357/05 (médias diárias de OD, pH e turbidez). */
export function conformidadeConama(classe: keyof typeof CONAMA, medias: Record<'od' | 'ph' | 'turbidez', [string, number][]>) {
  const lim = CONAMA[classe];
  const regras = { od: (v: number) => v >= lim.od_min, ph: (v: number) => v >= lim.ph_min && v <= lim.ph_max, turbidez: (v: number) => v <= lim.turbidez_max };
  const contar = (p: 'od' | 'ph' | 'turbidez') => {
    const conformes = medias[p].filter(([, v]) => regras[p](v)).length;
    return { conformes, nao_conformes: medias[p].length - conformes, total: medias[p].length };
  };
  return { od: contar('od'), ph: contar('ph'), turbidez: contar('turbidez') };
}

function paginasQualidade(m: Montagem, d: DadosMananciais['qualidade'], ano: number, mes: number): string {
  let html = '';
  for (const { ponto, medias } of d) {
    const titulo = `Monitoramento Automático da Qualidade das Águas<br>${esc(ponto.local)} - ${esc(competencia(ano, mes, '/'))}`;
    const info =
      '<table class="qual-info"><tr><th>Ponto</th><th>Descrição</th><th>Sub-bacia</th><th>Sistema de monitoramento</th></tr>' +
      `<tr><td>${esc(ponto.codigo)}</td><td>${esc(ponto.local)}</td><td>${esc(SUBBACIAS[ponto.subbacia]!)}</td><td>CETESB/SIMQUA — médias diárias</td></tr></table>`;
    if (!medias) {
      html += m.slide(titulo, info + aviso(`SIMQUA sem resposta para ${esc(ponto.codigo)} em ${esc(competencia(ano, mes, '/'))}. Atualize o boletim em instantes.`));
      continue;
    }
    let conama = '';
    if (ponto.classe) {
      const c = conformidadeConama(ponto.classe, medias);
      const cel = (x: { conformes: number; nao_conformes: number; total: number }, k: 'conformes' | 'nao_conformes') => `<td>${x[k]}</td><td>${x.total ? `${num((x[k] / x.total) * 100, 1)}%` : '—'}</td>`;
      conama =
        `<div class="conama-titulo">Atendimento ao padrão de qualidade para corpos d'água ${ponto.classe === 'especial' ? 'classe Especial' : `classe ${ponto.classe}`} (CONAMA 357/05) — dias</div>` +
        '<table class="conama"><tr><th>Nº de dias</th><th colspan="2">Oxigênio Dissolvido (mg/L)</th><th colspan="2">pH</th><th colspan="2">Turbidez (NTU)</th></tr>' +
        `<tr class="conf"><td class="rot">Conformes</td>${cel(c.od, 'conformes')}${cel(c.ph, 'conformes')}${cel(c.turbidez, 'conformes')}</tr>` +
        `<tr class="nconf"><td class="rot">Não conformes</td>${cel(c.od, 'nao_conformes')}${cel(c.ph, 'nao_conformes')}${cel(c.turbidez, 'nao_conformes')}</tr>` +
        `<tr><td>Total</td><td>${c.od.total}</td><td>100%</td><td>${c.ph.total}</td><td>100%</td><td>${c.turbidez.total}</td><td>100%</td></tr></table>`;
    }
    const cels = PARAMETROS.map((p) => {
      const def = PARAMETROS_QUALIDADE[p];
      return `<h3>${esc(def.label)}${def.unidade ? ` (${esc(def.unidade)})` : ''}</h3>${grafico({ tipo: 'qualidade', titulo: def.label, unidade: def.unidade, cor: def.cor, ano, mes, valores: medias[p] }, 240)}`;
    });
    cels.push('<div class="nota">1) Médias diárias do SIMQUA; dias sem dado ficam em branco.<br>2) Linha tracejada: média do mês.</div>');
    html += m.slide(titulo, `${info}${conama}<div class="grade-qual">${cels.map((c) => `<div>${c}</div>`).join('')}</div>`);
  }
  return html;
}

export function htmlMananciais(d: DadosMananciais, ano: number, mes: number, e: Edicoes): string {
  const m = new Montagem(e);
  return (
    capa('mananciais', ano, mes) +
    mapa(m, 'MAPA MONITORAMENTO DA BACIA HIDROGRÁFICA DO ALTO TIETÊ', PONTOS_QUALIDADE.map((p) => ({ lat: p.lat, lng: p.lng, tipo: 'qualidade' as const, nome: p.codigo }))) +
    divisoria('MANANCIAIS - ALTO TIETÊ') +
    paginasArmazenamento(m, d, ano, mes) +
    paginaHistorico(m, d.historico, ano, mes) +
    divisoria('QUALIDADE DAS ÁGUAS<br>MANANCIAIS - ALTO TIETÊ') +
    paginasQualidade(m, d.qualidade, ano, mes)
  );
}

// ---------------------------------------------------------------------------
// Boletim Exutórios
// ---------------------------------------------------------------------------

const CAMPOS_RESERVATORIO = { chuva: 'Precipitação (mm)', afluente: 'Afluente (m³/s)', efluente: 'Efluente (m³/s)', volume: 'Volume (%)' };

function paginasReservatorios(m: Montagem, d: DadosExutorios, ano: number, mes: number): string {
  const titulo = 'Dados Operativos Hidráulicos e Hidrológicos dos<br>Reservatórios dos Exutórios';
  const dias = diasDoMes(ano, mes);
  const campos = Object.keys(CAMPOS_RESERVATORIO) as (keyof typeof CAMPOS_RESERVATORIO)[];
  let html = '';
  // Billings/Pedreira: SSD quando houver dados; senão, o cadastro manual. Pirapora: sempre manual.
  for (const r of [{ slug: 'pedreira' as const, nome: EXUTORIO_PEDREIRA.nome, ssd: d.pedreira }, { slug: 'pirapora' as const, nome: 'Reservatório Pirapora', ssd: null }]) {
    const manual = d.manuais[r.slug];
    const temManual = Object.keys(manual).some((dia) => dia.startsWith(anoMes(ano, mes)));
    const base = r.ssd ?? (Object.fromEntries(campos.map((c) => [c, Object.fromEntries(dias.map((dia) => [dia, manual[dia]?.[c] ?? null]))])) as Record<keyof typeof CAMPOS_RESERVATORIO, SerieMes>);
    const fonte = r.ssd ? 'Fonte: SSD SP Águas.' : temManual ? 'Fonte: dados operativos informados manualmente.' : 'Fonte: dados informados no boletim.';
    const [series, tabelaDias] = m.seriesEditaveis(`res.${r.slug}`, base, CAMPOS_RESERVATORIO);
    if (!temDado(Object.values(series))) {
      html += m.slide(
        titulo,
        aviso(
          `${esc(r.nome)}: sem dados de ${esc(competencia(ano, mes, '/'))}${r.slug === 'pedreira' ? ' no SSD SP Águas' : ''} e sem cadastro manual.<br>` +
            `Cadastre em <a href="exutorios?ano=${ano}&amp;mes=${mes}"><b>Dados dos exutórios</b></a> ou preencha a tabela no modo edição.`,
        ) + tabelaDias,
      );
      continue;
    }
    const g = graficoReservatorio(`${r.nome} - ${competencia(ano, mes, '/')}`, series, {
      barras: 'Precipitação (mm)', linhas: [['afluente', 'Vazão afluente (m³/s)'], ['efluente', 'Vazão efluente (m³/s)']], volume: ['volume', 'Volume armazenado (%)'],
    });
    html += m.slide(titulo, `${g}<p class="nota">${fonte}</p>${tabelaDias}`);
  }
  return html;
}

function paginasCarga(m: Montagem, cargas: DadosExutorios['manuais']['cargas'], ano: number, mes: number): string {
  const ym = anoMes(ano, mes);
  const nomeMes = MESES[mes - 1]!.toUpperCase();
  const tituloTab = 'CARGA ORGÂNICA<br>NO PINHEIROS/PIRAPORA';
  const atual = cargas[ym];
  if (!atual) {
    return m.slide(
      tituloTab,
      aviso(`Vazão e DBO dos exutórios de ${esc(competencia(ano, mes, '/'))} ainda não cadastradas.<br>Cadastre em <a href="exutorios?ano=${ano}&amp;mes=${mes}"><b>Dados dos exutórios</b></a>.`),
    );
  }
  // média do mesmo mês nos anos anteriores com amostragem
  const chaves = Object.keys(cargas).sort();
  const primeiroAno = Number(chaves.find((k) => Number(k.slice(5)) === mes)?.slice(0, 4) ?? ano);
  const anteriores: [number, (typeof cargas)[string]][] = [];
  const semAmostra: number[] = [];
  for (let a = primeiroAno; a < ano; a++) {
    const c = cargas[anoMes(a, mes)];
    if (c && cargaMes(c).total !== null) anteriores.push([a, c]);
    else semAmostra.push(a);
  }
  const media = (v: (number | null | undefined)[]) => {
    const validos = v.filter((x): x is number => x != null);
    return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
  };
  const mediaCampo = (campo: keyof (typeof cargas)[string]) => media(anteriores.map(([, c]) => c[campo]));
  const mediaCarga = (k: 'pinheiros' | 'tiete' | 'total') => media(anteriores.map(([, c]) => cargaMes(c)[k]));
  const cAtual = cargaMes(atual);
  const rotMedia = anteriores.length ? `${anteriores[0]![0]} a ${anteriores.at(-1)![0]}${semAmostra.length ? '*' : ''}<br>(média)` : 'Média<br>(sem histórico)';
  const tab =
    `<table class="carga"><tr><th rowspan="2">${esc(nomeMes)}</th><th colspan="2">VAZÃO <small>(m³/s)</small></th><th colspan="2">DBO <small>(mg/L)</small></th><th colspan="3">CARGA <small>(t/dia)</small></th></tr>` +
    '<tr><th class="sub">Pinheiros</th><th class="sub">Tietê</th><th class="sub">Pinheiros</th><th class="sub">Tietê</th><th class="sub">Pinheiros</th><th class="sub">Tietê</th><th class="sub">Total</th></tr>' +
    `<tr><td><b>${ano}</b></td><td>${num(atual.q_pinheiros)}</td><td>${num(atual.q_tiete)}</td><td>${num(atual.dbo_pinheiros)}</td><td>${num(atual.dbo_tiete)}</td>` +
    `<td>${num(cAtual.pinheiros, 0)}</td><td>${num(cAtual.tiete, 0)}</td><td><b>${num(cAtual.total, 0)}</b></td></tr>` +
    `<tr class="media"><td><b>${rotMedia}</b></td><td>${num(mediaCampo('q_pinheiros'))}</td><td>${num(mediaCampo('q_tiete'))}</td><td>${num(mediaCampo('dbo_pinheiros'))}</td><td>${num(mediaCampo('dbo_tiete'))}</td>` +
    `<td>${num(mediaCarga('pinheiros'), 0)}</td><td>${num(mediaCarga('tiete'), 0)}</td><td><b>${num(mediaCarga('total'), 0)}</b></td></tr></table>` +
    `${semAmostra.length ? `<p class="nota">*Em ${semAmostra.join(', ')} não houve amostragem cadastrada.</p>` : ''}<p class="nota">Carga (t/dia) = vazão (m³/s) × DBO (mg/L) × 0,0864.</p>`;

  // carga do mesmo mês ao longo dos anos + média dos anos anteriores
  const rotulos: string[] = [];
  const valores: (number | null)[] = [];
  for (let a = primeiroAno; a <= ano; a++) {
    rotulos.push(`${MESES_ABREV[mes - 1]}-${String(a).slice(2)}`);
    valores.push(cargaMes(cargas[anoMes(a, mes)]).total);
  }
  const ref = mediaCarga('total');
  const g1 = grafico({
    tipo: 'linha', titulo: `Carga de Matéria Orgânica - ${nomeMes} — Exutórios do Tietê e Pinheiros`, rotulos, valores, unidade: 't/dia',
    referencia: ref, nome_referencia: ref === null ? '' : `${num(ref, 0)} t/dia (média)`, zero: true,
  });
  // histórico de todos os meses, do primeiro cadastrado até o do boletim
  const serie: Record<string, number | null> = {};
  for (let [a, mm] = [Number(chaves[0]!.slice(0, 4)), Number(chaves[0]!.slice(5))]; anoMes(a, mm) <= ym; mm === 12 ? ([a, mm] = [a + 1, 1]) : mm++) {
    serie[anoMes(a, mm)] = cargaMes(cargas[anoMes(a, mm)]).total;
  }
  const g2 = grafico({ tipo: 'historico_carga', titulo: 'Carga de Matéria Orgânica — Somatório dos Exutórios dos Rios Tietê e Pinheiros', serie, mes, nome_mes: MESES[mes - 1]!.toLowerCase() });
  const tituloHist = 'HISTÓRICO DA CARGA DE MATÉRIA ORGÂNICA<br>EXPORTADA PELA UGRHI-ALTO TIETÊ';
  return m.slide(tituloTab, tab) + m.slide(tituloHist, g1) + m.slide(tituloHist, g2);
}

export function htmlExutorios(d: DadosExutorios, ano: number, mes: number, e: Edicoes): string {
  const m = new Montagem(e);
  return (
    capa('exutorios', ano, mes) +
    mapa(m, 'MAPA MONITORAMENTO DA BACIA HIDROGRÁFICA DO ALTO TIETÊ', EXUTORIOS_MAPA.map((p) => ({ ...p, tipo: 'exutorio' as const }))) +
    divisoria('EXUTÓRIOS - ALTO TIETÊ') +
    paginasReservatorios(m, d, ano, mes) +
    paginasCarga(m, d.manuais.cargas, ano, mes)
  );
}

/** Aviso do topo quando alguma fonte ainda não respondeu. */
export function avisoPendencias(pendencias: Iterable<string>): string {
  const lista = [...pendencias];
  if (!lista.length) return '';
  return aviso(
    `<b>Dados ainda chegando das fontes:</b> ${lista.slice(0, 8).map(esc).join('; ')}${lista.length > 8 ? ` e mais ${lista.length - 8}` : ''}.<br>` +
      'A primeira consulta de um mês demora (o SIBH leva alguns minutos); a busca continua em segundo plano. Recarregue a página em instantes para completar o boletim.',
  );
}

export { NOMES };
