/**
 * Importa o acervo histórico de chuva do SIBH para o Painel de Climatologia.
 *   npm run clima:importar                     todos os postos com série no acervo
 *   npm run clima:importar -- --ugrhi=1,3      só os postos dessas UGRHIs (piloto)
 *   npm run clima:importar -- --atualizar      confere de novo os já importados (só relê o que mudou)
 *   npm run clima:importar -- --prefixos=B5-029,B5-050   relê esses postos inteiros (mesmo já importados)
 *   npm run clima:importar -- --prefixos=@lista.txt      idem, com os prefixos num arquivo (separados por vírgula)
 *   npm run clima:importar -- --reimportar-antes=2026-11-03T21:00   relê os importados antes dessa hora
 *                                                       (retomável: o que já foi relido não é lido de novo)
 *   opções: --pausa-ms=1000 (entre consultas)  --lote=1 (postos por consulta)
 *
 * Protege o SIBH: uma consulta por vez, com pausa entre elas, tempo limite e
 * poucas novas tentativas; para de vez depois de várias falhas seguidas.
 * Retoma de onde parou (posto já importado não é relido). Cada execução fica em
 * clima_execucoes. Os postos que operaram em 1991–2020 vêm primeiro.
 *
 * Leitura completa: com vários postos na mesma consulta a paginação do SIBH
 * repete e perde linhas, por isso o padrão é um posto por consulta, e cada
 * leitura só é gravada se os ids distintos das linhas somarem o total informado.
 */
import { readFileSync } from 'node:fs';
import limites from '../src/conteudo/ugrhi.json';
import { classificadorUgrhi, type Limites } from '../src/lib/climatologia/espacial';
import { diasDoMes, juntarRepetidos, resumir } from '../src/lib/climatologia/regras';
import { LINHAS_POR_PAGINA, paginaAcervo, postosComAcervo, type LinhaAcervo, type PostoAcervo } from '../src/lib/climatologia/sibh-acervo';
import { pool, query, transacao } from '../src/lib/db';
import { carregarEnv } from './_comum';

carregarEnv();

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1];
const PAUSA_MS = Number(arg('pausa-ms') ?? 1000);
const LOTE = Math.min(10, Math.max(1, Number(arg('lote') ?? 1)));
const UGRHIS = arg('ugrhi')?.split(',').map(Number).filter(Boolean) ?? null;
const ATUALIZAR = process.argv.includes('--atualizar');
const listaPrefixos = arg('prefixos');
const PREFIXOS =
  (listaPrefixos?.startsWith('@') ? readFileSync(listaPrefixos.slice(1), 'utf8') : listaPrefixos)
    ?.split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean) ?? null;
const REIMPORTAR_ANTES = arg('reimportar-antes') ? new Date(arg('reimportar-antes')!) : null;
if (REIMPORTAR_ANTES && Number.isNaN(REIMPORTAR_ANTES.getTime())) throw new Error('--reimportar-antes: data inválida (use AAAA-MM-DDTHH:mm)');
const LEITURAS_MAX = 3;
const TENTATIVAS = 3;
const FALHAS_SEGUIDAS_MAX = 5;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const agora = () => new Date().toLocaleTimeString('pt-BR');

let consultas = 0;
let erros = 0;
let falhasSeguidas = 0;
let interromper = false;

/** Uma página, com pausa antes, novas tentativas espaçadas (5 s, 15 s, 45 s) e contagem de falhas. */
async function pagina(ids: number[], inicio: number) {
  for (let t = 0; ; t++) {
    await esperar(PAUSA_MS);
    consultas++;
    try {
      const r = await paginaAcervo(ids, inicio);
      falhasSeguidas = 0;
      return r;
    } catch (e) {
      erros++;
      falhasSeguidas++;
      console.warn(`  [${agora()}] falha na consulta (início ${inicio}): ${(e as Error).message}`);
      if (falhasSeguidas >= FALHAS_SEGUIDAS_MAX) throw new Error(`${FALHAS_SEGUIDAS_MAX} falhas seguidas do SIBH: importação interrompida para não insistir`);
      if (t + 1 >= TENTATIVAS) throw e;
      await esperar(5_000 * 3 ** t);
    }
  }
}

