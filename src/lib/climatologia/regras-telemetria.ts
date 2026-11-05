import { diasNoMes } from './regras';

/**
 * Regras da chuva observada pela rede telemétrica do SIBH (API v2) — puras, para
 * a coleta, o cálculo e os testes usarem as mesmas. Verificado em 04/11/2026:
 *
 *   GET /sibh/api/v2/measurements/now?station_type_id=2&hours=24&from_date=<fim>
 *     → um item por posto com registro na janela: soma (`value`), registros
 *       (`qtd`), primeiro e último horário (`min_date`, `max_date`), intervalo
 *       do cadastro (`measurement_gap`, min).
 *
 *  - uma consulta traz todos os pluviômetros (~1.350 hoje); dia recente responde
 *    em ~1 s, dia antigo em 25 a 85 s. Janela maior que 24 h dá erro 500;
 *  - a janela inclui as duas pontas: terminando às 03:00Z, o registro das 03:00Z
 *    do começo (que é do dia anterior) também entra. Por isso a janela termina 5
 *    min depois da meia-noite: pega (00:05, 24:05] de Brasília, que tem os mesmos
 *    registros que (00:00, 24:00] para intervalos de 10 min ou mais;
 *  - `measurements` com group_type=minute|hour|day, 10 postos por consulta, custa
 *    10 a 100 s por mês consultado nos três agrupamentos ("day" só encolhe a
 *    resposta) e passa de 120 s com 3 meses: não serve para série histórica.
 */

/** Minutos depois da meia-noite em que a janela de um dia termina (ver acima). */
export const DESLOCAMENTO_MIN = 5;
const MIN = 60_000;
const HORA = 60 * MIN;

/** Diferença de Brasília para UTC (min) no instante: -180 desde 2019 (sem horário de verão). */
function deslocamentoSP(ms: number): number {
  const nome = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', timeZoneName: 'longOffset' })
    .formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nome ?? '');
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : -180;
}

/** Meia-noite de Brasília do dia (AAAA-MM-DD), em ms UTC. */
export function meiaNoiteSP(dia: string): number {
  const utc = Date.parse(`${dia}T00:00:00Z`);
  return utc - deslocamentoSP(utc + 12 * HORA) * MIN;
}

export const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Janela da consulta de um dia de Brasília: `fim` e `horas` para a API; `ini` e `fimDia` são a meia-noite do dia e a do seguinte (ms). */
export function janelaDoDia(dia: string): { fim: string; horas: number; ini: number; fimDia: number } {
  const ini = meiaNoiteSP(dia);
  const fimDia = meiaNoiteSP(somarDias(dia, 1));
  return { fim: new Date(fimDia + DESLOCAMENTO_MIN * MIN).toISOString().slice(0, 19) + 'Z', horas: Math.round((fimDia - ini) / HORA), ini, fimDia };
}

/** `maximo`: o maior registro do dia (mm), para o teste de valor plausível. */
export type DiaPosto = { dia: string; chuva: number; registros: number; intervalo: number | null; primeiro: number | null; ultimo: number | null; maximo?: number | null };

/**
 * Valor plausível: acima disto é falha do posto (contador acumulado, pulso
 * espúrio), não chuva. O recorde do estado é ~683 mm em 24 h (Bertioga, fev.
 * 2023); um único registro de até 30 min acima de 60 mm, ou de 1 h acima de
 * 150 mm, não acontece na chuva real de SP. Na carga de 2026 os dias barrados
 * são de poucos postos, com valores como 197,8 mm em 10 min ou 6.500 mm no dia.
 */
export const MAX_CHUVA_DIA_MM = 700;
export const MAX_REGISTRO_MM = { ateMeiaHora: 60, hora: 150 };

export function plausivel(d: Pick<DiaPosto, 'chuva' | 'intervalo' | 'maximo'>): boolean {
  if (d.chuva < 0 || d.chuva > MAX_CHUVA_DIA_MM) return false;
  if (d.maximo === null || d.maximo === undefined) return true;
  return d.maximo <= ((d.intervalo ?? 60) <= 30 ? MAX_REGISTRO_MM.ateMeiaHora : MAX_REGISTRO_MM.hora);
}

