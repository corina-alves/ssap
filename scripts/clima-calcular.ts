/**
 * Calcula, a partir da chuva já importada (clima_chuva_mes), a série regional de
 * cada UGRHI e as médias climatológicas. Não consulta o SIBH; pode rodar quantas
 * vezes quiser (refaz tudo).
 *   npm run clima:calcular
 *
 *  1. validade de cada mês de cada posto (critérios padrão e estrito);
 *  2. série regional por mês e ano: Thiessen (grade) e média aritmética dos
 *     postos da UGRHI, com cobertura, postos usados e pesos;
 *  3. médias climatológicas do período padrão (1991–2020) em clima_normais;
 *  4. médias climatológicas de cada posto e de cada município, nos períodos de
 *     referência do painel (o de 2010 até hoje, com o ano corrente) e em todo o
 *     acervo (tabela no formato do boletim), em clima_normais_local.
 * Só mexe no que vem do acervo; a telemetria é refeita por scripts/clima-telemetria.ts.
 */
import limites from '../src/conteudo/ugrhi.json';
import { COBERTURA_MIN, montarGrade, thiessen, type Limites } from '../src/lib/climatologia/espacial';
import { climatologia, CRITERIOS, METODOS, PERIODO_PADRAO, validade, type Criterio, type Metodo, type PontoSerie } from '../src/lib/climatologia/regras';
import { periodosReferencia, periodoTodoAcervo } from '../src/lib/climatologia/selecao';
import { pool, query, transacao } from '../src/lib/db';
import { carregarEnv } from './_comum';

carregarEnv();

const r1 = (v: number) => Math.round(v * 10) / 10;

type Linha = { posto_id: number; ano: number; mes: number; dias: (number | null)[]; conflito: boolean; falta_no_fim: boolean; sem_dia1: boolean };
type LinhaSerie = { ugrhi: number; ano: number; mes: number; criterio: Criterio; metodo: Metodo; chuva: number | null; dias: number[] | null; postos: number; cobertura: number; valido: boolean; pesos: Record<number, number> | null };

