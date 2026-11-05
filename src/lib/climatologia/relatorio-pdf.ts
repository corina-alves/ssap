import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { FONTE_CLIMATOLOGIA, FONTE_TELEMETRIA, METODOLOGIA } from '@/conteudo/climatologia-metodologia';
import { limpar } from '../boletins-sala/boletim-ribeira-pdf';
import { UGRHIS } from '../hidrologia/situacao-rios';
import type { Atualizacao } from './painel';
import { ANOS_NORMAL, type Estatistica } from './regras';
import { faixaDesvio, MESES, MESES_LONGOS, ROTULO_FONTE, ROTULO_TIPO, type Comparacao, type Fonte, type Selecao } from './selecao';

/**
 * Relatório em PDF do Painel de Climatologia: UGRHI, intervalo, indicadores,
 * climatologia mensal com a chuva do ano, comparação entre UGRHIs, metodologia
 * e fontes. Gerado no servidor com os dados já processados (pdf-lib).
 */

export type ConteudoRelatorio = {
  s: Selecao & { ano: number; mes: number };
  /** De onde veio a chuva observada (a climatologia é sempre do acervo). */
  fonte: Fonte;
  atual: Comparacao;
  comparacao: Comparacao[];
  est: Estatistica[];
  observadoMeses: (number | null)[];
  atualizacao: Atualizacao;
  endereco: string;
};

const A4: [number, number] = [595.28, 841.89];
const M = 40;
const AZUL = rgb(0.043, 0.18, 0.31);
const CINZA = rgb(0.39, 0.46, 0.5);
const CLARO = rgb(0.48, 0.61, 0.78);
const ESCURO = rgb(0.043, 0.33, 0.58);

const txt = (t: string) => limpar(t.replace(/Σ\s*/g, 'soma de ').replace(/≥/g, '>=').replace(/≤/g, '<='));
const num = (v: number | null, casas = 1) => (v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const pct = (v: number | null, sinal = false) => (v === null ? '—' : `${sinal && v > 0 ? '+' : ''}${num(v)}%`);

class Folha {
  pagina!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    readonly fonte: PDFFont,
    readonly negrito: PDFFont,
  ) {
    this.nova();
  }
  nova() {
    this.pagina = this.doc.addPage(A4);
    this.y = A4[1] - M;
  }
  espaco(h: number) {
    if (this.y - h < M + 20) this.nova();
  }
  linhas(t: string, tamanho: number, largura: number, f = this.fonte): string[] {
    const saida: string[] = [];
    let linha = '';
    for (const p of txt(t).split(/\s+/)) {
      const tentativa = linha ? `${linha} ${p}` : p;
      if (f.widthOfTextAtSize(tentativa, tamanho) > largura && linha) {
        saida.push(linha);
        linha = p;
      } else linha = tentativa;
    }
    if (linha) saida.push(linha);
    return saida;
  }
  paragrafo(t: string, { tamanho = 9, f = this.fonte, cor = rgb(0.15, 0.2, 0.24), recuo = 0, depois = 4, margemDireita = 0 } = {}) {
    const ls = this.linhas(t, tamanho, A4[0] - 2 * M - recuo - margemDireita, f);
    this.espaco(Math.min(ls.length, 3) * (tamanho + 3));
    for (const l of ls) {
      this.espaco(tamanho + 3);
      this.pagina.drawText(l, { x: M + recuo, y: this.y - tamanho, size: tamanho, font: f, color: cor });
      this.y -= tamanho + 3;
    }
    this.y -= depois;
  }
  secao(t: string) {
    this.espaco(40);
    this.y -= 6;
    this.pagina.drawText(txt(t.toUpperCase()), { x: M, y: this.y - 11, size: 10.5, font: this.negrito, color: AZUL });
    this.y -= 15;
    this.pagina.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.8, color: CLARO });
    this.y -= 6;
  }
  /** Tabela simples: larguras em fração da largura útil; colunas depois da primeira alinhadas à direita. */
  tabela(cab: string[], linhas: string[][], larguras: number[], tamanho = 8) {
    const util = A4[0] - 2 * M;
    const xs = larguras.reduce<number[]>((acc, w, i) => [...acc, (acc[i] ?? 0) + w * util], [0]);
    const desenhar = (cols: string[], f: PDFFont, fundo?: boolean) => {
      this.espaco(tamanho + 6);
      if (fundo) this.pagina.drawRectangle({ x: M, y: this.y - tamanho - 4, width: util, height: tamanho + 6, color: rgb(0.92, 0.95, 0.98) });
      cols.forEach((c, i) => {
        const t = txt(c);
        const w = f.widthOfTextAtSize(t, tamanho);
        const x = i === 0 ? M + xs[i]! + 2 : M + xs[i + 1]! - w - 3;
        this.pagina.drawText(t, { x, y: this.y - tamanho - 1, size: tamanho, font: f, color: rgb(0.15, 0.2, 0.24) });
      });
      this.y -= tamanho + 6;
    };
    desenhar(cab, this.negrito, true);
    for (const l of linhas) {
      if (this.y - tamanho - 6 < M + 20) {
        this.nova();
        desenhar(cab, this.negrito, true);
      }
      desenhar(l, this.fonte);
    }
    this.y -= 6;
  }
}