/**
 * Registros de um dia completo do posto. Vale o intervalo do cadastro (1440 /
 * intervalo; 24 para intervalo de mais de 1 h), a não ser que o posto mande, na
 * maior parte dos dias, bem mais que isso (1,5×): aí o intervalo real é menor que
 * o cadastrado e vale o número mais comum de registros por dia. No CEMADEN o
 * intervalo é 1 h e chegam registros extras de 10 min quando chove — esses dias
 * passam de 24 e não mudam o esperado.
 */
export function registrosEsperados(intervalo: number | null, registrosDosDias: readonly number[]): number {
  const base = intervalo && intervalo >= 1 && intervalo <= 60 ? Math.floor(1440 / intervalo) : 24;
  const contagem = new Map<number, number>();
  for (const r of registrosDosDias) contagem.set(r, (contagem.get(r) ?? 0) + 1);
  let moda = 0;
  let vezes = 0;
  for (const [r, n] of contagem) if (n > vezes || (n === vezes && r > moda)) [moda, vezes] = [r, n];
  return moda >= 1.5 * base ? moda : base;
}

/** Critério padrão: fração máxima dos registros esperados no mês que pode faltar (~7 h num mês). */
export const FALTA_MAX_MES = 0.01;

/**
 * Qualidade do dia do posto. Falta de registro é chuva desconhecida (na
 * telemetria não há acúmulo na leitura seguinte), por isso:
 *  - "completo": todos os registros, o primeiro na primeira hora do dia e o
 *    último na última;
 *  - "quase": falta no máximo 1 h de registros (aceito pelo critério padrão, com
 *    o limite de FALTA_MAX_MES no mês);
 *  - "incompleto": não vale em nenhum critério — também o dia com valor
 *    impossível (ver `plausivel`).
 */
export function qualidadeDia(d: DiaPosto, esperado: number, ini: number, fimDia: number): 'completo' | 'quase' | 'incompleto' {
  if (!plausivel(d) || d.primeiro === null || d.ultimo === null) return 'incompleto';
  const comeco = d.primeiro - ini;
  const final = fimDia - d.ultimo;
  if (d.registros >= esperado && comeco <= HORA + MIN && final < HORA) return 'completo';
  const umaHora = Math.max(1, Math.round(esperado / 24));
  return d.registros >= esperado - umaHora && comeco <= 2 * HORA + MIN && final < 2 * HORA ? 'quase' : 'incompleto';
}

export type MesTelemetria = { dias: (number | null)[]; completos: number; faltando: number; valido: { padrao: boolean; estrito: boolean } };

/**
 * Mês de um posto telemétrico: chuva de cada dia aceito (incompleto ou sem
 * registro = null) e se o mês vale:
 *  - estrito: todos os dias completos;
 *  - padrão: todos os dias completos ou com no máximo 1 h faltando, e no mês
 *    faltando no máximo FALTA_MAX_MES dos registros esperados.
 * Mês em andamento: `ateDia` é o último dia encerrado; a conta vale do dia 1 até
 * ele, e os dias seguintes ficam null (ainda não aconteceram).
 */
export function mesTelemetria(ano: number, mes: number, dias: readonly DiaPosto[], ateDia = diasNoMes(ano, mes)): MesTelemetria {
  const n = diasNoMes(ano, mes);
  const ate = Math.max(1, Math.min(n, ateDia));
  const porDia = new Map(dias.map((d) => [Number(d.dia.slice(8, 10)), d]));
  const intervalo = dias.find((d) => d.intervalo !== null)?.intervalo ?? null;
  const esperado = registrosEsperados(intervalo, dias.map((d) => d.registros));
  let completos = 0;
  let faltando = 0;
  const vetor = Array.from({ length: n }, (_, i) => {
    if (i + 1 > ate) return null;
    const d = porDia.get(i + 1);
    if (!d) {
      faltando += esperado;
      return null;
    }
    const { ini, fimDia } = janelaDoDia(d.dia);
    const q = qualidadeDia(d, esperado, ini, fimDia);
    faltando += Math.max(0, esperado - d.registros);
    if (q === 'completo') completos++;
    return q === 'incompleto' ? null : Math.round(d.chuva * 10) / 10;
  });
  const aceitos = vetor.filter((v) => v !== null).length;
  return { dias: vetor, completos, faltando, valido: { estrito: completos === ate, padrao: aceitos === ate && faltando <= FALTA_MAX_MES * esperado * ate } };
}
