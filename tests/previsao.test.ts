import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classeChuva, CLASSES_CHUVA } from '../src/lib/hidrologia/previsao';
import { normalizar, somarDias } from '../src/lib/integracoes/comum';

test('classe de chuva: limite inferior entra na classe', () => {
  const casos: [number | null, number][] = [
    [null, -1],
    [0, 0],
    [0.9, 0],
    [1, 1],
    [4.9, 1],
    [5, 2],
    [10, 3],
    [20, 4],
    [40, 5],
    [59.9, 5],
    [60, 6],
    [250, 6],
  ];
  for (const [mm, classe] of casos) assert.equal(classeChuva(mm), classe, `chuva ${mm}`);
});

test('escala de chuva tem 7 degraus em ordem crescente', () => {
  assert.equal(CLASSES_CHUVA.length, 7);
  const limites = CLASSES_CHUVA.map(([l]) => l);
  assert.deepEqual(limites, [...limites].sort((a, b) => a - b));
});

test('nomes de município comparam sem acento nem maiúscula', () => {
  assert.equal(normalizar('  São José dos Campos '), 'SAO JOSE DOS CAMPOS');
  assert.equal(normalizar('Mogi-Guaçu'), normalizar('MOGI-GUACU'));
});

test('soma de dias atravessa mês, ano e 29 de fevereiro', () => {
  assert.equal(somarDias('2026-01-01', -1), '2025-12-31');
  assert.equal(somarDias('2024-02-28', 1), '2024-02-29');
  assert.equal(somarDias('2026-02-28', 1), '2026-03-01');
});