/**
 * Lê o lote inteiro (todas as páginas). Devolve null para refazer se o total
 * mudar no meio (o acervo foi alterado) ou se a leitura não veio completa: os ids
 * distintos das linhas têm de somar o total (a paginação pode repetir linhas e
 * perder outras sem mudar a contagem).
 */
async function lerLote(ids: number[], prefixos: Set<string>): Promise<{ total: number; linhas: LinhaAcervo[] } | null> {
  const primeira = await pagina(ids, 0);
  const linhas = [...primeira.linhas];
  for (let inicio = LINHAS_POR_PAGINA; inicio < primeira.total; inicio += LINHAS_POR_PAGINA) {
    if (interromper) throw new Error('interrompida pelo usuário');
    const p = await pagina(ids, inicio);
    if (p.total !== primeira.total) return null;
    linhas.push(...p.linhas);
  }
  const completa = linhas.length === primeira.total && new Set(linhas.map((l) => l.id)).size === primeira.total && linhas.every((l) => prefixos.has(l.prefixo));
  return completa ? { total: primeira.total, linhas } : null;
}

type Mes = { dias: (number | null)[]; semDia1: boolean; conflito: boolean };

/** Grava os meses de um posto (mesmo mês repetido na fonte: um só, ou conflito se diferem). */
function mesesDoPosto(linhas: LinhaAcervo[]): Map<string, { ano: number; mes: number } & Mes> {
  const meses = new Map<string, { ano: number; mes: number } & Mes>();
  for (const l of linhas) {
    if (!Number.isInteger(l.ano) || l.mes < 1 || l.mes > 12) continue;
    const chave = `${l.ano}-${l.mes}`;
    const { dias, semDia1 } = diasDoMes(l.ano, l.mes, l.valores);
    const ja = meses.get(chave);
    if (!ja) meses.set(chave, { ano: l.ano, mes: l.mes, dias, semDia1, conflito: false });
    else if (!ja.conflito) meses.set(chave, { ...ja, conflito: ja.semDia1 !== semDia1 || juntarRepetidos(ja.dias, dias).conflito });
  }
  return meses;
}

async function gravarLote(postos: PostoAcervo[], linhas: LinhaAcervo[]): Promise<number> {
  const porPrefixo = new Map(postos.map((p) => [p.prefixo, [] as LinhaAcervo[]]));
  for (const l of linhas) porPrefixo.get(l.prefixo)?.push(l);
  let gravados = 0;
  await transacao(async (c) => {
    for (const p of postos) {
      const doPosto = porPrefixo.get(p.prefixo)!;
      const registros = [...mesesDoPosto(doPosto).values()].map((m) => {
        const r = resumir(m.dias);
        return { ano: m.ano, mes: m.mes, dias: m.dias, total: r.total, dias_faltando: r.diasFaltando, maior_falta: r.maiorFalta, falta_no_fim: r.faltaNoFim, sem_dia1: m.semDia1, conflito: m.conflito };
      });
      await c.query("DELETE FROM clima_chuva_mes WHERE posto_id = $1 AND fonte = 'acervo'", [p.id]);
      if (registros.length) {
        await c.query(
          `INSERT INTO clima_chuva_mes (posto_id, ano, mes, fonte, dias, total, dias_faltando, maior_falta, falta_no_fim, sem_dia1, conflito)
           SELECT $1, r.ano, r.mes, 'acervo',
                  ARRAY(SELECT d.v::real FROM jsonb_array_elements_text(r.dias) WITH ORDINALITY AS d(v, i) ORDER BY d.i),
                  r.total, r.dias_faltando, r.maior_falta, r.falta_no_fim, r.sem_dia1, r.conflito
             FROM jsonb_to_recordset($2::jsonb) AS r(ano smallint, mes smallint, dias jsonb, total numeric, dias_faltando smallint, maior_falta smallint,
                                                     falta_no_fim boolean, sem_dia1 boolean, conflito boolean)`,
          [p.id, JSON.stringify(registros)],
        );
      }
      await c.query('UPDATE clima_postos SET meses_acervo = $2, importado_em = now() WHERE id = $1', [p.id, doPosto.length]);
      gravados += registros.length;
    }
  });
  return gravados;
}

