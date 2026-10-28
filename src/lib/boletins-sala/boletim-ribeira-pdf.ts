import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { CAPIVARI } from '@/conteudo/boletim-ribeira';
import type { Dado } from '../integracoes/comum';
import type { Chuva, Estruturas, Niveis, Referencias } from './boletim-ribeira';
import {
  classificados,
  dataHoraH,
  diagnostico,
  diaMes,
  fmt,
  fmtSinal,
  horaH,
  observacoes,
  rotuloSituacao,
  sintese,
  SITUACOES,
  TEXTO_TENDENCIA,
  textoVolumeCopel,
  type PontoRibeira,
  type Tendencia,
  type VolumeCopel,
} from './boletim-ribeira-regras';

/**
 * PDF do Boletim Executivo Público — Vale do Ribeira, gerado no servidor com
 * os mesmos dados e textos da página (sem navegador e sem edição manual).
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
const FUNDO_SITUACAO: Record<string, RGB> = {
  ALERTA: cor('#fff4e5'),
  EMERGÊNCIA: cor('#f5ecfa'),
  EXTRAVASAMENTO: cor('#fdecea'),
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

function cabecalho(e: Escritor, imagem: PDFImage | null, c: ConteudoPdf, referencia: number | null) {
  const p = e.pagina;
  const topo = e.y;
  if (imagem) {
    const w = 78;
    const h = (imagem.height / imagem.width) * w;
    p.drawImage(imagem, { x: M + L - w, y: topo - h, width: w, height: h });
  }
  p.drawText('BOLETIM EXECUTIVO — VALE DO RIBEIRA', { x: M, y: topo - 17, size: 16, font: e.negrito, color: C.azul });
  p.drawText(limpar('Operação de controle de cheias — Sala de Situação São Paulo · SP Águas'), { x: M, y: topo - 31, size: 9, font: e.negrito, color: C.cinza });
  p.drawText(limpar(`REFERÊNCIA | ${referencia ? dataHoraH(referencia) : dataHoraH(c.ref.agora)} (horário de Brasília)`), { x: M, y: topo - 45, size: 9, font: e.negrito, color: C.texto });
  p.drawText(limpar(`Gerado automaticamente em ${dataHoraH(c.geradoEm)}, a partir das fontes oficiais, sem edição manual.`), { x: M, y: topo - 57, size: 7.5, font: e.normal, color: C.cinza });
  e.y = topo - 64;
  p.drawLine({ start: { x: M, y: e.y }, end: { x: M + L, y: e.y }, thickness: 2, color: C.azul });
  e.y -= 6;
}

function cartoes(e: Escritor, pontos: PontoRibeira[]) {
  const com = classificados(pontos);
  const itens: [string, string, RGB][] = [
    [String(pontos.filter((p) => !p.semDado).length), 'COM LEITURA', cor('#1481b7')],
    ...SITUACOES.map((s): [string, string, RGB] => [String(com.filter((p) => p.situacao === s).length), s, COR_SITUACAO[s]!]),
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
    const wr = e.negrito.widthOfTextAtSize(r, 6.8);
    e.pagina.drawText(r, { x: x + (w - wr) / 2, y: e.y - 33, size: 6.8, font: e.negrito, color: C.texto });
  }
  e.y -= h + 6;
}

export async function gerarPdf(c: ConteudoPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Boletim Executivo — Vale do Ribeira — ${dataHoraH(c.geradoEm)}`);
  doc.setAuthor('Sala de Situação São Paulo — SP Águas');
  doc.setSubject('Situação hidrológica dos pontos de monitoramento do Vale do Ribeira de Iguape, gerada automaticamente com dados do SIBH.');
  doc.setCreator('Sala de Situação São Paulo — boletim automático');
  doc.setProducer('SSAP (pdf-lib)');
  doc.setLanguage('pt-BR');
  doc.setCreationDate(new Date(c.geradoEm));
  const [normal, negrito, bytes] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold), bytesLogo()]);
  const imagem = bytes ? await doc.embedPng(bytes).catch(() => null) : null;
  const e = new Escritor(doc, normal, negrito);

  const n = c.niveis;
  const pontos = n.ok ? [...n.dados.pontos].sort((a, b) => a.ordemRio - b.ordemRio) : [];
  cabecalho(e, imagem, c, n.ok ? n.dados.atualizadoEm : null);

  // ---- situação geral
  e.secao('SITUAÇÃO GERAL DOS PONTOS DE MONITORAMENTO');
  if (!n.ok) e.aviso(`Níveis: ${n.mensagem}`);
  else {
    if (n.desatualizado && n.dados.atualizadoEm) e.aviso(`Atenção: a leitura mais recente recebida do SIBH é de ${dataHoraH(n.dados.atualizadoEm)}.`);
    cartoes(e, pontos);
    e.quadro([{ t: 'DIAGNÓSTICO EXECUTIVO  ', negrito: true, cor: cor('#e48a00') }, { t: diagnostico(pontos, c.ref.t07) }], C.laranja, C.laranjaFundo);

    // ---- tabela dos 8 pontos
    e.secao('PONTOS DE MONITORAMENTO (NÍVEL) — DE MONTANTE PARA JUSANTE');
    e.tabela(
      [
        { titulo: 'Ponto', largura: 24 },
        { titulo: 'Situação', largura: 16, centro: true },
        { titulo: `Nível 07h ${diaMes(c.ref.t07)}`, largura: 10, centro: true },
        { titulo: 'Nível atual', largura: 13, centro: true },
        { titulo: 'Variação desde 07h', largura: 10, centro: true },
        { titulo: 'Acima da cota de extravasamento', largura: 12, centro: true },
        { titulo: 'Tendência', largura: 9, centro: true },
      ],
      pontos.map((p): Celula[] => {
        const r = rotuloSituacao(p);
        const fundo = FUNDO_SITUACAO[r];
        const destaque = (t: string, extra: object = {}): Celula => ({ t, fundo, ...extra });
        return [
          destaque(`${p.nome} — ${p.prefix}\n${p.trecho}`, { negrito: !!fundo }),
          { t: r, fundo: COR_SITUACAO[r], cor: C.branco, negrito: true, centro: true },
          destaque(p.nivel07 === null ? '—' : `${fmt(p.nivel07)} m`),
          destaque(p.atual === null ? '—' : `${fmt(p.atual)} m (${horaH(p.atualEm!)})`),
          destaque(p.variacao === null ? '—' : `${fmtSinal(p.variacao)} m`, { cor: corVariacao(p.variacao), negrito: true }),
          destaque(p.situacao === 'EXTRAVASAMENTO' && !p.semDado && p.acima !== null ? `${fmtSinal(p.acima)} m` : '—', { cor: C.sobe, negrito: true }),
          destaque(tendenciaTexto(p.tendencia), { cor: corVariacao(p.variacao), negrito: true }),
        ];
      }),
    );
    e.nota(
      `Situação: nível atual comparado às cotas de referência cadastradas no SIBH (atenção, alerta, emergência e extravasamento). Variação: nível atual menos o das 07h de ${diaMes(c.ref.t07)}; tendência pelo sinal da variação (0,00 m = estável). Acima da cota: só para os pontos em extravasamento.`,
    );
  }

  // ---- chuva
  e.secao('CHUVA NA BACIA DO RIO RIBEIRA DE IGUAPE (UGRHI 11)');
  if (!c.chuva.ok) e.aviso(c.chuva.mensagem);
  else {
    const d = c.chuva.dados;
    e.tabela(
      [
        { titulo: 'Últimas 3 h (média)', largura: 1, centro: true },
        { titulo: 'Últimas 24 h (média)', largura: 1, centro: true },
        { titulo: 'Previsão 24 h (média)', largura: 1, centro: true },
      ],
      [[`${fmt(d.ultimas3h, 1)} mm`, `${fmt(d.ultimas24h, 1)} mm`, `${fmt(d.previsao24h, 1)} mm`].map((t) => ({ t, negrito: true }))],
    );
    e.nota(`Chuva observada: rede telemétrica do SIBH (${d.postos} postos na UGRHI 11). Previsão: Open-Meteo, média de ${d.pontosPrevisao} pontos de grade na UGRHI 11. Consulta de ${dataHoraH(c.chuva.obtidoEm.getTime())}.`);
  }

  // ---- Capivari
  e.secao('RESERVATÓRIO CAPIVARI — UHE GOVERNADOR PARIGOT DE SOUZA');
  const vol = textoVolumeCopel(c.copel);
  const est = c.estruturas;
  const cap = est.ok ? est.dados.capivari : null;
  e.tabela(
    [
      { titulo: 'Volume útil (%) — Copel, 07h', largura: 22, centro: true },
      { titulo: 'Cota atual (m)', largura: 16, centro: true },
      { titulo: 'Vazão defluente (m³/s)', largura: 18, centro: true },
      { titulo: 'Variação da cota desde 07h (m)', largura: 22, centro: true },
      { titulo: 'Variação da vazão desde 07h (m³/s)', largura: 22, centro: true },
    ],
    [
      [
        { t: vol.valor, negrito: true },
        cap?.cota === null || !cap ? '—' : `${fmt(cap.cota)} (${horaH(cap.cotaEm!)})`,
        fmt(cap?.vazao),
        { t: fmtSinal(cap?.variacaoCota ?? null), cor: corVariacao(cap?.variacaoCota ?? null), negrito: true },
        { t: fmtSinal(cap?.variacaoVazao ?? null), cor: corVariacao(cap?.variacaoVazao ?? null), negrito: true },
      ],
    ],
  );
  e.nota(`${vol.detalhe} Cota e vazão: SIBH — SP Águas / ANA (posto ${CAPIVARI.prefix}). Nível máximo de operação: ${fmt(CAPIVARI.nivelMaximoOperacao)} m; nível máximo maximorum: ${fmt(CAPIVARI.nivelMaximoMaximorum)} m.`);
  if (!est.ok) e.aviso(`Capivari e barramentos: ${est.mensagem}`);

  // ---- barramentos
  if (est.ok) {
    e.secao('BARRAMENTOS DE INTERESSE — UHEs/PCHs NAS CABECEIRAS DO RIO JUQUIÁ');
    e.tabela(
      [
        { titulo: 'Barramento', largura: 34 },
        { titulo: `Nível 07h ${diaMes(c.ref.t07)}`, largura: 13, centro: true },
        { titulo: 'Nível atual', largura: 15, centro: true },
        { titulo: 'Jusante (m³/s)', largura: 12, centro: true },
        { titulo: 'Variação', largura: 12, centro: true },
        { titulo: 'Tendência', largura: 14, centro: true },
      ],
      est.dados.barramentos.map((b): Celula[] => [
        `${b.nome} — ${b.prefix}`,
        b.anterior === null ? '—' : `${fmt(b.anterior)} m`,
        b.atual === null ? '—' : `${fmt(b.atual)} m (${horaH(b.atualEm!)})`,
        fmt(b.jusante),
        { t: b.variacao === null ? '—' : `${fmtSinal(b.variacao)} m`, cor: corVariacao(b.variacao), negrito: true },
        { t: tendenciaTexto(b.tendencia), cor: corVariacao(b.variacao), negrito: true },
      ]),
    );
    e.nota('Os barramentos não têm cotas de referência publicadas no SIBH: a tabela mostra só nível, vazão de jusante e tendência.');
  }

  // ---- síntese
  if (n.ok) {
    e.secao('SÍNTESE POR PONTO DE MONITORAMENTO');
    for (const p of pontos) {
      const r = rotuloSituacao(p);
      e.paragrafo([{ t: `${p.nome.replace(/\s*\(([^)]+)\)\s*$/, ', $1')}: `, negrito: true, cor: r === 'NORMAL' ? C.texto : COR_SITUACAO[r] }, { t: sintese(p) }], { tamanho: 8.5, depois: 4 });
    }
    e.secao('OBSERVAÇÕES AUTOMÁTICAS');
    for (const o of observacoes(pontos, c.ref.t07)) e.paragrafo(o, { tamanho: 8, recuo: 10, marcador: '•' });
  }

  // ---- fontes
  e.secao('FONTES DOS DADOS');
  const fontes = [
    `Níveis, cotas de referência, barramentos, Capivari (cota e vazão) e chuva observada: SIBH — SP Águas (apps.spaguas.sp.gov.br/sibh)${n.ok && n.dados.atualizadoEm ? `; leitura mais recente dos pontos: ${dataHoraH(n.dados.atualizadoEm)}` : ''}.`,
    `Previsão de chuva: Open-Meteo (open-meteo.com)${c.chuva.ok ? `; consulta de ${dataHoraH(c.chuva.obtidoEm.getTime())}` : ''}.`,
    'Volume útil do Reservatório Capivari: Copel — Monitoramento Hidrológico de Bacias (registro das 07h); sem integração automática autorizada até o momento.',
    `Versão on-line, atualizada automaticamente: ${c.endereco}`,
  ];
  for (const f of fontes) e.paragrafo(f, { tamanho: 8, recuo: 10, marcador: '•' });

  // ---- rodapé
  const paginas = doc.getPages();
  for (const [i, p] of paginas.entries()) {
    const t = limpar(`Boletim Executivo — Vale do Ribeira · gerado automaticamente em ${dataHoraH(c.geradoEm)} · página ${i + 1} de ${paginas.length}`);
    p.drawLine({ start: { x: M, y: M + 14 }, end: { x: M + L, y: M + 14 }, thickness: 0.5, color: C.borda });
    p.drawText(t, { x: M, y: M + 4, size: 7, font: normal, color: C.cinzaClaro });
  }
  return doc.save();
}
