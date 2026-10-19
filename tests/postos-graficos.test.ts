import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analise, comparar, diasEntre, fmtDif, fmtVazao, type Ponto } from '../src/lib/hidrologia/postos-graficos';

/** Leituras de hora em hora: [dia, hora, nível, vazão]. */
const pts = (l: [string, string, number | null, number | null][]): Ponto[] =>
  l.map(([dia, hora, nivel, vazao], i) => ({ t: i, dia, hora, nivel, vazao }));

test('análise no formato do comunicado: dia de referência e última leitura × média do dia', () => {
  const p = pts([
    ['2026-10-17', '00:00', 7.75, 1180], ['2026-10-17', '12:00', 7.77, 1185], ['2026-10-17', '22:00', 7.84, 1225], ['2026-10-17', '23:00', 7.84, 1225],
    ['2026-10-18', '09:00', 7.77, 1190],
  ]);
  assert.equal(
    analise(p, '2026-10-17'),
    [
      'Em relação ao dia 17/10, o nível subiu ao longo do dia, passando de 7,75 m (00:00) para 7,84 m (23:00), com máxima de 7,84 m às 22:00.',
      'A vazão subiu ao longo do dia, passando de 1.180 m³/s (00:00) para 1.225 m³/s (23:00), com máxima de 1.225 m³/s às 22:00.',
      'Na última leitura (18/10 09:00), o nível está em 7,77 m (−3 cm), em queda em relação à média de 17/10, e a vazão em 1.190 m³/s (−14 m³/s), estável.',
    ].join('\n'),
  );
});

test('posto só com nível; estável dentro de 2 cm; queda com mínima', () => {
  const estavel = pts([['2026-10-17', '00:00', 397.87, null], ['2026-10-17', '23:00', 397.88, null], ['2026-10-18', '09:00', 397.87, null]]);
  assert.match(analise(estavel, '2026-10-17'), /o nível permaneceu estável ao longo do dia, em torno de 397,88 m\.\nNa última leitura \(18\/10 09:00\), o nível está em 397,87 m \(0 cm\), estável em relação à média de 17\/10\.$/);
  const queda = pts([['2026-10-17', '00:00', 2.5, null], ['2026-10-17', '06:00', 2.1, null], ['2026-10-17', '23:00', 2.2, null]]);
  assert.match(analise(queda, '2026-10-17'), /o nível desceu ao longo do dia, passando de 2,50 m \(00:00\) para 2,20 m \(23:00\), com mínima de 2,10 m às 06:00\./);
  assert.equal(comparar(queda, 'vazao', '2026-10-17'), null);
});

test('diferenças e formatos', () => {
  assert.equal(fmtDif('nivel', -0.012), '−1 cm');
  assert.equal(fmtDif('nivel', 0.034), '+3 cm');
  assert.equal(fmtDif('nivel', -0.005), '0 cm'); // arredonda para zero: sem sinal
  assert.equal(fmtDif('vazao', -0.4, 1190), '0 m³/s');
  assert.equal(fmtDif('vazao', -3.75, 1190), '−4 m³/s');
  assert.equal(fmtDif('vazao', 0.257, 3.2), '+0,26 m³/s');
  assert.equal(fmtVazao(1190.4), '1.190 m³/s');
  assert.deepEqual(diasEntre('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
});
