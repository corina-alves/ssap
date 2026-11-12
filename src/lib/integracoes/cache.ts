import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Cache das integrações: memória (rápido) + arquivo (sobrevive a reinícios).
 *
 *  - prazo por chave (TTL); dado de dia passado pode ficar "para sempre";
 *  - pedidos iguais e simultâneos viram UMA chamada à fonte (coalescência);
 *  - se a fonte falhar, devolve o último valor guardado (até `validadeMaxSeg`),
 *    marcado como desatualizado;
 *  - depois de uma falha, a fonte não é chamada de novo por `esperaFalhaSeg`
 *    (não martela um serviço fora do ar);
 *  - gravação atômica (arquivo temporário + rename).
 *
 * Fica fora do banco de propósito: é dado descartável e regenerável.
 */

export type Entrada<T> = { valor: T; obtidoEm: number };
export type Lembrado<T> = { valor: T; obtidoEm: Date; desatualizado: boolean };

export type OpcoesCache = {
  /** Até quanto tempo um valor vencido ainda serve como reserva se a fonte falhar. */
  validadeMaxSeg?: number;
  /** Depois de uma falha, quanto tempo esperar antes de chamar a fonte de novo. */
  esperaFalhaSeg?: number;
};

export const TTL = {
  /** 10 min — chuva em tempo real */
  tempoReal: 10 * 60,
  /** 30 min — resumo diário (dia corrente) */
  operacional: 30 * 60,
  /** 1 h — ANA, SSD, previsão */
  hora: 60 * 60,
  /** 30 dias — municípios, geocodificação */
  cadastro: 30 * 24 * 60 * 60,
  /** ~10 anos — dado de dia passado não muda */
  historico: 10 * 365 * 24 * 60 * 60,
} as const;

// Memória: até 300 itens e 96 MB (tamanho do JSON). Item acima de 8 MB fica só no
// arquivo (ex.: respostas inteiras do SIBH de ~3,6 MB eram guardadas às dezenas).
// Sai primeiro o usado há mais tempo.
const MAX_MEMORIA = 300;
const MAX_MEMORIA_BYTES = 96 * 1024 * 1024;
const MAX_ITEM_BYTES = 8 * 1024 * 1024;
type NaMemoria = Entrada<unknown> & { tam?: number };
type Estado = {
  memoria: Map<string, NaMemoria>;
  emAndamento: Map<string, Promise<Lembrado<unknown> | null>>;
  falhaRecente: Map<string, { em: number; erro: string }>;
  bytes?: number;
};
// No globalThis: o módulo pode ser carregado mais de uma vez no mesmo processo
// (recarga em desenvolvimento, pacotes separados por rota). Sem isso, cada cópia
// esqueceria as falhas recentes e chamaria de novo, a cada página, as fontes que
// ainda não publicaram o dia.
const estado: Estado = ((globalThis as { __ssapCacheIntegracoes?: Estado }).__ssapCacheIntegracoes ??= {
  memoria: new Map(),
  emAndamento: new Map(),
  falhaRecente: new Map(),
  bytes: 0,
});
const { memoria, emAndamento, falhaRecente } = estado;

let diretorio: string | null = null;

/** Pasta do cache (CACHE_DIR ou ./.cache/integracoes). Configurável nos testes. */
export function definirDiretorio(dir: string | null) {
  diretorio = dir;
  memoria.clear();
  estado.bytes = 0;
  falhaRecente.clear();
}

function pasta(): string {
  return resolve(/*turbopackIgnore: true*/ diretorio ?? process.env.CACHE_DIR ?? join(process.cwd(), '.cache', 'integracoes'));
}

function arquivo(servico: string, chave: string): string {
  if (!/^[a-z0-9_-]+$/.test(servico)) throw new Error(`Serviço de cache inválido: ${servico}`);
  return join(pasta(), servico, `${createHash('sha1').update(chave).digest('hex')}.json`);
}

/** Entrada guardada no arquivo e o tamanho dele (bytes, ~ caracteres do JSON). */
async function lerArquivo<T>(servico: string, chave: string): Promise<(Entrada<T> & { tam: number }) | null> {
  try {
    const texto = await readFile(/*turbopackIgnore: true*/ arquivo(servico, chave), 'utf8');
    const e = JSON.parse(texto) as Entrada<T> & { chave?: string };
    return typeof e.obtidoEm === 'number' && 'valor' in e ? { valor: e.valor, obtidoEm: e.obtidoEm, tam: texto.length } : null;
  } catch {
    return null;
  }
}

