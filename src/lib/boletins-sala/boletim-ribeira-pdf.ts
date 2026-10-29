import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { CAPIVARI, PROPAGACAO_RIBEIRA } from '@/conteudo/boletim-ribeira';
import type { Dado } from '../integracoes/comum';
import type { Chuva, Estruturas, Niveis, Referencias } from './boletim-ribeira';
import {
  dataHoraCab,
  dataHoraH,
  diagnostico,
  diaMes,
  fmt,
  fmtSinal,
  hora,
  periodo,
  rotuloSituacao,
  sintese,
  sinteseResumo,
  SITUACOES,
  TEXTO_TENDENCIA,
  textoVolumeCopel,
  type PontoRibeira,
  type Tendencia,
  type VolumeCopel,
} from './boletim-ribeira-regras';

/**
 * PDF do Sumário Executivo — Vale do Ribeira (período fechado das 07h às 07h),
 * gerado no servidor com os mesmos dados, textos e seções da página e do
 * sumário que a Sala emite (sem navegador e sem edição manual).
 * Fontes padrão do PDF (Helvetica): os textos passam por `limpar`, que tira os
 * caracteres fora do WinAnsi (setas etc.).
 */

export type ConteudoPdf = {
  ref: Referencias;
  geradoEm: number;
  niveis: Dado<Niveis>;
  estruturas: Dado<Estruturas>;
  chuva: Dado<Chuva>;
  copel: VolumeCopel;
  /** Endereço público do boletim, citado no rodapé. */
  endereco: string;
};

const A4: [number, number] = [595.28, 841.89];
const M = 36; // margem
const L = A4[0] - 2 * M; // largura útil
const RODAPE = 30;

const cor = (hex: string): RGB => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
const C = {
  azul: cor('#0b5d89'),
  azulTitulo: cor('#1f497d'),
  azulClaro: cor('#eaf5fb'),
  texto: cor('#1f2f39'),
  cinza: cor('#526772'),
  cinzaClaro: cor('#64757f'),
  borda: cor('#bccbd4'),
  branco: rgb(1, 1, 1),
  laranja: cor('#ef9f14'),
  laranjaFundo: cor('#fffdf8'),
  avisoFundo: cor('#fff8e6'),
  avisoBorda: cor('#f0c36d'),
  sobe: cor('#c0392b'),
};
const COR_SITUACAO: Record<string, RGB> = {
  NORMAL: cor('#4caf50'),
  ATENÇÃO: cor('#f4b400'),
  ALERTA: cor('#ef8500'),
  EMERGÊNCIA: cor('#8e44ad'),
  EXTRAVASAMENTO: cor('#f44336'),
  'SEM DADO': cor('#9aa7ae'),
  'SEM COTAS': cor('#9aa7ae'),
};
/** Só caracteres que a Helvetica padrão (WinAnsi) codifica. */
export const limpar = (t: string) => t.replace(/[  ]/g, ' ').replace(/[^\n\x20-\x7e\xa0-\xff–—‘’“”•…]/g, '');

let logo: Uint8Array | null = null;
async function bytesLogo(): Promise<Uint8Array | null> {
  try {
    logo ??= new Uint8Array(await readFile(/*turbopackIgnore: true*/ join(process.cwd(), 'public', 'boletins', 'automatico', 'spaguas.png')));
  } catch {
    return null; // sem o logo, o PDF sai só com o título
  }
  return logo;
}

const imagens = new Map<string, Uint8Array>();
/** Outra imagem de public/boletins/automatico (o esquema da bacia); sem ela, a seção sai só com o título. */
async function bytesImagem(nome: string): Promise<Uint8Array | null> {
  try {
    if (!imagens.has(nome)) imagens.set(nome, new Uint8Array(await readFile(/*turbopackIgnore: true*/ join(process.cwd(), 'public', 'boletins', 'automatico', nome))));
  } catch {
    return null;
  }
  return imagens.get(nome)!;
}

type Trecho = { t: string; negrito?: boolean; cor?: RGB };
type Celula = string | { t: string; negrito?: boolean; cor?: RGB; fundo?: RGB; centro?: boolean };
type Coluna = { titulo: string; largura: number; centro?: boolean };

