import { inflateRawSync } from 'node:zlib';
import { ErroValidacao } from './graficos-tabela';

/**
 * Leitor mínimo de planilhas .xlsx (Excel 2007+), sem dependência externa: abre
 * o zip, lê as abas e devolve as células como texto, linha a linha. Números
 * saem como o Excel grava (ponto decimal; datas como número de série — veja
 * dataExcel em hidrologia/projecoes). Fórmulas valem o último valor calculado.
 */

export type Aba = { nome: string; linhas: string[][] };

const MAX_DESCOMPACTADO = 30 * 1024 * 1024; // por arquivo interno: barra "zip bomb"
const MAX_LINHAS = 20_000;

type Entrada = { metodo: number; tamanho: number; inicio: number; comprimido: number };

function entradasZip(buf: Buffer): Map<string, Entrada> {
  // Fim do diretório central: assinatura 0x06054b50 nos últimos ~64 KB.
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new ErroValidacao(['O arquivo não é uma planilha .xlsx válida.']);
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const r = new Map<string, Entrada>();
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ErroValidacao(['Planilha .xlsx corrompida.']);
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const tamanho = buf.readUInt32LE(p + 24);
    const lenNome = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + lenNome);
    p += 46 + lenNome + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    r.set(nome.replace(/^\//, ''), { metodo, tamanho, inicio, comprimido });
  }
  return r;
}

function lerEntrada(buf: Buffer, e: Entrada | undefined): string | null {
  if (!e) return null;
  if (e.tamanho > MAX_DESCOMPACTADO) throw new ErroValidacao(['Planilha grande demais.']);
  const dados = buf.subarray(e.inicio, e.inicio + e.comprimido);
  if (e.metodo === 0) return dados.toString('utf8');
  if (e.metodo === 8) return inflateRawSync(dados, { maxOutputLength: MAX_DESCOMPACTADO }).toString('utf8');
  throw new ErroValidacao(['Planilha .xlsx com compressão não suportada.']);
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTIDADES[e] ?? m),
  );

/** Texto de um <si> ou <is>: junta os <t> (inclusive de trechos formatados), sem a guia fonética. */
const textoRico = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desescapar(m[1]!)).join('');

/** "A" → 0, "J" → 9, "AA" → 26 */
function indiceColuna(ref: string): number {
  let n = 0;
  for (const c of ref) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function lerAba(xml: string, textos: string[]): string[][] {
  const linhas: string[][] = [];
  for (const [, num, corpo] of xml.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const i = Number(num) - 1;
    if (i >= MAX_LINHAS) throw new ErroValidacao([`Planilha grande demais (mais de ${MAX_LINHAS} linhas).`]);
    const linha: string[] = [];
    for (const [, col, attrs, dentro = ''] of (corpo ?? '').matchAll(/<c\b[^>]*?\br="([A-Z]{1,3})\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tipo = /\bt="(\w+)"/.exec(attrs!)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(dentro)?.[1];
      let valor = '';
      if (tipo === 's') valor = textos[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = textoRico(dentro);
      else if (v !== undefined) valor = desescapar(v);
      linha[indiceColuna(col!)] = valor.trim();
    }
    linhas[i] = Array.from(linha, (c) => c ?? '');
  }
  return Array.from(linhas, (l) => l ?? []);
}

/** Abas da planilha, na ordem do arquivo. */
export function lerXlsx(bytes: Uint8Array): Aba[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const zip = entradasZip(buf);
  const pasta = lerEntrada(buf, zip.get('xl/workbook.xml'));
  if (!pasta) throw new ErroValidacao(['O arquivo não é uma planilha .xlsx válida.']);
  const rels = lerEntrada(buf, zip.get('xl/_rels/workbook.xml.rels')) ?? '';
  const alvo = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(([r]) => [/\bId="([^"]+)"/.exec(r)?.[1], /\bTarget="([^"]+)"/.exec(r)?.[1]]));
  const ss = lerEntrada(buf, zip.get('xl/sharedStrings.xml'));
  const textos = ss ? [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoRico(m[1]!)) : [];

  const abas: Aba[] = [];
  for (const [tag] of pasta.matchAll(/<sheet\b[^>]*>/g)) {
    const nome = desescapar(/\bname="([^"]*)"/.exec(tag)?.[1] ?? '');
    const destino = alvo.get(/\br:id="([^"]+)"/.exec(tag)?.[1]);
    if (!destino) continue;
    const caminho = destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`;
    const xml = lerEntrada(buf, zip.get(caminho));
    if (xml) abas.push({ nome, linhas: lerAba(xml, textos) });
  }
  if (!abas.length) throw new ErroValidacao(['A planilha não tem nenhuma aba com dados.']);
  return abas;
}
