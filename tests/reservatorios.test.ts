import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estagio, ESTAGIOS, LIMITES_ESTAGIO } from '../src/lib/hidrologia/reservatorios';

test('estágios do Protocolo de Escassez seguem as faixas de volume', () => {
  const casos: [number, string][] = [
    [100, 'E0'],
    [60, 'E0'],
    [59.99, 'E1'],
    [40, 'E1'],
    [39.99, 'E2'],
    [30, 'E2'],
    [29.99, 'E3'],
    [20, 'E3'],
    [19.99, 'E4'],
    [0, 'E4'],
    [-5, 'E4'], // reserva técnica (2014–2015)
  ];
  for (const [volume, codigo] of casos) {
    assert.equal(estagio(volume).codigo, codigo, `volume ${volume}`);
  }
});

test('há um estágio a mais que limites, e todo estágio tem código e nome', () => {
  assert.equal(ESTAGIOS.length, LIMITES_ESTAGIO.length + 1);
  for (const e of ESTAGIOS) {
    assert.match(e.codigo, /^E[0-4]$/);
    assert.ok(e.nome.length > 0);
  }
});
