/**
 * Carrega a chuva observada pela rede telemétrica do SIBH (API v2) para o Painel
 * de Climatologia: um total por posto e dia de Brasília, de todos os
 * pluviômetros, com uma consulta por dia (src/lib/climatologia/regras-telemetria.ts).
 *   npm run clima:telemetria                            dias que faltam nos últimos 14 (os que o SIBH responde em ~1 s)
 *   npm run clima:telemetria -- --desde=2025-01-01      dias que faltam desde a data (até ontem)
 *   npm run clima:telemetria -- --desde=2023-01-01 --ate=2023-12-31
 *   npm run clima:telemetria -- --recalcular            só refaz os totais dos meses já carregados (sem consultar)
 *   opções: --refazer (consulta de novo dias já carregados)  --pausa-ms=5000
 *           --parar-as=06:00 (para sozinho nesse horário de Brasília; a próxima execução continua)
 *
 * Protege o SIBH: uma consulta por vez, do dia mais recente para o mais antigo;
 * a pausa entre consultas é de --pausa-ms ou metade do tempo da última resposta,
 * o que for maior (dia antigo leva de 25 a 85 s no servidor); poucas novas
 * tentativas, espaçadas; para de vez depois de 5 falhas seguidas. Retoma de onde
 * parou (dia já carregado não é consultado de novo). Depois da carga dos dias,
 * os meses afetados são refeitos (totais dos postos e média das UGRHIs).
 * A coleta dos dias seguintes é feita pelo servidor (instrumentation.ts).
 */
import { cadastroV2, consultarDia, gravarCadastro, gravarDia, hojeSP, recalcularMeses, TIMEOUT_DIA_MS } from '../src/lib/climatologia/telemetria';
import { somarDias } from '../src/lib/climatologia/regras-telemetria';
import { pool, query } from '../src/lib/db';
import { carregarEnv } from './_comum';