class Escritor {
  pagina!: PDFPage;
  y = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly normal: PDFFont,
    readonly negrito: PDFFont,
  ) {
    this.novaPagina();
  }

  novaPagina() {
    this.pagina = this.doc.addPage(A4);
    this.y = A4[1] - M;
  }

  /** Abre página nova se não couber `altura`. */
  garantir(altura: number) {
    if (this.y - altura < M + RODAPE) this.novaPagina();
  }

  fonte(negrito?: boolean) {
    return negrito ? this.negrito : this.normal;
  }

  /**
   * Quebra os trechos em linhas de até `largura`. Palavras seguidas com a mesma
   * fonte e cor viram um só texto (com os espaços), para o leitor de PDF
   * espaçar como a própria fonte manda.
   */
  linhas(trechos: Trecho[], tamanho: number, largura: number): { t: string; f: PDFFont; cor?: RGB; x: number }[][] {
    const saida: { t: string; f: PDFFont; cor?: RGB; x: number }[][] = [[]];
    let x = 0;
    let espacoAntes = false;
    const espaco = this.normal.widthOfTextAtSize(' ', tamanho);
    for (const tr of trechos) {
      const f = this.fonte(tr.negrito);
      for (const palavra of limpar(tr.t).split(/(\s+)/)) {
        if (!palavra) continue;
        if (/^\s+$/.test(palavra)) {
          if (palavra.includes('\n')) {
            saida.push([]); // quebra de linha pedida no texto
            x = 0;
            espacoAntes = false;
          } else espacoAntes = x > 0;
          continue;
        }
        const w = f.widthOfTextAtSize(palavra, tamanho);
        if (x > 0 && x + (espacoAntes ? espaco : 0) + w > largura) {
          saida.push([]);
          x = 0;
          espacoAntes = false;
        }
        const linha = saida.at(-1)!;
        const anterior = linha.at(-1);
        if (anterior && anterior.f === f && anterior.cor === tr.cor) anterior.t += `${espacoAntes ? ' ' : ''}${palavra}`;
        else linha.push({ t: palavra, f, cor: tr.cor, x: x + (espacoAntes ? espaco : 0) });
        x += (espacoAntes ? espaco : 0) + w;
        espacoAntes = false;
      }
    }
    return saida;
  }

  paragrafo(trechos: Trecho[] | string, o: { tamanho?: number; cor?: RGB; recuo?: number; largura?: number; depois?: number; marcador?: string } = {}) {
    const tamanho = o.tamanho ?? 9;
    const lh = tamanho * 1.35;
    const recuo = o.recuo ?? 0;
    const lista = typeof trechos === 'string' ? [{ t: trechos }] : trechos;
    const linhas = this.linhas(lista, tamanho, (o.largura ?? L) - recuo);
    if (linhas.length <= 4) this.garantir(linhas.length * lh); // parágrafo curto não se parte entre páginas
    for (const [n, linha] of linhas.entries()) {
      this.garantir(lh);
      if (n === 0 && o.marcador) this.pagina.drawText(o.marcador, { x: M + recuo - 9, y: this.y - tamanho, size: tamanho, font: this.normal, color: o.cor ?? C.texto });
      for (const p of linha) this.pagina.drawText(p.t, { x: M + recuo + p.x, y: this.y - tamanho, size: tamanho, font: p.f, color: p.cor ?? o.cor ?? C.texto });
      this.y -= lh;
    }
    this.y -= o.depois ?? 3;
  }

  secao(titulo: string) {
    this.garantir(40);
    this.y -= 8;
    this.pagina.drawText(limpar(titulo), { x: M, y: this.y - 10.5, size: 10.5, font: this.negrito, color: C.azulTitulo });
    this.y -= 17;
  }

  /** Quadro com borda e fundo (diagnóstico, avisos). */
  quadro(trechos: Trecho[], borda: RGB, fundo: RGB, tamanho = 9) {
    const lh = tamanho * 1.35;
    const linhas = this.linhas(trechos, tamanho, L - 16);
    const altura = linhas.length * lh + 10;
    this.garantir(altura);
    this.pagina.drawRectangle({ x: M, y: this.y - altura, width: L, height: altura, color: fundo, borderColor: borda, borderWidth: 0.8 });
    let y = this.y - 5;
    for (const linha of linhas) {
      for (const p of linha) this.pagina.drawText(p.t, { x: M + 8 + p.x, y: y - tamanho, size: tamanho, font: p.f, color: p.cor ?? C.texto });
      y -= lh;
    }
    this.y -= altura + 6;
  }

  aviso(texto: string) {
    this.quadro([{ t: texto }], C.avisoBorda, C.avisoFundo, 8.5);
  }

  tabela(colunas: Coluna[], linhas: Celula[][], tamanho = 8) {
    const lh = tamanho * 1.3;
    const total = colunas.reduce((a, c) => a + c.largura, 0);
    const larguras = colunas.map((c) => (c.largura / total) * L);
    const altura = (celulas: Celula[], f: (c: Celula) => boolean) =>
      Math.max(...celulas.map((c, i) => this.linhas([{ t: typeof c === 'string' ? c : c.t, negrito: f(c) }], tamanho, larguras[i]! - 8).length)) * lh + 7;

    const desenharLinha = (celulas: Celula[], cabecalho: boolean) => {
      const h = altura(celulas, (c) => cabecalho || (typeof c !== 'string' && !!c.negrito));
      let x = M;
      for (const [i, c] of celulas.entries()) {
        const w = larguras[i]!;
        const cel = typeof c === 'string' ? { t: c } : c;
        const fundo = cabecalho ? C.azul : 'fundo' in cel ? cel.fundo : undefined;
        this.pagina.drawRectangle({ x, y: this.y - h, width: w, height: h, color: fundo, borderColor: C.borda, borderWidth: 0.6 });
        const negrito = cabecalho || ('negrito' in cel && !!cel.negrito);
        const centro = cabecalho || colunas[i]!.centro || ('centro' in cel && cel.centro);
        const linhasCel = this.linhas([{ t: cel.t, negrito }], tamanho, w - 8);
        let y = this.y - 4;
        for (const linha of linhasCel) {
          const larg = linha.length ? linha.at(-1)!.x + linha.at(-1)!.f.widthOfTextAtSize(linha.at(-1)!.t, tamanho) : 0;
          const x0 = centro ? x + (w - larg) / 2 : x + 4;
          for (const p of linha) {
            this.pagina.drawText(p.t, { x: x0 + p.x, y: y - tamanho, size: tamanho, font: p.f, color: cabecalho ? C.branco : ('cor' in cel && cel.cor) || C.texto });
          }
          y -= lh;
        }
        x += w;
      }
      this.y -= h;
    };

    const cab = colunas.map((c) => c.titulo);
    const hCab = altura(cab, () => true);
    this.garantir(hCab + 20);
    desenharLinha(cab, true);
    for (const l of linhas) {
      const h = altura(l, (c) => typeof c !== 'string' && !!c.negrito);
      if (this.y - h < M + RODAPE) {
        this.novaPagina();
        desenharLinha(cab, true);
      }
      desenharLinha(l, false);
    }
    this.y -= 4;
  }

  nota(texto: string) {
    this.paragrafo([{ t: texto }], { tamanho: 7, cor: C.cinzaClaro, depois: 2 });
  }
}

