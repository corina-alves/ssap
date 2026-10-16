import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linhaMes, periodos } from '../src/lib/hidrologia/medias-mensais';
import type { SistemaSabesp } from '../src/lib/integracoes/sabesp';

const sistema = (id: number, v: Partial<SistemaSabesp>): SistemaSabesp => ({
  id, nome: '', data: '2026-09-30', volumePct: null, volumeHm3: null, variacaoVolume: null, chuvaDia: null, chuvaMes: null,
  chuvaMediaHistorica: null, vazaoNatural: null, vazaoNaturalMes: null, vazaoNaturalMediaHistorica: null, vazaoProduzida: null,
  vazaoCaptada: null, vazaoJusante: null, vazaoAfluente: null, ...v,
});

test('períodos: último dia dos meses encerrados e, no mês corrente, hoje recuando sem sair do mês', () => {
  const ps = periodos(3, '2026-03-02');
  assert.deepEqual(ps.map((p) => p.rotulo), ['Jan/26', 'Fev/26', 'Mar/26']);
  assert.deepEqual(ps.map((p) => p.datas), [['2026-01-31'], ['2026-02-28'], ['2026-03-02', '2026-03-01']]);
  assert.deepEqual(periodos(2, '2026-01-31').map((p) => p.rotulo), ['Dez/25', 'Jan/26']);
});

test('linha do mês: % da MLT e da média climatológica; sem histórico não há percentual', () => {
  const resumo = [sistema(64, { vazaoNaturalMes: 20, vazaoNaturalMediaHistorica: 40, chuvaMes: 150, chuvaMediaHistorica: 100 }), sistema(65, { vazaoNaturalMes: 5 })];
  const l = linhaMes('Set/26', '2026-09-30', resumo, 64);
  assert.deepEqual([l.mlt, l.mc], [50, 150]);
  assert.equal(linhaMes('Set/26', '2026-09-30', resumo, 65).mlt, null);
  assert.equal(linhaMes('Set/26', null, [], 64).vazaoMensal, null);
});

test('SIM: vazão do próprio registro (ou média dos demais) e chuva sempre pela média dos demais', () => {
  const demais = [sistema(64, { vazaoNaturalMes: 10, chuvaMes: 100 }), sistema(65, { vazaoNaturalMes: 30, chuvaMes: 200 })];
  const comSim = linhaMes('Set/26', '2026-09-30', [...demais, sistema(75, { vazaoNaturalMes: 99, chuvaMes: 1 })], 75);
  assert.deepEqual([comSim.vazaoMensal, comSim.chuvaMensal], [99, 150]);
  assert.equal(linhaMes('Set/26', '2026-09-30', demais, 75).vazaoMensal, 20);
});
