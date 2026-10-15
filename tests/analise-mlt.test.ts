import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acumular, agregar, anoDoMes, mltMensal, resumoPeriodo, rotuloAno, valoresPeriodo, type PorAno } from '../src/lib/hidrologia/analise-mlt';

// 2024 completo (mês m vale m), 2025 completo (10 × m), 2026 só jan–mar (100 × m)
const porAno: PorAno = { 2024: {}, 2025: {}, 2026: { 1: 100, 2: 200, 3: 300 } };
for (let m = 1; m <= 12; m++) {
  porAno[2024]![m] = m;
  porAno[2025]![m] = 10 * m;
}

test('MLT: média de cada mês só com os anos que têm o mês, e intervalo de anos', () => {
  const { mlt, de, ate } = mltMensal(porAno);
  assert.equal(mlt[0], (1 + 10 + 100) / 3);
  assert.equal(mlt[11], (12 + 120) / 2);
  assert.deepEqual([de, ate], [2024, 2026]);
  assert.equal(mltMensal(porAno, 2025, 2025).mlt[0], 10);
});

test('períodos que atravessam o ano usam o ano seguinte de janeiro em diante', () => {
  assert.equal(anoDoMes('chuvoso', 2025, 10), 2025);
  assert.equal(anoDoMes('chuvoso', 2025, 2), 2026);
  assert.equal(anoDoMes('seco', 2025, 4), 2025);
  assert.equal(rotuloAno('chuvoso', 2025), '2025/26');
  assert.equal(rotuloAno('ano', 2025), '2025');
  assert.deepEqual(valoresPeriodo(porAno, 'chuvoso', 2025), [100, 110, 120, 100, 200, 300]);
  assert.deepEqual(valoresPeriodo(porAno, 'hidrologico', 2025).slice(6), [null, null, null, null, null, null]);
});

test('período em andamento compara com a MLT só dos meses com dado', () => {
  const { mlt } = mltMensal(porAno, 2024, 2025); // MLT do mês m = 5,5 × m
  const r = resumoPeriodo(porAno, mlt, 'ano', 2026, 'soma');
  assert.equal(r.valor, 600);
  assert.equal(r.mlt, 5.5 * (1 + 2 + 3));
  assert.equal(r.meses, 3);
  assert.equal(r.completo, false);
  assert.equal(resumoPeriodo(porAno, mlt, 'ano', 2030, 'media').valor, null);
});

test('agregação e acumulado', () => {
  assert.equal(agregar([1, null, 3], 'media'), 2);
  assert.equal(agregar([1, null, 3], 'soma'), 4);
  assert.equal(agregar([null], 'soma'), null);
  assert.deepEqual(acumular([1, null, 2.5, null, null]), [1, 1, 3.5, null, null]);
});