const tendenciaTexto = (t: Tendencia | null) => (t ? TEXTO_TENDENCIA[t] : '—');
const corVariacao = (v: number | null) => (v === null ? undefined : v > 0 ? C.sobe : v < 0 ? C.azul : C.cinza);
const metros = (n: number | null) => (n === null ? '—' : `${fmt(n)} m`);

/** Cabeçalho de página do sumário emitido: título, subtítulo, "RÓTULO | valor" e o logo. */
function cabecalho(e: Escritor, imagem: PDFImage | null, titulo: string, subtitulo: string, rotulo: string, valor: string) {
  const p = e.pagina;
  const topo = e.y;
  if (imagem) {
    const w = 78;
    const h = (imagem.height / imagem.width) * w;
    p.drawImage(imagem, { x: M + L - w, y: topo - h, width: w, height: h });
  }
  p.drawText(limpar(titulo), { x: M, y: topo - 17, size: 15, font: e.negrito, color: C.azul });
  p.drawText(limpar(subtitulo), { x: M, y: topo - 31, size: 9, font: e.negrito, color: C.cinza });
  p.drawText(limpar(`${rotulo} | ${valor}`), { x: M, y: topo - 45, size: 9, font: e.negrito, color: C.texto });
  e.y = topo - 54;
  p.drawLine({ start: { x: M, y: e.y }, end: { x: M + L, y: e.y }, thickness: 2, color: C.azul });
  e.y -= 6;
}