carregarEnv();

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1];
const dataValida = (v: string | undefined, nome: string) => {
  if (v === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Error(`--${nome}: data inválida (use AAAA-MM-DD)`);
  return v;
};
const ONTEM = somarDias(hojeSP(), -1);
const DESDE = dataValida(arg('desde'), 'desde') ?? somarDias(ONTEM, -13);
const ATE = dataValida(arg('ate'), 'ate') ?? ONTEM;
const PAUSA_MS = Number(arg('pausa-ms') ?? 5000);
const REFAZER = process.argv.includes('--refazer');
const SO_RECALCULAR = process.argv.includes('--recalcular');
/** Instante (ms) do próximo --parar-as=HH:MM em Brasília, ou null. */
const PARAR_EM = (() => {
  const v = arg('parar-as');
  if (v === undefined) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('--parar-as: horário inválido (use HH:MM)');
  const hoje = hojeSP();
  const alvo = Date.parse(`${hoje}T${v}:00-03:00`);
  return alvo > Date.now() ? alvo : Date.parse(`${somarDias(hoje, 1)}T${v}:00-03:00`);
})();
const TENTATIVAS = 3;
const FALHAS_SEGUIDAS_MAX = 5;
/** De quantos em quantos dias carregados os meses são refeitos (para o painel já mostrar o que chegou). */
const RECALCULAR_A_CADA = 31;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const agora = () => new Date().toLocaleTimeString('pt-BR');
const mesDe = (dia: string) => ({ ano: Number(dia.slice(0, 4)), mes: Number(dia.slice(5, 7)) });

let consultas = 0;
let erros = 0;
let falhasSeguidas = 0;
let interromper = false;

async function principal(): Promise<void> {
  if (DESDE > ATE) throw new Error(`--desde (${DESDE}) depois de --ate (${ATE})`);
  if (ATE > ONTEM) throw new Error(`--ate (${ATE}): só dias já encerrados (até ${ONTEM})`);
  const [exec] = await query<{ id: string }>("INSERT INTO clima_execucoes (tipo, detalhe) VALUES ('telemetria', $1) RETURNING id", [
    JSON.stringify({ desde: DESDE, ate: ATE, refazer: REFAZER, recalcular: SO_RECALCULAR, pausaMs: PAUSA_MS }),
  ]);
  const inicio = Date.now();
  let gravados = 0;
  let situacao: 'concluida' | 'interrompida' | 'falhou' = 'concluida';
  let mensagem: string | null = null;
  const pendentesRecalculo: { ano: number; mes: number }[] = [];
  process.on('SIGINT', () => {
    interromper = true;
    console.log('\nInterrompendo depois da consulta atual…');
  });
  try {
    if (SO_RECALCULAR) {
      const meses = await query<{ ano: number; mes: number }>(
        'SELECT DISTINCT extract(year FROM dia)::int AS ano, extract(month FROM dia)::int AS mes FROM clima_telemetria_dia WHERE dia BETWEEN $1 AND $2',
        [DESDE, ATE],
      );
      const r = await recalcularMeses(meses);
      console.log(`[${agora()}] ${meses.length} meses refeitos: ${r.postosMes} meses de postos.`);
      return;
    }

    console.log(`[${agora()}] Cadastro dos pluviômetros (SIBH v2)…`);
    await gravarCadastro(await cadastroV2());
    consultas++;

    const ja = new Set(
      (await query<{ dia: string }>('SELECT dia::text AS dia FROM clima_telemetria_coleta WHERE dia BETWEEN $1 AND $2', [DESDE, ATE])).map((r) => r.dia),
    );
    const dias: string[] = [];
    for (let d = ATE; d >= DESDE; d = somarDias(d, -1)) if (REFAZER || !ja.has(d)) dias.push(d);
    console.log(`[${agora()}] ${DESDE} a ${ATE}: ${dias.length} dias a consultar (${ja.size} já carregados).`);

    let pausa = PAUSA_MS;
    for (const [i, dia] of dias.entries()) {
      if (interromper) throw new Error('interrompida pelo usuário');
      if (PARAR_EM !== null && Date.now() >= PARAR_EM) {
        interromper = true;
        throw new Error(`horário limite (--parar-as=${arg('parar-as')}): a próxima execução continua de onde parou`);
      }
      let registros: Awaited<ReturnType<typeof consultarDia>> | null = null;
      let segundos = 0;
      for (let t = 0; !registros; t++) {
        await esperar(pausa);
        consultas++;
        const t0 = performance.now();
        try {
          registros = await consultarDia(dia, TIMEOUT_DIA_MS);
          segundos = (performance.now() - t0) / 1000;
          falhasSeguidas = 0;
        } catch (e) {
          erros++;
          falhasSeguidas++;
          console.warn(`  [${agora()}] falha na consulta de ${dia}: ${(e as Error).message}`);
          if (falhasSeguidas >= FALHAS_SEGUIDAS_MAX) throw new Error(`${FALHAS_SEGUIDAS_MAX} falhas seguidas do SIBH: carga interrompida para não insistir`);
          if (t + 1 >= TENTATIVAS) break;
          await esperar(15_000 * 3 ** t);
        }
      }
      if (!registros) continue; // fica sem o dia: uma próxima execução tenta de novo
      await gravarDia(dia, registros, segundos);
      gravados += registros.length;
      pausa = Math.max(PAUSA_MS, (segundos * 1000) / 2);
      const m = mesDe(dia);
      if (!pendentesRecalculo.some((x) => x.ano === m.ano && x.mes === m.mes)) pendentesRecalculo.push(m);
      const min = (Date.now() - inicio) / 60_000;
      console.log(`[${agora()}] ${i + 1}/${dias.length} ${dia}: ${registros.length} postos em ${segundos.toFixed(1)} s | ${consultas} consultas, ${erros} falhas, ${min.toFixed(1)} min (faltam ~${((min / (i + 1)) * (dias.length - i - 1)).toFixed(0)} min)`);
      if ((i + 1) % RECALCULAR_A_CADA === 0) {
        await recalcularMeses(pendentesRecalculo.splice(0));
        console.log(`  [${agora()}] meses carregados até aqui refeitos`);
      }
    }
  } catch (e) {
    situacao = interromper || falhasSeguidas >= FALHAS_SEGUIDAS_MAX ? 'interrompida' : 'falhou';
    mensagem = (e as Error).message;
    console.error(`[${agora()}] ${situacao.toUpperCase()}: ${mensagem}`);
  } finally {
    if (pendentesRecalculo.length) {
      const r = await recalcularMeses(pendentesRecalculo);
      console.log(`[${agora()}] ${pendentesRecalculo.length} meses refeitos: ${r.postosMes} meses de postos.`);
    }
    await query(
      `UPDATE clima_execucoes SET situacao = $2, terminado_em = now(), consultas = $3, registros = $4, erros = $5,
              detalhe = coalesce(detalhe, '{}'::jsonb) || $6::jsonb WHERE id = $1`,
      [exec!.id, situacao, consultas, gravados, erros, JSON.stringify({ mensagem, minutos: Math.round((Date.now() - inicio) / 6_000) / 10 })],
    );
    await pool().end();
  }
  console.log(`[${agora()}] ${situacao}: ${gravados} registros de posto × dia, ${consultas} consultas, ${erros} falhas.`);
  if (situacao !== 'concluida') process.exit(1);
}

void principal();
