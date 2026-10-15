import { ErroValidacao, type SerieGrafico } from '../graficos-tabela';
import { somarDias } from '../integracoes/comum';
import { catalogo, FREQ_DIARIA, FREQ_MENSAL, serie } from '../integracoes/ssd';
import { acumular, MESES, mltMensal, PRIMEIRO_ANO, rotuloAno, valoresPeriodo, type PorAno } from './analise-mlt';
import { somarMeses } from './sistemas-ssd';

/**
 * Gráficos com dados do SSD SP Águas — qualquer série do catálogo (sistemas,
 * reservatórios, transferências/túneis, ETAs, postos, bacias). Porte de
 * SsdGraficos.php e graficos/criar-ssd.php. Três formatos:
 *
 *   tempo  — até 6 séries (local + variável) ao longo de um período;
 *   anos   — uma série mensal com vários anos sobrepostos e a MLT;
 *   locais — uma variável em vários locais, resumida no período (barras).
 *
 * Uma variável é identificada por "nome|unidade" (ex.: "Volume útil|%"),
 * porque o SSD tem a mesma variável em unidades diferentes.
 */

/** spaceType do SSD → rótulo do grupo na tela (na ordem de exibição). */
const GRUPOS: Record<string, string> = {
  WaterSystem: 'Sistemas produtores',
  Reservoir: 'Reservatórios',
  Transfer: 'Transferências, túneis e elevatórias',
  WaterTreatmentPlant: 'Estações de tratamento (ETA)',
  Station: 'Postos fluviométricos',
  Basin: 'Bacias (vazão natural)',
};

export const AGREGACOES = {
  auto: 'Automática (chuva = soma, demais = média)',
  media: 'Média',
  soma: 'Soma',
  ultimo: 'Último valor',
  minimo: 'Mínimo',
  maximo: 'Máximo',
} as const;
type Agregacao = Exclude<keyof typeof AGREGACOES, 'auto'>;

/** Cor fixa por local (id do space no SSD), igual ao gráfico "Vazões de Descargas PCJ". */
const CORES_LOCAIS: Record<number, string> = {
  12: '#1f5c99', // Atibainha — azul
  20: '#ed7d31', // Jaguari / Jacareí — laranja
  15: '#1e7b34', // Cachoeira — verde
};

export const FORMATOS = {
  tempo: 'Série no tempo (locais e variáveis à escolha)',
  anos: 'Comparar anos (mês a mês × MLT)',
  locais: 'Comparar locais (barras)',
} as const;
export const PERIODOS = {
  chuvoso: 'Período chuvoso atual (out–mar)',
  seco: 'Período seco atual (abr–set)',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  '12m': 'Últimos 12 meses',
  ano: 'Este ano',
  '5a': 'Últimos 5 anos',
  personalizado: 'Escolher as datas',
} as const;
export const TIPOS = { linha: 'Linhas', barra: 'Barras', 'barra-empilhada': 'Barras empilhadas', area: 'Área' } as const;
export const MAX_SERIES = 6;
const MAX_DIAS_DIARIO = 3660; // série diária: até ~10 anos

type Local = { nome: string; grupo: string; variaveis: Record<string, string>; ids: Map<string, number> };
export type Catalogo = {
  /** [rótulo do grupo, [id do local, nome][]] na ordem de exibição */
  grupos: [string, [number, string][]][];
  locais: Map<number, Local>;
  /** chave "nome|unidade" → rótulo, em ordem alfabética */
  variaveis: [string, string][];
};

const ordenar = <T>(lista: T[], texto: (x: T) => string) => [...lista].sort((a, b) => texto(a).localeCompare(texto(b), 'pt-BR'));