/** Cartões do sumário emitido: pontos monitorados (com leitura) e a contagem por situação. */
function cartoes(e: Escritor, pontos: PontoRibeira[]) {
  const com = pontos.filter((p) => !p.semDado);
  const situacao = (p: PontoRibeira) => (p.semCotas ? 'NORMAL' : p.situacao);
  const itens: [string, string, RGB][] = [
    [String(com.length), 'PONTOS MONITORADOS', cor('#1481b7')],
    ...SITUACOES.map((s): [string, string, RGB] => [String(com.filter((p) => situacao(p) === s).length), s, COR_SITUACAO[s]!]),
  ];
  const w = L / itens.length;
  const h = 40;
  e.garantir(h + 6);
  for (const [i, [n, rotulo, c]] of itens.entries()) {
    const x = M + i * w;
    e.pagina.drawRectangle({ x, y: e.y - h, width: w, height: h, borderColor: C.borda, borderWidth: 0.6 });
    const wn = e.negrito.widthOfTextAtSize(n, 18);
    e.pagina.drawText(n, { x: x + (w - wn) / 2, y: e.y - 21, size: 18, font: e.negrito, color: c });
    const r = limpar(rotulo);
    const wr = e.negrito.widthOfTextAtSize(r, 6.4);
    e.pagina.drawText(r, { x: x + (w - wr) / 2, y: e.y - 33, size: 6.4, font: e.negrito, color: C.texto });
  }
  e.y -= h + 6;
}

/** Imagem centralizada, até `altMax` de altura (o esquema da bacia: a página 1 inteira cabe numa folha). */
function imagemLargura(e: Escritor, img: PDFImage, altMax = 180) {
  const h = Math.min(altMax, (img.height / img.width) * L);
  const w = (img.width / img.height) * h;
  e.garantir(h + 4);
  e.pagina.drawImage(img, { x: M + (L - w) / 2, y: e.y - h, width: w, height: h });
  e.y -= h + 6;
}

