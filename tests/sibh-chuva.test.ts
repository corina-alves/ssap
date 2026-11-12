import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mediaChuva, type ChuvaPosto } from '../src/lib/integracoes/sibh-medicoes';

// A chuva do estado (uma consulta ao SIBH) serve a média de cada recorte: RMSP por município, UGRHI 11 por posto.
const postos: Record<string, ChuvaPosto> = {
  '10': { mm: 12, ibge: '3550308' }, // São Paulo
  '11': { mm: 4, ibge: '3550308' },
  '12': { mm: -0.2, ibge: '3548708' }, // leitura negativa conta como 0
  '20': { mm: 30, ibge: '3542602' }, // Registro (UGRHI 11)
  '21': { mm: 8, ibge: null },
};

test('média de chuva de um recorte dos pluviômetros do estado', () => {
  const rmsp = new Set(['3550308', '3548708']);
  assert.deepEqual(mediaChuva(postos, (_, c) => c.ibge !== null && rmsp.has(c.ibge)), { media: 16 / 3, postos: 3 });
  assert.deepEqual(mediaChuva(postos, (id) => id === '20' || id === '21'), { media: 19, postos: 2 });
  assert.equal(mediaChuva(postos, () => false), null);
  assert.equal(mediaChuva(null, () => true), null);
});