/** Gráfico mensal: barras da climatologia e pontos da chuva do ano. */
function graficoMensal(f: Folha, clima: (number | null)[], obs: (number | null)[], ano: number) {
  const alto = 150;
  f.espaco(alto + 30);
  const util = A4[0] - 2 * M - 30;
  const x0 = M + 30;
  const y0 = f.y - alto;
  const max = Math.max(10, ...clima.map((v) => v ?? 0), ...obs.map((v) => v ?? 0)) * 1.1;
  const passo = max > 400 ? 100 : max > 200 ? 50 : 25;
  for (let v = 0; v <= max; v += passo) {
    const y = y0 + (v / max) * alto;
    f.pagina.drawLine({ start: { x: x0, y }, end: { x: x0 + util, y }, thickness: 0.3, color: rgb(0.88, 0.91, 0.93) });
    f.pagina.drawText(String(v), { x: M, y: y - 3, size: 7, font: f.fonte, color: CINZA });
  }
  const largura = util / 12;
  let anterior: [number, number] | null = null;
  for (let i = 0; i < 12; i++) {
    const xc = x0 + largura * i + largura / 2;
    if (clima[i] !== null) f.pagina.drawRectangle({ x: xc - largura * 0.3, y: y0, width: largura * 0.6, height: (clima[i]! / max) * alto, color: CLARO });
    f.pagina.drawText(MESES[i]!, { x: xc - 8, y: y0 - 10, size: 7, font: f.fonte, color: CINZA });
    if (obs[i] !== null) {
      const p: [number, number] = [xc, y0 + (obs[i]! / max) * alto];
      if (anterior) f.pagina.drawLine({ start: { x: anterior[0], y: anterior[1] }, end: { x: p[0], y: p[1] }, thickness: 1.5, color: ESCURO });
      f.pagina.drawCircle({ x: p[0], y: p[1], size: 2.5, color: ESCURO });
      anterior = p;
    } else anterior = null;
  }
  f.pagina.drawRectangle({ x: x0, y: y0 - 24, width: 10, height: 6, color: CLARO });
  f.pagina.drawText('Média climatológica do mês', { x: x0 + 14, y: y0 - 24, size: 7, font: f.fonte, color: CINZA });
  f.pagina.drawCircle({ x: x0 + 150, y: y0 - 21, size: 2.5, color: ESCURO });
  f.pagina.drawText(`Chuva de ${ano}`, { x: x0 + 156, y: y0 - 24, size: 7, font: f.fonte, color: CINZA });
  f.y = y0 - 34;
}

