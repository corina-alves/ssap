/**
 * Tabela de dados dos gráficos (colada de planilha ou CSV) — parte sem banco de
 * GraficoService.php do PHP. A configuração guardada em graficos.config é:
 *
 *   { "fonte_dados": "manual",
 *     "rotulos": ["Jan", "Fev"],
 *     "series": [ {"nome": "2025", "valores": [10.5, null]} ],
 *     "unidade": "mm", "eixo_y": "Precipitação", "empilhado": false,
 *     "cores": {"2025": "#1f5c99"} }        (opcional: cor fixa por série)
 */

export const TIPOS = { linha: 'Linhas', barra: 'Barras', area: 'Área', pizza: 'Pizza' } as const;
export type Tipo = keyof typeof TIPOS;
export const MAX_SERIES = 8;
export const MAX_LINHAS = 1000;

export type SerieGrafico = { nome: string; valores: (number | null)[]; cor?: string };
export type ConfigGrafico = {
  fonte_dados?: string;
  rotulos?: string[];
  series?: SerieGrafico[];
  unidade?: string;
  eixo_y?: string;
  empilhado?: boolean;
  cores?: Record<string, string>;
};

export class ErroValidacao extends Error {
  constructor(readonly erros: string[]) {
    super(erros.join(' '));
  }
}

const RE_COR = /^#[0-9a-fA-F]{6}$/;
export const corValida = (c: unknown): c is string => typeof c === 'string' && RE_COR.test(c);

/** "1.234,5" / "1234.5" / "" / "-" → número ou null; inválido → false. */
function numero(bruto: string): number | null | false {
  let v = bruto.replace(/ /g, '');
  if (v === '' || v === '-' || v === '—') return null;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  return v !== '' && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(v) ? Number(v) : false;
}

/** Divide uma linha CSV simples, aceitando campos entre aspas. */
function colunas(linha: string, sep: string): string[] {
  const saida: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]!;
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') atual += linha[++i];
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"' && atual === '') aspas = true;
    else if (c === sep) {
      saida.push(atual);
      atual = '';
    } else atual += c;
  }
  saida.push(atual);
  return saida.map((x) => x.trim());
}

/**
 * Lê a tabela colada: 1ª linha = cabeçalho (rótulo; série 1; série 2...),
 * demais = rótulo; valores. Separador: tabulação, ponto e vírgula ou vírgula;
 * número com vírgula ou ponto decimal.
 */
export function lerTabela(texto: string): { rotulos: string[]; series: SerieGrafico[] } {
  const linhas = texto.trim().split(/\r\n|\r|\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
  if (linhas.length < 2) throw new ErroValidacao(['Dados: informe o cabeçalho e ao menos uma linha de valores.']);
  if (linhas.length - 1 > MAX_LINHAS) throw new ErroValidacao([`Dados: no máximo ${MAX_LINHAS} linhas.`]);

  const sep = linhas[0]!.includes('\t') ? '\t' : linhas[0]!.includes(';') ? ';' : ',';
  const cab = colunas(linhas[0]!, sep);
  const nSeries = cab.length - 1;
  if (nSeries < 1 || nSeries > MAX_SERIES) throw new ErroValidacao([`Dados: use de 1 a ${MAX_SERIES} séries (colunas depois do rótulo).`]);

  const series: SerieGrafico[] = Array.from({ length: nSeries }, (_, i) => ({ nome: [...(cab[i + 1] || `Série ${i + 1}`)].slice(0, 60).join(''), valores: [] }));
  const rotulos: string[] = [];
  const erros: string[] = [];
  linhas.slice(1).forEach((linha, n) => {
    const cols = colunas(linha, sep);
    rotulos.push([...(cols[0] ?? '')].slice(0, 60).join(''));
    for (let i = 1; i <= nSeries; i++) {
      const bruto = cols[i] ?? '';
      let v = numero(bruto);
      if (v === false) {
        erros.push(`Dados: valor inválido "${bruto.slice(0, 20)}" na linha ${n + 2}.`);
        v = null;
      }
      series[i - 1]!.valores.push(v);
    }
  });
  if (erros.length) throw new ErroValidacao(erros.slice(0, 5));
  return { rotulos, series };
}

const celula = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));

/** Texto "Rótulo;Série 1;..." a partir de rótulos e séries (para o formulário e para salvar análises). */
export function tabelaDe(g: { rotulos: (string | number)[]; series: SerieGrafico[] }): string {
  const limpo = (t: string | number) => String(t).replace(/;/g, ',');
  return [
    ['Rótulo', ...g.series.map((s) => limpo(s.nome))].join(';'),
    ...g.rotulos.map((r, i) => [limpo(r), ...g.series.map((s) => celula(s.valores[i]))].join(';')),
  ].join('\n');
}

/** Acrescenta 'cor' às séries que têm cor fixa (pelo nome da série). */
export function comCores(series: SerieGrafico[], cores: unknown): SerieGrafico[] {
  const mapa = cores && typeof cores === 'object' ? (cores as Record<string, unknown>) : {};
  return series.map((s) => (corValida(mapa[s.nome]) ? { ...s, cor: mapa[s.nome] as string } : s));
}

/** Configuração pronta para o Chart.js (public/acesso/js/graficos.js). */
export function paraChart(g: { tipo: string; titulo: string; fonte: string | null; config: ConfigGrafico | null }) {
  const cfg = g.config ?? {};
  return {
    tipo: g.tipo,
    titulo: g.titulo,
    rotulos: cfg.rotulos ?? [],
    series: comCores(cfg.series ?? [], cfg.cores),
    unidade: cfg.unidade ?? '',
    eixo_y: cfg.eixo_y ?? '',
    empilhado: !!cfg.empilhado,
    fonte: g.fonte,
  };
}

/** "Vazão × MLT — 2026" → "vazao-mlt-2026" (para o endereço do gráfico). */
export function slug(texto: string, max = 100): string {
  const s = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, max).replace(/-+$/, '') || 'grafico';
}