export async function gerarPdf(c: ConteudoPdf): Promise<Uint8Array> {
  const { ref } = c;
  const fechamento = dataHoraCab(ref.t07);
  const per = periodo(ref.t07Ontem, ref.t07);
  const doc = await PDFDocument.create();
  doc.setTitle(`Sumário Executivo — Vale do Ribeira — ${fechamento}`);
  doc.setAuthor('Sala de Situação São Paulo — SP Águas');
  doc.setSubject(`Operação de controle de cheias no Vale do Ribeira de Iguape, período de ${per}, gerado automaticamente com dados do SIBH, da Open-Meteo e da Copel.`);
  doc.setCreator('Sala de Situação São Paulo — sumário automático');
  doc.setProducer('SSAP (pdf-lib)');
  doc.setLanguage('pt-BR');
  doc.setCreationDate(new Date(c.geradoEm));
  const [normal, negrito, bytes, bytesEsquema] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    bytesLogo(),
    bytesImagem('diagrama-ribeira.png'),
  ]);
  const imagem = bytes ? await doc.embedPng(bytes).catch(() => null) : null;
  const esquema = bytesEsquema ? await doc.embedPng(bytesEsquema).catch(() => null) : null;
  const e = new Escritor(doc, normal, negrito);

  // ================================================== página 1 — estruturas
  cabecalho(e, imagem, 'SUMÁRIO EXECUTIVO', 'OPERAÇÃO DE CONTROLE DE CHEIAS', 'SITUAÇÃO GERAL', fechamento);

  e.secao("BACIA DO RIO RIBEIRA DO IGUAPE: PRINCIPAIS CURSOS D'ÁGUA E ESTRUTURAS");
  if (esquema) imagemLargura(e, esquema);

  e.secao('CHUVA NA BACIA DO RIO RIBEIRA DO IGUAPE (UGRHI 11)');
  if (!c.chuva.ok) e.aviso(c.chuva.mensagem);
  else {
    const d = c.chuva.dados;
    e.tabela(
      [
        { titulo: 'Últimas 3hrs (mm)', largura: 1, centro: true },
        { titulo: 'Últimas 24hrs (mm)', largura: 1, centro: true },
        { titulo: 'Previsão 24hrs (mm)', largura: 1, centro: true },
      ],
      [[`${fmt(d.ultimas3h, 1)} mm`, `${fmt(d.ultimas24h, 1)} mm`, `${fmt(d.previsao24h, 1)} mm`].map((t) => ({ t, negrito: true }))],
    );
    e.nota(
      `Fontes: Previsão - Open-Meteo (média na área da UGRHI 11, ${d.pontosPrevisao} pontos de grade, 24 h seguintes às ${hora(ref.t07)}) | Chuva observada - rede telemétrica SP-ÁGUAS (${d.postos} postos, acumulado até as ${hora(ref.t07)}) | Atualizado em ${fechamento}`,
    );
  }

  e.secao('SITUAÇÃO ATUAL DE ESTRUTURAS DE INTERESSE');
  const vol = textoVolumeCopel(c.copel);
  const est = c.estruturas;
  const cap = est.ok ? est.dados.capivari : null;
  e.tabela(
    [
      { titulo: 'Eixo', largura: 12 },
      { titulo: 'Estrutura', largura: 22 },
      { titulo: 'Volume útil (%)', largura: 12, centro: true },
      { titulo: 'Cota atual (1) (m)', largura: 14, centro: true },
      { titulo: 'Vazão defluente (m³/s)', largura: 14, centro: true },
      { titulo: `Variação (m) (${per})`, largura: 13, centro: true },
      { titulo: `Variação (m³/s) (${per})`, largura: 13, centro: true },
    ],
    [
      [
        'Rio Capivari',
        `Barragem Capivari — UHE Gov. Parigot de Souza (${CAPIVARI.prefix})`,
        { t: vol.valor, negrito: true },
        fmt(cap?.cota),
        fmt(cap?.vazao),
        { t: fmtSinal(cap?.variacaoCota ?? null), cor: corVariacao(cap?.variacaoCota ?? null), negrito: true },
        { t: fmtSinal(cap?.variacaoVazao ?? null), cor: corVariacao(cap?.variacaoVazao ?? null), negrito: true },
      ],
    ],
  );
  e.nota(
    `(1) Nível máximo de operação (m): ${fmt(CAPIVARI.nivelMaximoOperacao)}; Nível máximo maximorum (m): ${fmt(CAPIVARI.nivelMaximoMaximorum)}. Fonte dos dados: SIBH-SPÁGUAS / ANA (posto ${CAPIVARI.prefix}). Volume útil: ${vol.detalhe} Fonte: Copel — Monitoramento Hidrológico de Bacias.`,
  );
  if (!est.ok) e.aviso(`Capivari e barramentos: ${est.mensagem}`);

  if (est.ok) {
    e.secao('SITUAÇÃO DOS BARRAMENTOS DE INTERESSE — UHEs/PCHs NAS CABECEIRAS DO RIO JUQUIÁ');
    e.tabela(
      [
        { titulo: 'PONTO', largura: 28 },
        { titulo: 'NÍVEL ANTERIOR', largura: 15, centro: true },
        { titulo: 'NÍVEL ATUAL', largura: 15, centro: true },
        { titulo: 'JUSANTE', largura: 13, centro: true },
        { titulo: 'VARIAÇÃO', largura: 15, centro: true },
        { titulo: 'TENDÊNCIA', largura: 14, centro: true },
      ],
      est.dados.barramentos.map((b): Celula[] => [
        b.nome,
        metros(b.anterior),
        metros(b.atual),
        b.jusante === null ? '—' : `${fmt(b.jusante)} m³/s`,
        { t: b.variacao === null ? '—' : `${fmtSinal(b.variacao)} m`, cor: corVariacao(b.variacao), negrito: true },
        { t: tendenciaTexto(b.tendencia), cor: corVariacao(b.variacao), negrito: true },
      ]),
    );
    e.nota(`Fonte: SIBH-SPÁGUAS / ANA. Nível anterior: 07h de ${diaMes(ref.t07Ontem)}; nível atual: 07h de ${diaMes(ref.t07)}.`);
  }

  // ================================================== página 2 — pontos de monitoramento
  e.novaPagina();
  cabecalho(e, imagem, 'SITUAÇÃO DOS PONTOS DE MONITORAMENTO (NÍVEL)', 'VALE DO RIBEIRA DE IGUAPE — DADOS AUTOMÁTICOS VIA API SIBH-SPÁGUAS', 'ATUALIZADO EM', fechamento);
  const n = c.niveis;
  if (!n.ok) e.aviso(`Níveis dos pontos de monitoramento: ${n.mensagem}`);
  else {
    const pontos = [...n.dados.pontos].sort((a, b) => a.ordemRio - b.ordemRio);
    if (n.desatualizado && n.dados.atualizadoEm) e.aviso(`Atenção: a leitura mais recente recebida do SIBH até as ${hora(ref.t07)} de ${diaMes(ref.t07)} é de ${dataHoraCab(n.dados.atualizadoEm)}.`);
    cartoes(e, pontos);

    e.secao('LEITURA DO SISTEMA — PROPAGAÇÃO DA CHEIA NO VALE DO RIBEIRA');
    const extravasando = PROPAGACAO_RIBEIRA.filter((x) => {
      const p = pontos.find((q) => q.id === x.id);
      return p && !p.semDado && !p.semCotas && p.situacao === 'EXTRAVASAMENTO';
    });
    if (extravasando.length) {
      e.tabela(
        extravasando.map((x) => ({ titulo: x.rotulo, largura: 1, centro: true })),
        [extravasando.map(() => ({ t: 'EXTRAVASAMENTO', fundo: COR_SITUACAO.EXTRAVASAMENTO, cor: C.branco, negrito: true, centro: true }))],
      );
    } else {
      e.tabela([{ titulo: 'Nenhum ponto do eixo principal em extravasamento', largura: 1, centro: true }], [[{ t: 'NORMAL', fundo: COR_SITUACAO.NORMAL, cor: C.branco, negrito: true, centro: true }]]);
    }

    const emExtrav = (p: PontoRibeira) => !p.semDado && !p.semCotas && p.situacao === 'EXTRAVASAMENTO' && p.acima !== null;
    e.tabela(
      [
        { titulo: 'PONTOS CRÍTICOS', largura: 32 },
        { titulo: `NÍVEL ${hora(ref.t07Ontem).toUpperCase()}/${diaMes(ref.t07Ontem)}`, largura: 14, centro: true },
        { titulo: `NÍVEL ${hora(ref.t07).toUpperCase()}/${diaMes(ref.t07)}`, largura: 14, centro: true },
        { titulo: 'VARIAÇÃO', largura: 13, centro: true },
        { titulo: 'ACIMA DA COTA', largura: 13, centro: true },
        { titulo: 'TENDÊNCIA', largura: 14, centro: true },
      ],
      pontos.map((p): Celula[] => [
        p.nome,
        metros(p.nivel07),
        metros(p.atual),
        { t: p.variacao === null ? '—' : `${fmtSinal(p.variacao)} m`, cor: corVariacao(p.variacao), negrito: true },
        emExtrav(p) ? { t: `${fmtSinal(p.acima)} m`, cor: C.sobe, negrito: true } : '—',
        { t: tendenciaTexto(p.tendencia), cor: corVariacao(p.variacao), negrito: true },
      ]),
    );

    e.quadro([{ t: 'DIAGNÓSTICO EXECUTIVO  ', negrito: true, cor: cor('#e48a00') }, { t: diagnostico(pontos, ref.t07) }], C.laranja, C.laranjaFundo);

    e.secao('SÍNTESE DA SITUAÇÃO NOS PONTOS COM EXTRAVASAMENTO');
    e.paragrafo(sinteseResumo(pontos), { tamanho: 8.5, depois: 4 });
    for (const p of pontos) {
      const r = rotuloSituacao(p);
      e.paragrafo(
        [
          { t: `${p.nome.replace(/\s*\(([^)]+)\)\s*$/, ', $1')}: `, negrito: true, cor: r === 'NORMAL' ? C.texto : COR_SITUACAO[r] },
          ...sintese(p, ref.t07).map((x) => ({ t: x.t, negrito: x.b })),
        ],
        { tamanho: 8.5, depois: 4 },
      );
    }
  }
  e.nota(`Diagrama unifilar em tempo real (plataforma SIBH-SPÁGUAS) e versão on-line deste sumário: ${c.endereco}`);

  // ---- rodapé
  const paginas = doc.getPages();
  for (const [i, p] of paginas.entries()) {
    const t = limpar(`Sumário Executivo — Vale do Ribeira · período de ${per} · gerado automaticamente em ${dataHoraH(c.geradoEm)} · página ${i + 1} de ${paginas.length}`);
    p.drawLine({ start: { x: M, y: M + 14 }, end: { x: M + L, y: M + 14 }, thickness: 0.5, color: C.borda });
    p.drawText(t, { x: M, y: M + 4, size: 7, font: normal, color: C.cinzaClaro });
  }
  return doc.save();
}