async function gravarPostos(postos: PostoAcervo[]): Promise<void> {
  const ugrhiDe = classificadorUgrhi(limites as unknown as Limites);
  // fora de todos os polígonos (postos do litoral, pela simplificação da costa): fica a UGRHI do cadastro
  const registros = postos.map((p) => ({ ...p, ugrhi: ugrhiDe(p.lon, p.lat) ?? p.ugrhiCadastro }));
  await query(
    `INSERT INTO clima_postos (id, prefixo, nome, municipio, dono, ugrhi, ugrhi_cadastro, lat, lon, inicio_operacao, fim_operacao, situacao)
     SELECT r.id, r.prefixo, r.nome, r.municipio, r.dono, r.ugrhi, r."ugrhiCadastro", r.lat, r.lon, r."inicioOperacao"::date, r."fimOperacao"::date, r.situacao
       FROM jsonb_to_recordset($1::jsonb) AS r(id int, prefixo text, nome text, municipio text, dono text, ugrhi smallint, "ugrhiCadastro" smallint,
                                               lat float8, lon float8, "inicioOperacao" text, "fimOperacao" text, situacao text)
     ON CONFLICT (id) DO UPDATE SET prefixo = EXCLUDED.prefixo, nome = EXCLUDED.nome, municipio = EXCLUDED.municipio, dono = EXCLUDED.dono,
       ugrhi = EXCLUDED.ugrhi, ugrhi_cadastro = EXCLUDED.ugrhi_cadastro, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
       inicio_operacao = EXCLUDED.inicio_operacao, fim_operacao = EXCLUDED.fim_operacao, situacao = EXCLUDED.situacao, atualizado_em = now()`,
    [JSON.stringify(registros)],
  );
}

/** Operou em 1991–2020 (metadado do SIBH): esses vêm primeiro. */
const noPeriodo = (p: PostoAcervo) => (p.inicioOperacao ?? '9999') < '2021-01-01' && (p.fimOperacao ?? '9999') >= '1991-01-01';