/** Locais e as variáveis de cada um, a partir do catálogo do SSD. */
export async function catalogoGraficos(): Promise<Catalogo> {
  const c = await catalogo();
  if (!c.ok || !c.dados.length) throw new Error('Catálogo do SSD vazio.');
  const locais = new Map<number, Local>();
  for (const s of c.dados) {
    const l: Local = locais.get(s.spaceId) ?? { nome: s.space, grupo: GRUPOS[s.spaceTipo] ? s.spaceTipo : 'Outros', variaveis: {}, ids: new Map() };
    const chave = `${s.variavel}|${s.unidade}`;
    l.variaveis[chave] = s.variavel + (s.unidade ? ` (${s.unidade})` : '');
    l.ids.set(`${chave}|${s.frequencia}`, s.id);
    locais.set(s.spaceId, l);
  }
  const grupos: Catalogo['grupos'] = [];
  for (const g of [...Object.keys(GRUPOS), 'Outros']) {
    const lista = [...locais].filter(([, l]) => l.grupo === g).map(([id, l]): [number, string] => [id, l.nome]);
    if (lista.length) grupos.push([GRUPOS[g] ?? 'Outros', ordenar(lista, (x) => x[1])]);
  }
  const todas: Record<string, string> = {};
  for (const l of locais.values()) Object.assign(todas, l.variaveis);
  return { grupos, locais, variaveis: ordenar(Object.entries(todas), (x) => x[1]) };
}

const partes = (chave: string): [nome: string, unidade: string] => {
  const i = chave.indexOf('|');
  return i < 0 ? [chave, ''] : [chave.slice(0, i), chave.slice(i + 1)];
};

/** Agregação usada quando o usuário deixa "automática". */
function agregacaoPadrao(chave: string): Agregacao {
  const [nome] = partes(chave);
  return nome === 'Chuva' ? 'soma' : nome === 'Chuva acumulada' ? 'ultimo' : 'media';
}

/** Resume uma lista de valores (na ordem do tempo). */
function agregar(v: number[], ag: Agregacao): number | null {
  if (!v.length) return null;
  if (ag === 'soma') return v.reduce((t, x) => t + x, 0);
  if (ag === 'ultimo') return v[v.length - 1]!;
  if (ag === 'minimo') return Math.min(...v);
  if (ag === 'maximo') return Math.max(...v);
  return v.reduce((t, x) => t + x, 0) / v.length;
}

/** Pontos de uma série (data → valor), sem os vazios. */
async function pontos(cat: Catalogo, space: number, chave: string, frequencia: number, de: string, ate: string): Promise<Map<string, number>> {
  const local = cat.locais.get(space);
  const id = local?.ids.get(`${chave}|${frequencia}`);
  if (!id) {
    throw new ErroValidacao([`${local?.nome ?? `Local ${space}`}: o SSD não tem "${partes(chave)[0]}" ${frequencia === FREQ_MENSAL ? 'mensal' : 'diária'} para este local.`]);
  }
  const r = await serie(id, de, ate);
  if (!r.ok) throw new Error(r.mensagem);
  return new Map(r.dados.pontos.map((p) => [p.data, p.valor]));
}

