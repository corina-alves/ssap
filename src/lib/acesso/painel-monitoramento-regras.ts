import { SITUACOES, type Situacao } from '../boletins-sala/sumario-automatico-tp';

/**
 * Tipos e regras puras do Painel de Monitoramento (src/lib/acesso/painel-monitoramento.ts),
 * sem acesso às fontes: usados pela página e pelos testes.
 */

export { SITUACOES, type Situacao };

/** Classe visual: as 5 situações do SIBH, sem dado, e "info" (estado operacional, sem juízo de situação). */
export type Classe = 'normal' | 'atencao' | 'alerta' | 'emergencia' | 'extravasamento' | 'semdado' | 'info';

export const CLASSE_SITUACAO: Record<Situacao, Classe> = {
  NORMAL: 'normal',
  ATENÇÃO: 'atencao',
  ALERTA: 'alerta',
  EMERGÊNCIA: 'emergencia',
  EXTRAVASAMENTO: 'extravasamento',
};

export const TEXTO_SITUACAO: Record<Situacao, string> = {
  NORMAL: 'Normal',
  ATENÇÃO: 'Atenção',
  ALERTA: 'Alerta',
  EMERGÊNCIA: 'Emergência',
  EXTRAVASAMENTO: 'Extravasamento',
};

/** Ponto de monitoramento de nível (SIBH). `situacao` null: sem leitura ou sem cotas de referência. */
export type PontoPainel = {
  id: number;
  nome: string;
  rio: string;
  nivel: number | null;
  em: number | null;
  variacao24h: number | null;
  situacao: Situacao | null;
  /** "Sem dado" / "Sem cotas" quando não há situação. */
  rotulo: string;
  classe: Classe;
};

/** Estrutura (barragem, usina, reservatório): leitura e estado operacional, sem classificação de cheia. */
export type EstruturaPainel = {
  nome: string;
  tipo: string;
  local: string;
  nivel: number | null;
  vazao: number | null;
  variacao24h: number | null;
  /** Estado operacional, volume útil ou tendência — o que houver para a estrutura. */
  estado: string;
  classe: Classe;
  fonte: string;
};

export type IndicadorPainel = { rotulo: string; local: string; valor: string; unidade: string; detalhe: string | null; variacao: number | null; selo: string; classe: Classe };

export type OperacaoPainel = { nome: string; estado: string; classe: Classe };

export type ChuvaPainel = { regiao: string; ultimas3h: number | null; ultimas24h: number | null; previsao24h: number | null; postos: number };

export type SistemaPainel = {
  chave: 'tiete-pinheiros' | 'ribeira';
  nome: string;
  descricao: string;
  imagem: string;
  /** Sumário público (automático) e o da área (gerar o boletim). */
  publico: string;
  sumario: string;
  /** Pior situação entre os pontos com leitura e cotas (null: nenhum ponto com dado). */
  situacao: Situacao | null;
  contagem: Record<Situacao, number>;
  semSituacao: number;
  pontos: PontoPainel[];
  estruturas: EstruturaPainel[];
  indicadores: IndicadorPainel[];
  operacao: OperacaoPainel[];
  chuva: ChuvaPainel | null;
  /** Leitura mais recente usada (ms). */
  atualizadoEm: number | null;
  /** Fontes que não responderam. */
  avisos: string[];
};

export type PainelMonitoramento = { sistemas: SistemaPainel[]; atualizadoEm: number | null; geradoEm: number };

// ---------------------------------------------------------------- regras do resumo

const GRAVIDADE = new Map(SITUACOES.map((s, i) => [s, i]));

/** Pior situação da lista (null se nenhuma). */
export function piorSituacao(situacoes: (Situacao | null)[]): Situacao | null {
  let pior: Situacao | null = null;
  for (const s of situacoes) if (s !== null && (pior === null || GRAVIDADE.get(s)! > GRAVIDADE.get(pior)!)) pior = s;
  return pior;
}

/** Quantos pontos em cada situação. */
export function contarSituacoes(situacoes: (Situacao | null)[]): Record<Situacao, number> {
  const c = Object.fromEntries(SITUACOES.map((s) => [s, 0])) as Record<Situacao, number>;
  for (const s of situacoes) if (s !== null) c[s]++;
  return c;
}

/** Pontos do mais grave para o menos grave; no empate, quem está mais acima da cota de extravasamento, depois o nome. */
export function ordenarPontos<T extends { situacao: Situacao | null; nome: string }>(pontos: T[], acima: (p: T) => number | null = () => null): T[] {
  const g = (p: T) => (p.situacao === null ? -1 : GRAVIDADE.get(p.situacao)!);
  return [...pontos].sort((a, b) => g(b) - g(a) || (acima(b) ?? -Infinity) - (acima(a) ?? -Infinity) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