async function principal(): Promise<void> {
  const [exec] = await query<{ id: string }>("INSERT INTO clima_execucoes (tipo, detalhe) VALUES ('acervo', $1) RETURNING id", [
    JSON.stringify({ ugrhis: UGRHIS, prefixos: PREFIXOS?.length ?? null, reimportarAntes: REIMPORTAR_ANTES, pausaMs: PAUSA_MS, lote: LOTE, atualizar: ATUALIZAR }),
  ]);
  const inicio = Date.now();
  let gravados = 0;
  const incompletos: string[] = [];
  let situacao: 'concluida' | 'interrompida' | 'falhou' = 'concluida';
  let mensagem: string | null = null;
  process.on('SIGINT', () => {
    interromper = true;
    console.log('\nInterrompendo depois da consulta atual…');
  });
  try {
    console.log(`[${agora()}] Cadastro dos postos com acervo (SIBH v1 + v2)…`);
    const postos = await postosComAcervo();
    consultas += 2;
    await gravarPostos(postos);
    const ugrhiDe = classificadorUgrhi(limites as unknown as Limites);
    const ja = new Map((await query<{ id: number; importado_em: Date | null; meses_acervo: number | null }>('SELECT id, importado_em, meses_acervo FROM clima_postos')).map((r) => [r.id, r]));
    const pendente = (p: PostoAcervo) => {
      const em = ja.get(p.id)?.importado_em;
      if (REIMPORTAR_ANTES) return !em || em < REIMPORTAR_ANTES;
      return Boolean(PREFIXOS) || ATUALIZAR || !em;
    };
    const alvo = postos
      .filter((p) => !UGRHIS || UGRHIS.includes(ugrhiDe(p.lon, p.lat) ?? p.ugrhiCadastro ?? -1))
      .filter((p) => !PREFIXOS || PREFIXOS.includes(p.prefixo.toUpperCase()))
      .filter(pendente)
      .sort((a, b) => Number(noPeriodo(b)) - Number(noPeriodo(a)) || a.prefixo.localeCompare(b.prefixo));
    console.log(`[${agora()}] ${postos.length} postos no acervo; ${alvo.length} a importar${UGRHIS ? ` (UGRHI ${UGRHIS.join(', ')})` : ''}${PREFIXOS ? ` (${PREFIXOS.length} prefixos pedidos)` : ''}.`);

    const lotes = Array.from({ length: Math.ceil(alvo.length / LOTE) }, (_, i) => alvo.slice(i * LOTE, (i + 1) * LOTE));
    for (const [i, lote] of lotes.entries()) {
      if (interromper) throw new Error('interrompida pelo usuário');
      const ids = lote.map((p) => p.id);
      if (ATUALIZAR && !PREFIXOS && lote.every((p) => ja.get(p.id)?.importado_em)) {
        const total = (await pagina(ids, 0)).total; // uma consulta: o acervo destes postos mudou?
        if (total === lote.reduce((s, p) => s + (ja.get(p.id)?.meses_acervo ?? -1), 0)) continue;
      }
      const prefixos = new Set(lote.map((p) => p.prefixo));
      let lido: Awaited<ReturnType<typeof lerLote>> = null;
      for (let leitura = 1; leitura <= LEITURAS_MAX && !lido; leitura++) {
        if (leitura > 1) {
          console.warn(`  [${agora()}] leitura ${leitura - 1} do lote ${i + 1} incompleta (linhas repetidas ou perdidas, ou o acervo mudou): lendo de novo`);
          await esperar(10_000);
        }
        lido = await lerLote(ids, prefixos);
      }
      if (!lido) {
        // fica com os dados de antes (importado_em não muda): uma próxima execução tenta de novo
        erros++;
        incompletos.push(...prefixos);
        console.warn(`  [${agora()}] lote ${i + 1} (${[...prefixos].join(' ')}) não veio completo em ${LEITURAS_MAX} leituras: não gravado`);
        continue;
      }
      gravados += await gravarLote(lote, lido.linhas);
      const min = (Date.now() - inicio) / 60_000;
      const resta = (min / (i + 1)) * (lotes.length - i - 1);
      console.log(`[${agora()}] lote ${i + 1}/${lotes.length}: ${lote.map((p) => p.prefixo).join(' ')} — ${lido.total} meses | ${consultas} consultas, ${erros} falhas, ${min.toFixed(1)} min (faltam ~${resta.toFixed(0)} min)`);
    }
  } catch (e) {
    situacao = interromper ? 'interrompida' : falhasSeguidas >= FALHAS_SEGUIDAS_MAX ? 'interrompida' : 'falhou';
    mensagem = (e as Error).message;
    console.error(`[${agora()}] ${situacao.toUpperCase()}: ${mensagem}`);
  } finally {
    await query(
      `UPDATE clima_execucoes SET situacao = $2, terminado_em = now(), consultas = $3, registros = $4, erros = $5,
              detalhe = coalesce(detalhe, '{}'::jsonb) || $6::jsonb WHERE id = $1`,
      [exec!.id, situacao, consultas, gravados, erros, JSON.stringify({ mensagem, incompletos, minutos: Math.round((Date.now() - inicio) / 6_000) / 10 })],
    );
    await pool().end();
  }
  console.log(`[${agora()}] ${situacao}: ${gravados} meses gravados, ${consultas} consultas, ${erros} falhas.`);
  if (incompletos.length) console.log(`  postos não gravados por leitura incompleta (rode de novo): ${incompletos.join(',')}`);
  if (situacao !== 'concluida') process.exit(1);
}

void principal();