const arred3 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 1000) / 1000);
const br = (ymd: string) => `${ymd.slice(8)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
export const dataCurta = (ymd: string, mensal: boolean) =>
  mensal ? `${MESES[Number(ymd.slice(5, 7)) - 1]}/${ymd.slice(0, 4)}` : `${ymd.slice(8)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)}`;
const dataValida = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v ? v : null);

export type Parametros = Record<string, string | string[] | undefined>;
export type ResumoTempo = { nome: string; unidade: string; media: number | null; soma: number | null; minimo: number | null; maximo: number | null; ultimo: number | null; ultimaData: string | null; n: number };
export type ResumoLocal = { nome: string; valor: number | null; n: number; ultimaData: string | null };
export type Grafico = { tipo: string; unidade: string; eixo_y: string; empilhado: boolean; rotulos: string[]; series: SerieGrafico[] };

/**
 * Monta a tela inteira a partir dos parâmetros (da URL ao mostrar, do
 * formulário ao salvar). `erro` = SSD indisponível; `avisos` = escolhas que
 * não deram gráfico (variável que o local não tem, período longo demais...).
 */
export async function graficoSsd(p: Parametros, hoje: string) {
  const texto = (k: string) => {
    const v = p[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
  };
  const anoValido = (v: string) => (/^\d{4}$/.test(v) && Number(v) >= PRIMEIRO_ANO && Number(v) <= Number(hoje.slice(0, 4)) ? Number(v) : null);

  let cat: Catalogo | null = null;
  let erro: string | null = null;
  try {
    cat = await catalogoGraficos();
  } catch {
    erro = 'Não foi possível obter o catálogo do SSD agora. Tente novamente em instantes.';
  }

  const primeiraVez = p.formato === undefined;
  const formato = (Object.hasOwn(FORMATOS, texto('formato')) ? texto('formato') : 'tempo') as keyof typeof FORMATOS;
  const periodo = (Object.hasOwn(PERIODOS, texto('periodo')) ? texto('periodo') : 'chuvoso') as keyof typeof PERIODOS;
  const freq = texto('freq') === 'mensal' ? 'mensal' : 'diaria';
  const tipo = (Object.hasOwn(TIPOS, texto('tipo')) ? texto('tipo') : formato === 'locais' ? 'barra' : primeiraVez ? 'barra-empilhada' : 'linha') as keyof typeof TIPOS;
  const agregacao = (Object.hasOwn(AGREGACOES, texto('agregacao')) ? texto('agregacao') : 'auto') as keyof typeof AGREGACOES;
  const hidro = texto('hidro') === '1';
  const acumulado = texto('acumulado') === '1';

  // Linhas "local + variável". Na primeira visita: descargas de Atibainha, Jaguari/Jacareí e Cachoeira (PCJ).
  const linhas = Array.from({ length: MAX_SERIES }, (_, i) => {
    const l = Number(texto(`local${i + 1}`)) || 0;
    return { local: cat?.locais.has(l) ? l : 0, variavel: texto(`var${i + 1}`) };
  });
  if (primeiraVez) [12, 20, 15].forEach((space, i) => (linhas[i] = { local: space, variavel: 'Vazão descarregada|m³/s' }));

  // Comparar locais: uma variável, vários locais
  const varLocais = texto('var_locais') || 'Volume útil|%';
  const pedidos = p.locais === undefined ? [] : Array.isArray(p.locais) ? p.locais : [p.locais];
  let locaisSel = pedidos.map(Number).filter((l) => cat?.locais.has(l));

  // ---- Datas do período
  const y = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  let ini: string;
  let fim = hoje;
  if (periodo === 'chuvoso') {
    ini = `${mes >= 10 ? y : y - 1}-10-01`;
    fim = `${mes >= 10 ? y + 1 : y}-03-31`;
  } else if (periodo === 'seco') {
    ini = `${mes >= 4 ? y : y - 1}-04-01`;
    fim = `${mes >= 4 ? y : y - 1}-09-30`;
  } else if (periodo === '30d') ini = somarDias(hoje, -30);
  else if (periodo === '90d') ini = somarDias(hoje, -90);
  else if (periodo === '12m') ini = `${somarMeses(hoje.slice(0, 7), -12)}-01`;
  else if (periodo === 'ano') ini = `${y}-01-01`;
  else if (periodo === '5a') ini = `${y - 5}-01-01`;
  else {
    ini = dataValida(texto('de')) ?? somarDias(hoje, -90);
    fim = dataValida(texto('ate')) ?? hoje;
  }
  if (fim > hoje) fim = hoje;
  if (ini > fim) [ini, fim] = [fim, ini];
  const freqSsd = freq === 'mensal' ? FREQ_MENSAL : FREQ_DIARIA;
  const mensal = freq === 'mensal';

  let grafico: Grafico | null = null;
  let titulo = '';
  const avisos: string[] = [];
  let resumoTempo: ResumoTempo[] = [];
  let resumoLocais: ResumoLocal[] = [];
  let tabelaAnos: { mlt: (number | null)[]; anos: { y: number; valores: (number | null)[] }[] } | null = null;
  let anosSel: number[] = [];
  let mltDe: number | null = null;
  let mltAte: number | null = null;
  const nomeLocal = (id: number) => cat?.locais.get(id)?.nome ?? `Local ${id}`;

  if (cat) {
    try {
      if (formato === 'tempo') {
        // ------------------------------------------------ Série no tempo
        if (!mensal && (Date.parse(fim) - Date.parse(ini)) / 86_400_000 > MAX_DIAS_DIARIO) {
          throw new ErroValidacao(['Período longo demais para dados diários (máximo de 10 anos). Use a frequência mensal.']);
        }
        const series: { local: number; variavel: string; pontos: Map<string, number> }[] = [];
        for (const l of linhas) {
          if (!l.local || !l.variavel) continue;
          if (!cat.locais.get(l.local)?.variaveis[l.variavel]) {
            avisos.push(`${nomeLocal(l.local)} não tem "${partes(l.variavel)[0]}" no SSD.`);
            continue;
          }
          try {
            series.push({ ...l, pontos: await pontos(cat, l.local, l.variavel, freqSsd, ini, fim) });
          } catch (e) {
            if (!(e instanceof ErroValidacao)) throw e;
            avisos.push(...e.erros);
          }
        }
        if (!series.length) throw new ErroValidacao(['Escolha pelo menos um local e uma variável com dados no SSD.']);
        const datas = [...new Set(series.flatMap((s) => [...s.pontos.keys()]))].sort();
        const vars = [...new Set(series.map((s) => s.variavel))];
        const unidades = [...new Set(vars.map((v) => partes(v)[1]))];
        const umaVar = vars.length === 1;
        if (unidades.length > 1) avisos.push(`As séries têm unidades diferentes (${unidades.join(', ')}) no mesmo eixo.`);
        const [nomeVar, unidade] = partes(vars[0]!);
        grafico = {
          tipo: tipo === 'barra-empilhada' ? 'barra' : tipo,
          empilhado: tipo === 'barra-empilhada',
          unidade: unidades.length === 1 ? unidade : '',
          eixo_y: umaVar ? nomeVar : 'Valor',
          rotulos: datas.map((d) => dataCurta(d, mensal)),
          series: series.map((s) => {
            const [n, u] = partes(s.variavel);
            const cor = umaVar ? CORES_LOCAIS[s.local] : undefined;
            return {
              ...(cor ? { cor } : {}),
              nome: nomeLocal(s.local) + (umaVar ? '' : ` — ${n}${u ? ` (${u})` : ''}`),
              valores: datas.map((d) => arred3(s.pontos.get(d))),
            };
          }),
        };
        resumoTempo = series.map((s, i) => {
          const vals = [...s.pontos.values()];
          return {
            nome: grafico!.series[i]!.nome, unidade: partes(s.variavel)[1],
            media: agregar(vals, 'media'), soma: agregar(vals, 'soma'), minimo: agregar(vals, 'minimo'), maximo: agregar(vals, 'maximo'),
            ultimo: agregar(vals, 'ultimo'), ultimaData: [...s.pontos.keys()].pop() ?? null, n: vals.length,
          };
        });
        const nomes = [...new Set(series.map((s) => nomeLocal(s.local)))];
        titulo = `${umaVar ? nomeVar : 'Séries do SSD'} — ${nomes.join(', ')} — ${br(ini)} a ${br(fim)}`;
      } else if (formato === 'anos') {
        // ------------------------------------------------ Comparar anos
        const l = linhas[0]!;
        if (!l.local || !cat.locais.get(l.local)?.variaveis[l.variavel]) throw new ErroValidacao(['Escolha um local e uma variável que existam no SSD.']);
        const [nomeVar, unidade] = partes(l.variavel);
        const pts = await pontos(cat, l.local, l.variavel, FREQ_MENSAL, `${PRIMEIRO_ANO}-01-01`, hoje);
        if (!pts.size) throw new ErroValidacao(['O SSD não retornou dados para esta série.']);
        const porAno: PorAno = {};
        for (const [d, v] of pts) (porAno[Number(d.slice(0, 4))] ??= {})[Number(d.slice(5, 7))] = v;
        const anosComDado = Object.keys(porAno).map(Number);
        const inicio = Math.min(...anosComDado);
        const fimAno = Math.max(...anosComDado);
        mltDe = anoValido(texto('mlt_de')) ?? inicio;
        mltAte = anoValido(texto('mlt_ate')) ?? fimAno;
        const periodoAno = hidro ? 'hidrologico' : 'ano';
        const ordem = hidro ? [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const { mlt } = mltMensal(porAno, mltDe, mltAte);
        const mltOrdem = ordem.map((m) => arred3(mlt[m - 1]));
        anosSel = Array.from({ length: MAX_SERIES }, (_, i) => anoValido(texto(`ano${i + 1}`))).filter((a): a is number => a !== null);
        if (!anosSel.length) {
          const ultimaData = [...pts.keys()].pop()!;
          const ultimo = hidro && Number(ultimaData.slice(5, 7)) < 10 ? fimAno - 1 : fimAno;
          anosSel = [ultimo, ultimo - 1, hidro ? 2013 : 2014].filter((a) => a >= inicio);
        }
        anosSel = [...new Set(anosSel)];
        const acum = acumulado && nomeVar === 'Chuva';
        const anos = anosSel.map((a) => ({ y: a, valores: valoresPeriodo(porAno, periodoAno, a).map(arred3) }));
        tabelaAnos = { mlt: mltOrdem, anos };
        grafico = {
          tipo: tipo === 'barra' || tipo === 'barra-empilhada' ? 'barra' : 'linha',
          unidade,
          eixo_y: nomeVar + (acum ? ' acumulada' : ''),
          empilhado: false,
          rotulos: ordem.map((m) => MESES[m - 1]!),
          series: [
            { nome: `MLT (${mltDe}–${mltAte})${acum ? ' acumulada' : ''}`, valores: acum ? acumular(mltOrdem) : mltOrdem },
            ...anos.map((a) => ({ nome: rotuloAno(periodoAno, a.y), valores: acum ? acumular(a.valores) : a.valores })),
          ],
        };
        titulo = `${nomeVar} — ${nomeLocal(l.local)} — ${hidro ? 'anos hidrológicos' : 'anos'} × MLT`;
      } else {
        // ------------------------------------------------ Comparar locais
        if (!cat.variaveis.some(([k]) => k === varLocais)) throw new ErroValidacao(['Escolha uma variável.']);
        const [nomeVar, unidade] = partes(varLocais);
        const comVar = [...cat.locais].filter(([, l]) => l.variaveis[varLocais]);
        if (!locaisSel.length) {
          // Primeira vez: os reservatórios (ou todos os locais) que têm a variável
          const reservatorios = comVar.filter(([, l]) => l.grupo === 'Reservoir');
          locaisSel = (reservatorios.length ? reservatorios : comVar).map(([id]) => id);
        }
        const ag = agregacao === 'auto' ? agregacaoPadrao(varLocais) : agregacao;
        const rotulos: string[] = [];
        const valores: (number | null)[] = [];
        for (const space of locaisSel) {
          if (!comVar.some(([id]) => id === space)) continue;
          let pts: Map<string, number>;
          try {
            pts = await pontos(cat, space, varLocais, freqSsd, ini, fim);
          } catch (e) {
            if (!(e instanceof ErroValidacao)) throw e;
            avisos.push(...e.erros);
            continue;
          }
          const v = agregar([...pts.values()], ag);
          rotulos.push(nomeLocal(space));
          valores.push(arred3(v));
          resumoLocais.push({ nome: nomeLocal(space), valor: v, n: pts.size, ultimaData: [...pts.keys()].pop() ?? null });
        }
        if (!rotulos.length) throw new ErroValidacao(['Nenhum dos locais escolhidos tem dados desta variável no período.']);
        const rotAg = AGREGACOES[ag].toLocaleLowerCase('pt-BR');
        grafico = { tipo: 'barra', unidade, eixo_y: nomeVar, empilhado: false, rotulos, series: [{ nome: `${nomeVar} (${rotAg}, ${br(ini)} a ${br(fim)})`, valores }] };
        titulo = `${nomeVar} por local — ${rotAg} de ${br(ini)} a ${br(fim)}`;
      }
    } catch (e) {
      grafico = null;
      resumoTempo = [];
      resumoLocais = [];
      if (e instanceof ErroValidacao) avisos.push(...e.erros);
      else erro = 'Não foi possível obter os dados do SSD agora. Tente novamente em instantes.';
    }
  }

  // Parâmetros atuais, para os campos ocultos do "salvar"
  const parametros: Record<string, string> = {
    formato, periodo, de: ini, ate: fim, freq, tipo, agregacao, hidro: hidro ? '1' : '0', acumulado: acumulado ? '1' : '0',
    var_locais: varLocais, mlt_de: texto('mlt_de'), mlt_ate: texto('mlt_ate'),
  };
  linhas.forEach((l, i) => {
    parametros[`local${i + 1}`] = l.local ? String(l.local) : '';
    parametros[`var${i + 1}`] = l.variavel;
  });
  anosSel.forEach((a, i) => (parametros[`ano${i + 1}`] = String(a)));

  return {
    cat, erro, avisos, formato, periodo, freq, mensal, tipo, agregacao, hidro, acumulado, linhas, varLocais, locaisSel, ini, fim,
    grafico, titulo: titulo.slice(0, 255), resumoTempo, resumoLocais, tabelaAnos, anosSel, mltDe, mltAte, parametros,
  };
}

export type GraficoSsd = Awaited<ReturnType<typeof graficoSsd>>;