let logo: Uint8Array | null | undefined;
async function bytesLogo(): Promise<Uint8Array | null> {
  if (logo !== undefined) return logo;
  try {
    logo = new Uint8Array(await readFile(/*turbopackIgnore: true*/ join(process.cwd(), 'public', 'boletins', 'automatico', 'spaguas.png')));
  } catch {
    logo = null;
  }
  return logo;
}

export async function gerarRelatorio(c: ConteudoRelatorio): Promise<Uint8Array> {
  const { s, atual } = c;
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const nomeUgrhi = `UGRHI ${s.ugrhi} — ${UGRHIS[s.ugrhi] ?? ''}`;
  const intervalo = s.acumulado === 'mes' ? `${MESES_LONGOS[s.mes - 1]} de ${s.ano}` : s.acumulado === 'ytd' ? `janeiro a ${MESES_LONGOS[s.mes - 1]} de ${s.ano}` : `ano de ${s.ano}`;
  const periodo = `${s.periodo[0]}–${s.periodo[1]}`;
  doc.setTitle(txt(`Climatologia — ${nomeUgrhi} — ${intervalo}`));
  doc.setAuthor('SP Águas — Sala de Situação');
  doc.setSubject('Relatório de climatologia da chuva por UGRHI');
  doc.setLanguage('pt-BR');

  const f = new Folha(doc, fonte, negrito);
  const png = await bytesLogo();
  if (png) {
    const img = await doc.embedPng(png);
    const w = 70;
    f.pagina.drawImage(img, { x: A4[0] - M - w, y: f.y - (w * img.height) / img.width, width: w, height: (w * img.height) / img.width });
  }
  f.pagina.drawText(txt('RELATÓRIO DE CLIMATOLOGIA DA CHUVA'), { x: M, y: f.y - 14, size: 14, font: negrito, color: AZUL });
  f.y -= 22;
  // o texto do cabeçalho não passa por baixo do logo
  f.paragrafo(nomeUgrhi, { tamanho: 12, f: negrito, cor: AZUL, depois: 2, margemDireita: 90 });
  f.paragrafo(`Intervalo analisado: ${intervalo}. Chuva observada: ${ROTULO_FONTE[c.fonte]}. Referência: ${periodo}. Média espacial: ${s.metodo === 'thiessen' ? 'Thiessen (ponderada por área)' : 'média aritmética dos postos'}. Critério de qualidade: ${s.criterio === 'padrao' ? 'padrão' : 'estrito'}.`, { cor: CINZA, margemDireita: 90 });
  f.paragrafo(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`, { tamanho: 8, cor: CINZA, depois: 8 });

  f.secao('Indicadores');
  f.tabela(
    ['Indicador', 'Valor', 'Observação'],
    [
      ['Precipitação observada', `${num(atual.observado)} mm`, atual.observado === null ? 'sem dado válido em todo o intervalo' : ''],
      ['Média climatológica', `${num(atual.climatologia)} mm`, `${ROTULO_TIPO[atual.tipo]} (${atual.anosClimatologia} anos)`],
      ['Percentual da climatologia', pct(atual.percentual), faixaDesvio(atual.desvio)],
      ['Desvio', pct(atual.desvio, true), atual.desvioMm === null ? '' : `${atual.desvioMm > 0 ? '+' : ''}${num(atual.desvioMm)} mm`],
      ['Estações consideradas', atual.postos === null ? '—' : String(atual.postos), s.acumulado === 'mes' ? 'postos com o mês válido' : 'menor número entre os meses'],
      ['Cobertura espacial', pct(atual.cobertura), 'área perto de um posto válido'],
    ],
    [0.34, 0.2, 0.46],
  );
  if (s.periodo[1] - s.periodo[0] + 1 < ANOS_NORMAL) f.paragrafo(`Período recente (${periodo}): o valor é a média histórica dos anos com dado válido no acervo, não a normal climatológica (que é de 30 anos).`, { tamanho: 8.5, f: negrito, cor: rgb(0.6, 0.35, 0) });
  else if (atual.tipo !== 'normal') f.paragrafo(`Atenção: ${ROTULO_TIPO[atual.tipo].toLowerCase()} — menos de 80% dos anos de ${periodo} têm dado válido neste intervalo; o valor não é a normal climatológica.`, { tamanho: 8.5, f: negrito, cor: rgb(0.6, 0.35, 0) });

  f.secao(`Climatologia mensal e chuva de ${s.ano}`);
  graficoMensal(f, Array.from({ length: 12 }, (_, i) => c.est[i + 1]?.media ?? null), c.observadoMeses, s.ano);
  f.tabela(
    ['Mês', 'Média (mm)', 'Anos válidos', 'Tipo', `${s.ano} (mm)`, 'Desvio (%)'],
    [
      ...MESES.map((m, i) => {
        const e = c.est[i + 1];
        const o = c.observadoMeses[i] ?? null;
        const d = o !== null && e?.media ? Math.round((1000 * o) / e.media - 1000) / 10 : null;
        return [m, num(e?.media ?? null), String(e?.anosValidos ?? 0), e ? (e.tipo === 'normal' ? 'normal' : e.tipo === 'media_historica' ? 'média hist.' : 'insuf.') : '—', num(o), pct(d, true)];
      }),
      ['Ano', num(c.est[0]?.media ?? null), String(c.est[0]?.anosValidos ?? 0), c.est[0]?.tipo === 'normal' ? 'normal' : '—', c.observadoMeses.every((v) => v !== null) ? num(c.observadoMeses.reduce((t, v) => t + v!, 0)) : '—', ''],
    ],
    [0.14, 0.17, 0.16, 0.17, 0.18, 0.18],
  );

  f.secao(`Comparação entre UGRHIs — ${intervalo}`);
  f.tabela(
    ['UGRHI', 'Observado (mm)', 'Climatologia (mm)', '% da média', 'Desvio (%)'],
    c.comparacao.map((x) => [`${x.ugrhi} — ${UGRHIS[x.ugrhi] ?? ''}`, num(x.observado), num(x.climatologia), pct(x.percentual), pct(x.desvio, true)]),
    [0.44, 0.14, 0.16, 0.13, 0.13],
    7.5,
  );

  f.secao('Metodologia');
  for (const sec of METODOLOGIA) {
    f.paragrafo(sec.titulo, { tamanho: 9, f: negrito, depois: 1 });
    for (const i of sec.itens) f.paragrafo(`• ${i}`, { tamanho: 8, recuo: 8, depois: 1 });
    f.y -= 4;
  }

  f.secao('Fontes e rastreabilidade');
  const at = c.atualizacao;
  f.paragrafo(`Média climatológica: ${FONTE_CLIMATOLOGIA}.`, { tamanho: 8 });
  if (c.fonte === 'telemetria') f.paragrafo(`Chuva observada: ${FONTE_TELEMETRIA}.`, { tamanho: 8 });
  f.paragrafo(
    `Acervo no banco da Sala: ${at.postos} postos e ${at.meses.toLocaleString('pt-BR')} meses${at.anos ? ` (${at.anos[0]}–${at.anos[1]})` : ''}. Última importação: ${at.importacao ? at.importacao.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}; último cálculo: ${at.calculo ? at.calculo.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}.`,
    { tamanho: 8 },
  );
  f.paragrafo(`Consulta: ${c.endereco}`, { tamanho: 7.5, cor: CINZA });

  const paginas = doc.getPages();
  paginas.forEach((p, i) =>
    p.drawText(txt(`SP Águas — Sala de Situação · Climatologia por UGRHI · página ${i + 1} de ${paginas.length}`), { x: M, y: 22, size: 7, font: fonte, color: CINZA }),
  );
  return doc.save();
}
