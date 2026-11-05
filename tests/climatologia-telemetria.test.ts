import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FALTA_MAX_MES, janelaDoDia, meiaNoiteSP, mesTelemetria, plausivel, qualidadeDia, registrosEsperados, somarDias, type DiaPosto } from '../src/lib/climatologia/regras-telemetria';

const MIN = 60_000;

/** Dia "perfeito" de um posto com `intervalo` minutos: primeiro registro no primeiro intervalo, último à meia-noite seguinte. */
function dia(d: string, intervalo: number, chuva = 1, registros = 1440 / intervalo, atrasoIni = 0, adiantaFim = 0): DiaPosto {
  const { ini, fimDia } = janelaDoDia(d);
  return { dia: d, chuva, registros, intervalo, primeiro: ini + (intervalo + atrasoIni) * MIN, ultimo: fimDia - adiantaFim * MIN };
}

test('telemetria: o dia de Brasília vai das 03:00Z às 03:00Z, e a janela termina 5 min depois', () => {
  assert.equal(new Date(meiaNoiteSP('2026-11-03')).toISOString(), '2026-11-03T03:00:00.000Z');
  const j = janelaDoDia('2026-11-02');
  assert.equal(j.fim, '2026-11-03T03:05:00Z'); // o registro das 03:00Z do começo (dia anterior) fica de fora
  assert.equal(j.horas, 24);
  assert.equal(somarDias('2026-02-28', 1), '2026-03-01');
  assert.equal(somarDias('2024-02-28', 1), '2024-02-29');
  assert.equal(somarDias('2026-01-01', -1), '2025-12-31');
});

test('telemetria: registros esperados pelo intervalo do cadastro, ou pelo que o posto manda quando é bem mais', () => {
  assert.equal(registrosEsperados(10, [144, 144, 143]), 144);
  assert.equal(registrosEsperados(20, [72, 71, 72]), 72);
  // CEMADEN: 1 h, com registros extras quando chove — o esperado continua 24
  assert.equal(registrosEsperados(60, [24, 24, 29, 31, 24, 26]), 24);
  // cadastro diz 60 min, mas o posto manda de 15 em 15
  assert.equal(registrosEsperados(60, [96, 96, 95, 96]), 96);
  // intervalo sem sentido (1440): vale o que o posto manda
  assert.equal(registrosEsperados(1440, [144, 144]), 144);
  assert.equal(registrosEsperados(null, []), 24);
});

test('telemetria: dia completo, quase completo (até 1 h faltando) e incompleto', () => {
  const { ini, fimDia } = janelaDoDia('2026-10-10');
  const q = (d: DiaPosto, esperado: number) => qualidadeDia(d, esperado, ini, fimDia);
  assert.equal(q(dia('2026-10-10', 10), 144), 'completo');
  assert.equal(q(dia('2026-10-10', 10, 1, 140), 144), 'quase'); // faltam 4 registros de 10 min
  assert.equal(q(dia('2026-10-10', 10, 1, 137), 144), 'incompleto'); // faltam 7 (mais de 1 h)
  assert.equal(q(dia('2026-10-10', 60, 1, 24, 0, 60), 24), 'quase'); // termina 1 h antes
  assert.equal(q(dia('2026-10-10', 60, 1, 24, 0, 180), 24), 'incompleto'); // termina 3 h antes
  assert.equal(q(dia('2026-10-10', 60, 1, 24, 180), 24), 'incompleto'); // começa 3 h depois
  assert.equal(q({ ...dia('2026-10-10', 10), primeiro: null }, 144), 'incompleto');
  assert.equal(q(dia('2026-10-10', 10, -1), 144), 'incompleto');
});

test('telemetria: mês vale no estrito só com todos os dias completos; no padrão, com até 1% de registros faltando', () => {
  const dias = (n: number, f: (d: string, i: number) => DiaPosto) => Array.from({ length: n }, (_, i) => f(`2026-04-${String(i + 1).padStart(2, '0')}`, i));
  const cheio = mesTelemetria(2026, 4, dias(30, (d) => dia(d, 10, 2)));
  assert.deepEqual(cheio.valido, { padrao: true, estrito: true });
  assert.equal(cheio.dias.length, 30);
  assert.equal(cheio.dias.reduce<number>((s, v) => s + v!, 0), 60);

  // um dia sem nenhum registro: chuva desconhecida — nenhum critério aceita, o dia fica null (nunca zero)
  const semUm = mesTelemetria(2026, 4, dias(29, (d) => dia(d, 10, 2)));
  assert.deepEqual(semUm.valido, { padrao: false, estrito: false });
  assert.equal(semUm.dias[29], null);

  // dois dias com 4 registros faltando: 8 de 4.320 (< 1%) — padrão aceita, estrito não
  const poucos = mesTelemetria(2026, 4, dias(30, (d, i) => dia(d, 10, 2, i < 2 ? 140 : 144)));
  assert.deepEqual(poucos.valido, { padrao: true, estrito: false });
  assert.equal(poucos.faltando, 8);

  // mês em andamento até o dia 3: vale com os 3 primeiros dias; os seguintes ficam null (não aconteceram)
  const parcial = mesTelemetria(2026, 4, dias(3, (d) => dia(d, 10, 2)), 3);
  assert.deepEqual(parcial.valido, { padrao: true, estrito: true });
  assert.deepEqual([parcial.dias.length, parcial.dias.slice(0, 3), parcial.dias[3]], [30, [2, 2, 2], null]);
  assert.deepEqual(mesTelemetria(2026, 4, dias(2, (d) => dia(d, 10, 2)), 3).valido, { padrao: false, estrito: false }); // falta o dia 3

  // muitos dias com 1 h faltando: passa de 1% no mês — padrão também recusa
  const muitos = mesTelemetria(2026, 4, dias(30, (d, i) => dia(d, 10, 2, i < 10 ? 139 : 144)));
  assert.ok(muitos.faltando > FALTA_MAX_MES * 144 * 30);
  assert.deepEqual(muitos.valido, { padrao: false, estrito: false });
});

test('telemetria: valor impossível (falha do posto) descarta o dia', () => {
  assert.equal(plausivel({ chuva: 120, intervalo: 10, maximo: 35 }), true);
  assert.equal(plausivel({ chuva: 680, intervalo: 60, maximo: 140 }), true); // perto do recorde do estado, ainda aceito
  assert.equal(plausivel({ chuva: 537.4, intervalo: 10, maximo: 197.8 }), false); // 197,8 mm em 10 min
  assert.equal(plausivel({ chuva: 6513.4, intervalo: 60, maximo: 296.2 }), false); // contador acumulado
  assert.equal(plausivel({ chuva: 206, intervalo: 60, maximo: 206 }), false);
  assert.equal(plausivel({ chuva: -324.2, intervalo: 10, maximo: 45 }), false);
  assert.equal(plausivel({ chuva: 20, intervalo: 10, maximo: null }), true);
  const d = { ...dia('2026-10-01', 10, 537.4), maximo: 197.8 };
  const { ini, fimDia } = janelaDoDia(d.dia);
  assert.equal(qualidadeDia(d, 144, ini, fimDia), 'incompleto');
  // um dia impossível invalida o mês do posto nos dois critérios
  const dias = Array.from({ length: 31 }, (_, i) => ({ ...dia(`2026-10-${String(i + 1).padStart(2, '0')}`, 10, 2), maximo: 1 }));
  dias[0] = d;
  assert.deepEqual(mesTelemetria(2026, 10, dias).valido, { padrao: false, estrito: false });
});