async function gravarArquivo(servico: string, chave: string, texto: string): Promise<void> {
  const destino = arquivo(servico, chave);
  const tmp = `${destino}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await mkdir(/*turbopackIgnore: true*/ join(pasta(), servico), { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ tmp, texto);
    await rename(/*turbopackIgnore: true*/ tmp, destino);
  } catch {
    await rm(/*turbopackIgnore: true*/ tmp, { force: true }).catch(() => {});
    // Falha de disco não derruba a página: o valor segue em memória.
  }
}

function esquecer(id: string) {
  const v = memoria.get(id);
  if (!v) return;
  memoria.delete(id);
  estado.bytes = Math.max(0, (estado.bytes ?? 0) - (v.tam ?? 0));
}

function guardarMemoria(id: string, e: Entrada<unknown>, tam: number) {
  esquecer(id);
  if (tam > MAX_ITEM_BYTES) return; // grande demais: fica só no arquivo
  memoria.set(id, { valor: e.valor, obtidoEm: e.obtidoEm, tam });
  estado.bytes = (estado.bytes ?? 0) + tam;
  while (memoria.size > MAX_MEMORIA || estado.bytes > MAX_MEMORIA_BYTES) {
    const maisAntigo = memoria.keys().next().value;
    if (maisAntigo === undefined) break;
    esquecer(maisAntigo);
  }
}

/**
 * Valor da chave: do cache se ainda vale; senão chama `buscar`.
 * `buscar` devolve null (ou lança) quando a fonte falha.
 * Retorna null só se a fonte falhou e não há reserva utilizável.
 */
export async function lembrar<T>(
  servico: string,
  chave: string,
  ttlSeg: number,
  buscar: () => Promise<T | null>,
  opcoes: OpcoesCache = {},
): Promise<Lembrado<T> | null> {
  if (!/^[a-z0-9_-]+$/.test(servico)) throw new Error(`Serviço de cache inválido: ${servico}`);
  const id = `${servico}:${chave}`;
  const agora = Date.now();
  const valido = (e: Entrada<unknown> | null | undefined) => !!e && agora - e.obtidoEm < ttlSeg * 1000;

  const m = memoria.get(id);
  if (valido(m)) {
    // usado agora: vai para o fim da fila (o primeiro da fila é o que sai quando a memória enche)
    memoria.delete(id);
    memoria.set(id, m!);
    return { valor: m!.valor as T, obtidoEm: new Date(m!.obtidoEm), desatualizado: false };
  }

  const andamento = emAndamento.get(id);
  if (andamento) return andamento as Promise<Lembrado<T> | null>;

  const tarefa = (async (): Promise<Lembrado<T> | null> => {
    const salvo = m ?? (await lerArquivo<T>(servico, chave));
    if (valido(salvo)) {
      guardarMemoria(id, salvo!, salvo!.tam ?? 0);
      return { valor: salvo!.valor as T, obtidoEm: new Date(salvo!.obtidoEm), desatualizado: false };
    }

    const falha = falhaRecente.get(id);
    const esperando = falha && agora - falha.em < (opcoes.esperaFalhaSeg ?? 60) * 1000;
    let novo: T | null = null;
    if (!esperando) {
      try {
        novo = await buscar();
      } catch (e) {
        falhaRecente.set(id, { em: Date.now(), erro: (e as Error).message });
      }
      if (novo === null && !falhaRecente.has(id)) falhaRecente.set(id, { em: Date.now(), erro: 'sem dados' });
    }
    if (novo !== null) {
      falhaRecente.delete(id);
      const e = { valor: novo, obtidoEm: Date.now() };
      const texto = JSON.stringify({ chave, ...e });
      guardarMemoria(id, e, texto.length);
      await gravarArquivo(servico, chave, texto);
      return { valor: novo, obtidoEm: new Date(e.obtidoEm), desatualizado: false };
    }

    // Fonte falhou: usa o último valor guardado, se não for velho demais.
    const max = (opcoes.validadeMaxSeg ?? 7 * 24 * 60 * 60) * 1000;
    if (salvo && agora - salvo.obtidoEm < max) {
      return { valor: salvo.valor as T, obtidoEm: new Date(salvo.obtidoEm), desatualizado: true };
    }
    return null;
  })();

  emAndamento.set(id, tarefa);
  try {
    return await tarefa;
  } finally {
    emAndamento.delete(id);
  }
}

/** Último erro registrado para a chave (para mensagens de diagnóstico). */
export function ultimoErro(servico: string, chave: string): string | null {
  return falhaRecente.get(`${servico}:${chave}`)?.erro ?? null;
}
