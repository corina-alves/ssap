import 'server-only';
import limites from '@/conteudo/ugrhi.json';

/**
 * Contornos das 22 UGRHIs (limite oficial, src/conteudo/ugrhi.json) como
 * caminhos SVG, para o mapa do painel ser desenhado no servidor: cada UGRHI é
 * um link, sem biblioteca de mapa no navegador. Pontos a menos de 1 px do
 * anterior são descartados (o arquivo original tem detalhe demais para a tela).
 */

export const LARGURA_MAPA = 640;

/** caixa: [x, y, largura, altura] da UGRHI na tela (para aproximar o mapa dela). */
export type FormaUgrhi = { codigo: number; nome: string; d: string; rotulo: [number, number]; caixa: [number, number, number, number] };
/** projetar: lon/lat → x/y na mesma tela dos contornos (para desenhar postos). */
export type Mapa = { largura: number; altura: number; formas: FormaUgrhi[]; projetar: (lon: number, lat: number) => [number, number] };

type Anel = number[][];
type Feicao = { properties: { codigo: number; nome: string }; geometry: { type: string; coordinates: unknown } };

let pronto: Mapa | undefined;

export function mapaUgrhis(): Mapa {
  if (pronto) return pronto;
  const feicoes = (limites as unknown as { features: Feicao[] }).features;
  const poligonos = (f: Feicao) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Anel[][];
  const pontos = feicoes.flatMap((f) => poligonos(f).flat(2));
  const [lonMin, lonMax] = [Math.min(...pontos.map((p) => p[0]!)), Math.max(...pontos.map((p) => p[0]!))];
  const [latMin, latMax] = [Math.min(...pontos.map((p) => p[1]!)), Math.max(...pontos.map((p) => p[1]!))];
  const k = Math.cos(((latMin + latMax) / 2) * (Math.PI / 180));
  const escala = LARGURA_MAPA / ((lonMax - lonMin) * k);
  const xy = (p: number[]): [number, number] => [(p[0]! - lonMin) * k * escala, (latMax - p[1]!) * escala];

  const formas = feicoes.map((f) => {
    let maior: [number, number][] = [];
    const partes: string[] = [];
    const todos: [number, number][] = [];
    for (const poligono of poligonos(f)) {
      for (const anel of poligono) {
        const tela: [number, number][] = [];
        for (const p of anel.map(xy)) {
          const u = tela[tela.length - 1];
          if (!u || Math.hypot(p[0] - u[0], p[1] - u[1]) >= 1) tela.push(p);
        }
        if (tela.length < 4) continue;
        if (tela.length > maior.length) maior = tela;
        todos.push(...tela);
        partes.push(`M${tela.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`);
      }
    }
    // rótulo no centro da caixa do maior anel
    const xs = maior.map((p) => p[0]);
    const ys = maior.map((p) => p[1]);
    const rotulo: [number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const [x0, x1] = [Math.min(...todos.map((p) => p[0])), Math.max(...todos.map((p) => p[0]))];
    const [y0, y1] = [Math.min(...todos.map((p) => p[1])), Math.max(...todos.map((p) => p[1]))];
    return { codigo: f.properties.codigo, nome: f.properties.nome, d: partes.join(''), rotulo, caixa: [x0, y0, x1 - x0, y1 - y0] as [number, number, number, number] };
  });
  pronto = { largura: LARGURA_MAPA, altura: Math.ceil((latMax - latMin) * escala), formas: formas.sort((a, b) => a.codigo - b.codigo), projetar: (lon, lat) => xy([lon, lat]) };
  return pronto;
}
