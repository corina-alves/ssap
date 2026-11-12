import { VD } from '@/conteudo/diagramas-unifilares';

/**
 * Valores do SSD nos diagramas unifilares (esquema em unifilar.tsx e desenho
 * sobre o mapa em desenho-mapa.tsx): formato, unidade e cores.
 */

/** `hora`: só na chuva por radar (chave radar:<id>), a hora da última leitura somada ("13:50"). */
export type ValoresSsd = Record<string, { valor: number; data: string; hora?: string } | null>;
export type Modo = 'vazao' | 'volume' | 'nivel' | 'chuva';

// casas decimais e unidade por variável do SSD
const FORMATO: Record<number, [number, string]> = {
  [VD.chuva]: [1, 'mm'],
  [VD.vazao]: [2, 'm³/s'],
  [VD.descarregada]: [2, 'm³/s'],
  [VD.natural]: [2, 'm³/s'],
  [VD.captada]: [2, 'm³/s'],
  [VD.volumePct]: [1, '%'],
  [VD.volumeHm3]: [2, 'hm³'],
  [VD.nivel]: [2, 'm'],
  [VD.defluente]: [2, 'm³/s'],
};

const numero = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** "4,61 m³/s" (ou "—"); com "*" quando o dado é de dia anterior ao pedido. */
export function texto(valores: ValoresSsd, space: number, v: number, data: string, comUnidade = true): string {
  const x = valores[`${space}:${v}`];
  if (!x) return '—';
  const [casas, un] = FORMATO[v] ?? [2, ''];
  const unidade = comUnidade && un ? (un === '%' ? un : ` ${un}`) : '';
  return `${numero(x.valor, casas)}${unidade}${x.data < data ? '*' : ''}`;
}

/** Chave da chuva do dia por radar (SIBH) de um posto, junto dos valores do SSD. */
export const chaveRadar = (id: number) => `radar:${id}`;

/** "13,7 mm" (ou "—"): chuva do dia por radar. */
export function textoRadar(valores: ValoresSsd, id: number): string {
  const x = valores[chaveRadar(id)];
  return x ? `${numero(x.valor, 1)} mm` : '—';
}

/** Valor numérico de um campo do SSD (null sem dado). */
export const valorDe = (valores: ValoresSsd, c?: { space: number; v: number }) => (c ? (valores[`${c.space}:${c.v}`]?.valor ?? null) : null);

/** Duração de um ciclo da água correndo: mais rápida quanto maior a vazão (escala log; sem dado, velocidade média). */
export const duracaoFluxo = (passo: number, q: number | null) => passo / (q === null ? 20 : 12 + 22 * Math.log10(1 + q));

/** Cor da faixa do volume útil (%). */
export const COR_FAIXA = (p: number | null) => (p === null ? '#6c7f91' : p >= 60 ? '#1aa564' : p >= 40 ? '#f4b400' : p >= 30 ? '#e08600' : p >= 20 ? '#dc3545' : '#9b3fb0');
