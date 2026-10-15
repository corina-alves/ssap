import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aplicarMedias, POSTOS, type Medias } from '../src/lib/boletins-sala/pcj';
import { instante, leitura, mediaVazao, somar, type Medicao } from '../src/lib/integracoes/sibh-medicoes';

const h = (d: string) => Date.parse(d);

test('data do SIBH vira instante em UTC (por hora e por minuto)', () => {
  assert.equal(instante('2026/09/26 10'), h('2026-09-26T10:00:00Z'));
  assert.equal(instante('2026/09/26 10:20'), h('2026-09-26T10:20:00Z'));
});

test('chuva: soma por posto, com início dentro e fim fora do intervalo', () => {
  const med: Medicao[] = [
    ['1', '2026/09/26 09', 5, null], // antes
    ['1', '2026/09/26 10', 1.5, null],
    ['1', '2026/09/26 11', 2, null],
    ['1', '2026/09/26 12', 9, null], // no fim: fica de fora
    ['2', '2026/09/26 10', null, null], // sem valor
  ];
  assert.deepEqual(somar(med, h('2026-09-26T10:00:00Z'), h('2026-09-26T12:00:00Z')), { '1': 3.5 });
  assert.deepEqual(somar(null, 0, 1), {});
});

test('vazão: média só das leituras com vazão', () => {
  const med: Medicao[] = [
    ['7', '2026/09/26 10', 100, 4],
    ['7', '2026/09/26 11', 110, 6],
    ['7', '2026/09/26 12', 120, null],
  ];
  assert.deepEqual(mediaVazao(med, h('2026-09-26T00:00:00Z'), h('2026-09-27T00:00:00Z')), { '7': 5 });
});

test('leitura das 7h: a mais próxima em até 10 minutos, nível de cm para m', () => {
  const alvo = h('2026-09-26T10:00:00Z');
  const med: Medicao[] = [
    ['7', '2026/09/26 09:50', 103, 6.8],
    ['7', '2026/09/26 10:10', 108, 7.1],
    ['7', '2026/09/26 09:58', 105, null],
    ['8', '2026/09/26 10:11', 200, 1], // 11 min: longe demais
  ];
  assert.deepEqual(leitura(med, alvo), { '7': { nivel: 1.05, vazao: null } });
});

test('médias do mês: grava, ignora posto desconhecido e valor inválido, apaga com vazio', () => {
  const mapa = POSTOS.chuva[0]!.mapa;
  const atual: Medias = { chuva: { [mapa]: { '9': 50 } }, vazao: {}, nivel: {} };

  const r = aplicarMedias(atual, { mes: 9, chuva: { [mapa]: 55.7204, 'nao-existe': 10 }, vazao: { [POSTOS.fluviometria[0]!.mapa]: -1 } });
  assert.ok(!('erro' in r));
  assert.equal(r.alterados, 1);
  assert.equal(r.medias.chuva[mapa]!['9'], 55.72);
  assert.equal(atual.chuva[mapa]!['9'], 50, 'não altera o objeto recebido');

  const igual = aplicarMedias(atual, { mes: 9, chuva: { [mapa]: 50 } });
  assert.ok(!('erro' in igual) && igual.alterados === 0);

  const apagar = aplicarMedias(atual, { mes: 9, chuva: { [mapa]: null } });
  assert.ok(!('erro' in apagar) && apagar.alterados === 1 && apagar.medias.chuva[mapa]!['9'] === undefined);

  assert.deepEqual(aplicarMedias(atual, { mes: 13 }), { erro: 'Mês inválido.' });
});