async function principal(): Promise<void> {
  const [exec] = await query<{ id: string }>("INSERT INTO clima_execucoes (tipo) VALUES ('calculo') RETURNING id");
  const inicio = Date.now();
  let registros = 0;
  try {
    const postos = await query<{ id: number; lat: number; lon: number; ugrhi: number | null }>(
      "SELECT id, lat, lon, ugrhi FROM clima_postos p WHERE EXISTS (SELECT 1 FROM clima_chuva_mes c WHERE c.posto_id = p.id AND c.fonte = 'acervo') ORDER BY id",
    );
    if (!postos.length) throw new Error('nenhum posto com chuva importada: rode antes npm run clima:importar');
    const indice = new Map(postos.map((p, i) => [p.id, i]));
    console.log(`${postos.length} postos com acervo; montando a grade das UGRHIs…`);
    const grade = montarGrade(limites as unknown as Limites, postos);
    const [faixa] = await query<{ ini: number; fim: number }>("SELECT min(ano) AS ini, max(ano) AS fim FROM clima_chuva_mes WHERE fonte = 'acervo'");

    for (let ano = faixa!.ini; ano <= faixa!.fim; ano++) {
      const linhas = await query<Linha>(
        "SELECT posto_id, ano, mes, dias, conflito, falta_no_fim, sem_dia1 FROM clima_chuva_mes WHERE fonte = 'acervo' AND (ano = $1 OR (ano = $1 - 1 AND mes = 12))",
        [ano],
      );
      const chave = (posto: number, a: number, m: number) => `${posto}:${a}:${m}`;
      const porChave = new Map(linhas.map((l) => [chave(l.posto_id, l.ano, l.mes), l]));
      const doAno = linhas.filter((l) => l.ano === ano);
      if (!doAno.length) continue;

      // 1. validade de cada mês de cada posto
      const validos = new Map<string, Record<Criterio, boolean>>();
      for (const l of doAno) {
        const anterior = l.mes === 1 ? porChave.get(chave(l.posto_id, ano - 1, 12)) : porChave.get(chave(l.posto_id, ano, l.mes - 1));
        validos.set(chave(l.posto_id, ano, l.mes), validade({ dias: l.dias, conflito: l.conflito, semDia1: l.sem_dia1 }, anterior?.falta_no_fim ?? false));
      }

      // 2. série regional
      const serie: LinhaSerie[] = [];
      for (let mes = 1; mes <= 12; mes++) {
        const doMes = doAno.filter((l) => l.mes === mes);
        const nDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
        for (const criterio of CRITERIOS) {
          const valor = new Float64Array(postos.length).fill(NaN);
          const dias = new Map<number, (number | null)[]>();
          for (const l of doMes) {
            if (!validos.get(chave(l.posto_id, ano, mes))![criterio]) continue;
            const p = indice.get(l.posto_id)!;
            valor[p] = l.dias.reduce<number>((s, d) => s + (d ?? 0), 0);
            dias.set(p, l.dias);
          }
          const mediaDias = (pesos: [number, number][]) =>
            Array.from({ length: nDias }, (_, d) => r1(pesos.reduce((s, [p, w]) => s + w * (dias.get(p)![d] ?? 0), 0)));
          for (const u of grade.values()) {
            const t = thiessen(u, valor);
            const valido = t.chuva !== null && t.cobertura >= COBERTURA_MIN;
            serie.push({
              ugrhi: u.codigo, ano, mes, criterio, metodo: 'thiessen',
              chuva: t.chuva === null ? null : r1(t.chuva),
              dias: t.chuva === null ? null : mediaDias([...t.pesos]),
              postos: t.pesos.size,
              cobertura: r1(t.cobertura),
              valido,
              pesos: Object.fromEntries([...t.pesos].map(([p, w]) => [postos[p]!.id, Math.round(w * 10_000) / 10_000])),
            });
            const dentro = [...dias.keys()].filter((p) => postos[p]!.ugrhi === u.codigo);
            const w = dentro.length ? 1 / dentro.length : 0;
            serie.push({
              ugrhi: u.codigo, ano, mes, criterio, metodo: 'aritmetica',
              chuva: dentro.length ? r1(dentro.reduce((s, p) => s + valor[p]!, 0) / dentro.length) : null,
              dias: dentro.length ? mediaDias(dentro.map((p) => [p, w])) : null,
              postos: dentro.length,
              cobertura: r1(t.cobertura),
              valido: dentro.length > 0 && t.cobertura >= COBERTURA_MIN,
              pesos: null,
            });
          }
        }
      }

      await transacao(async (c) => {
        await c.query(
          `UPDATE clima_chuva_mes m SET valido_padrao = r.padrao, valido_estrito = r.estrito
             FROM jsonb_to_recordset($1::jsonb) AS r(posto_id int, mes smallint, padrao boolean, estrito boolean)
            WHERE m.posto_id = r.posto_id AND m.ano = $2 AND m.mes = r.mes AND m.fonte = 'acervo'`,
          [JSON.stringify(doAno.map((l) => ({ posto_id: l.posto_id, mes: l.mes, ...validos.get(chave(l.posto_id, ano, l.mes)) }))), ano],
        );
        await c.query("DELETE FROM clima_serie_ugrhi WHERE ano = $1 AND fonte = 'acervo'", [ano]);
        await c.query(
          `INSERT INTO clima_serie_ugrhi (ugrhi, ano, mes, criterio, metodo, chuva, dias, postos, cobertura, valido, pesos)
           SELECT r.ugrhi, r.ano, r.mes, r.criterio, r.metodo, r.chuva,
                  CASE WHEN r.dias IS NULL THEN NULL ELSE ARRAY(SELECT d.v::real FROM jsonb_array_elements_text(r.dias) WITH ORDINALITY AS d(v, i) ORDER BY d.i) END,
                  r.postos, r.cobertura, r.valido, r.pesos
             FROM jsonb_to_recordset($1::jsonb) AS r(ugrhi smallint, ano smallint, mes smallint, criterio text, metodo text, chuva numeric,
                                                     dias jsonb, postos smallint, cobertura numeric, valido boolean, pesos jsonb)`,
          [JSON.stringify(serie)],
        );
      });
      registros += serie.length;
      if (ano % 10 === 0 || ano === faixa!.fim) console.log(`  ${ano}: ${doAno.length} meses de postos, ${serie.filter((s) => s.valido && s.criterio === 'padrao' && s.metodo === 'thiessen').length}/264 meses de UGRHI válidos (padrão, Thiessen)`);
    }

    // 3. médias climatológicas do período padrão
    const serie = await query<{ ugrhi: number; ano: number; mes: number; criterio: Criterio; metodo: Metodo; chuva: string | null; valido: boolean }>(
      "SELECT ugrhi, ano, mes, criterio, metodo, chuva, valido FROM clima_serie_ugrhi WHERE fonte = 'acervo'",
    );
    const normais: Record<string, unknown>[] = [];
    for (const u of grade.keys()) {
      for (const criterio of CRITERIOS) {
        for (const metodo of METODOS) {
          const pontos: PontoSerie[] = serie
            .filter((s) => s.ugrhi === u && s.criterio === criterio && s.metodo === metodo)
            .map((s) => ({ ano: s.ano, mes: s.mes, chuva: s.chuva === null ? null : Number(s.chuva), valido: s.valido }));
          climatologia(pontos, PERIODO_PADRAO).forEach((e, mes) =>
            normais.push({ ugrhi: u, mes, criterio, metodo, tipo: e.tipo, media: e.media, anos_validos: e.anosValidos, anos: e.anos, mediana: e.mediana, desvio: e.desvio, minimo: e.minimo, ano_minimo: e.anoMinimo, maximo: e.maximo, ano_maximo: e.anoMaximo }),
          );
        }
      }
    }
    await transacao(async (c) => {
      await c.query('DELETE FROM clima_normais WHERE periodo_ini = $1 AND periodo_fim = $2', PERIODO_PADRAO);
      await c.query(
        `INSERT INTO clima_normais (ugrhi, periodo_ini, periodo_fim, mes, criterio, metodo, tipo, media, anos_validos, anos, mediana, desvio, minimo, ano_minimo, maximo, ano_maximo)
         SELECT r.ugrhi, $2, $3, r.mes, r.criterio, r.metodo, r.tipo, r.media, r.anos_validos, ARRAY(SELECT jsonb_array_elements_text(r.anos)::smallint),
                r.mediana, r.desvio, r.minimo, r.ano_minimo, r.maximo, r.ano_maximo
           FROM jsonb_to_recordset($1::jsonb) AS r(ugrhi smallint, mes smallint, criterio text, metodo text, tipo text, media numeric, anos_validos smallint,
                                                   anos jsonb, mediana numeric, desvio numeric, minimo numeric, ano_minimo smallint, maximo numeric, ano_maximo smallint)`,
        [JSON.stringify(normais), ...PERIODO_PADRAO],
      );
    });
    registros += normais.length;

    // 4. médias de cada posto e de cada município (série do município: média dos postos dele com o mês válido)
    registros += await normaisLocais();
    await query("UPDATE clima_execucoes SET situacao = 'concluida', terminado_em = now(), registros = $2, detalhe = $3 WHERE id = $1", [
      exec!.id, registros, JSON.stringify({ anos: faixa, postos: postos.length, segundos: Math.round((Date.now() - inicio) / 1000) }),
    ]);
    console.log(`Concluído: ${registros} registros em ${Math.round((Date.now() - inicio) / 1000)} s.`);
  } catch (e) {
    await query("UPDATE clima_execucoes SET situacao = 'falhou', terminado_em = now(), detalhe = $2 WHERE id = $1", [exec!.id, JSON.stringify({ mensagem: (e as Error).message })]);
    console.error(`FALHOU: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await pool().end();
  }
}

async function normaisLocais(): Promise<number> {
  const periodos = [...Object.values(periodosReferencia()), periodoTodoAcervo()];
  const [ini, fim] = [Math.min(...periodos.map((p) => p[0])), Math.max(...periodos.map((p) => p[1]))];
  const linhas = await query<{ posto_id: number; cod_ibge: number | null; ano: number; mes: number; total: string | null; valido_padrao: boolean; valido_estrito: boolean }>(
    `SELECT c.posto_id, p.cod_ibge, c.ano, c.mes, c.total, c.valido_padrao, c.valido_estrito
       FROM clima_chuva_mes c JOIN clima_postos p ON p.id = c.posto_id
      WHERE c.fonte = 'acervo' AND c.ano BETWEEN $1 AND $2 AND c.total IS NOT NULL AND (c.valido_padrao OR c.valido_estrito)`,
    [ini, fim],
  );
  const saida: Record<string, unknown>[] = [];
  const guardar = (escala: 'posto' | 'municipio', codigo: number, criterio: Criterio, pontos: PontoSerie[], postosNoPeriodo: (p: [number, number]) => number | null) => {
    for (const periodo of periodos) {
      climatologia(pontos, periodo).forEach((e, mes) => {
        if (e.tipo === 'insuficiente') return;
        saida.push({ escala, codigo, periodo_ini: periodo[0], periodo_fim: periodo[1], mes, criterio, tipo: e.tipo, media: e.media, anos_validos: e.anosValidos, anos: e.anos, postos: postosNoPeriodo(periodo) });
      });
    }
  };
  for (const criterio of CRITERIOS) {
    const validas = linhas.filter((l) => (criterio === 'estrito' ? l.valido_estrito : l.valido_padrao));
    const porPosto = new Map<number, PontoSerie[]>();
    // município → "ano:mes" → totais dos postos (e quais postos)
    const porMunicipio = new Map<number, Map<string, { soma: number; n: number; postos: number[] }>>();
    for (const l of validas) {
      const ponto = { ano: l.ano, mes: l.mes, chuva: Number(l.total), valido: true };
      const doPosto = porPosto.get(l.posto_id) ?? [];
      doPosto.push(ponto);
      porPosto.set(l.posto_id, doPosto);
      if (l.cod_ibge === null) continue;
      const doMun = porMunicipio.get(l.cod_ibge) ?? new Map();
      const chave = `${l.ano}:${l.mes}`;
      const acc = doMun.get(chave) ?? { soma: 0, n: 0, postos: [] };
      acc.soma += ponto.chuva;
      acc.n++;
      acc.postos.push(l.posto_id);
      doMun.set(chave, acc);
      porMunicipio.set(l.cod_ibge, doMun);
    }
    for (const [posto, pontos] of porPosto) guardar('posto', posto, criterio, pontos, () => null);
    for (const [mun, meses] of porMunicipio) {
      const pontos = [...meses].map(([chave, a]) => {
        const [ano, mes] = chave.split(':').map(Number) as [number, number];
        return { ano, mes, chuva: a.soma / a.n, valido: true, postos: a.postos };
      });
      guardar('municipio', mun, criterio, pontos, (p) => new Set(pontos.filter((x) => x.ano >= p[0] && x.ano <= p[1]).flatMap((x) => x.postos)).size);
    }
  }
  await transacao(async (c) => {
    await c.query('DELETE FROM clima_normais_local');
    for (let i = 0; i < saida.length; i += 20_000) {
      await c.query(
        `INSERT INTO clima_normais_local (escala, codigo, periodo_ini, periodo_fim, mes, criterio, tipo, media, anos_validos, anos, postos)
         SELECT r.escala, r.codigo, r.periodo_ini, r.periodo_fim, r.mes, r.criterio, r.tipo, r.media, r.anos_validos,
                ARRAY(SELECT jsonb_array_elements_text(r.anos)::smallint), r.postos
           FROM jsonb_to_recordset($1::jsonb) AS r(escala text, codigo int, periodo_ini smallint, periodo_fim smallint, mes smallint, criterio text,
                                                   tipo text, media numeric, anos_validos smallint, anos jsonb, postos smallint)`,
        [JSON.stringify(saida.slice(i, i + 20_000))],
      );
    }
  });
  console.log(`  médias de postos e municípios: ${saida.length} registros`);
  return saida.length;
}

void principal();
