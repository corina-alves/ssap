import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SistemaSabesp } from '../src/lib/integracoes/sabesp';
import { montarTabela, ultimoDia } from '../src/lib/hidrologia/volumes-mensais';

/** Resumo da SABESP de um sistema só com o que a tabela usa. */
const sis = (id: number, volumePct: number | null, chuvaMes: number | null = null, chuvaMediaHistorica: number | null = null) =>
  ({ id, nome: '', data: '', volumePct, volumeHm3: null, variacaoVolume: null, chuvaDia: null, chuvaMes, chuvaMediaHistorica, vazaoNatural: null, vazaoNaturalMes: null, vazaoNaturalMediaHistorica: null, vazaoProduzida: null, vazaoCaptada: null, vazaoJusante: null, vazaoAfluente: null }) as SistemaSabesp;

// Valores de 30/09/2026, 31/08/2026 e 30/09/2025 (boletim mensal de setembro/2026)
const SET26 = [sis(64, 41.1, 283.4, 78.8), sis(65, 54.25, 247.3, 57), sis(66, 95.1, 342.8, 75.9), sis(67, 89.9, 392.2, 74.6), sis(68, 94.8, 368.8, 90.8), sis(69, 55.7, 397.8, 135.9), sis(72, 84.9, 441.4, 109.4), sis(75, 55.3)];
const AGO26 = [sis(64, 33.0), sis(65, 42.4), sis(66, 67.5), sis(67, 54.4), sis(68, 75.6), sis(69, 41.4), sis(72, 67.8), sis(75, 43.1)];
const SET25 = [sis(64, 28.3), sis(65, 25.0), sis(66, 47.8), sis(67, 50.3), sis(68, 53.2), sis(69, 18.7), sis(72, 46.2), sis(75, 31.5)];
const sabesp = new Map([
  ['2026-09-30', SET26],
  ['2026-08-31', AGO26],
  ['2025-09-30', SET25],
]);

test('último dia do mês (inclusive fevereiro bissexto)', () => {
  assert.equal(ultimoDia('2026-09'), '2026-09-30');
  assert.equal(ultimoDia('2024-02'), '2024-02-29');
  assert.equal(ultimoDia('2025-02'), '2025-02-28');
});

test('tabela do boletim: datas, rótulos, diferenças em p.p. e SIM com a média dos sistemas', () => {
  const t = montarTabela('2026-09', sabesp, new Map());
  assert.deepEqual(t.datas, { atual: '2026-09-30', mesAnterior: '2026-08-31', anoAnterior: '2025-09-30' });
  assert.deepEqual(t.rotulos, { atual: 'Set/26', mesAnterior: 'Ago/26', anoAnterior: 'Set/25', anoAnteriorAno: '2025' });
  assert.deepEqual(
    t.sistemas.map((s) => s.nome),
    ['Cantareira', 'Alto Tietê', 'Guarapiranga', 'Cotia', 'Rio Grande', 'Rio Claro', 'São Lourenço'],
  );
  const cotia = t.sistemas.find((s) => s.nome === 'Cotia')!;
  assert.deepEqual([cotia.atual, cotia.mesAnterior, cotia.anoAnterior, cotia.difMes, cotia.difAno], [89.9, 54.4, 50.3, 35.5, 39.6]);
  // diferença com o valor sem arredondar (54,25 − 42,4 = 11,85 → 11,9)
  assert.equal(t.sistemas.find((s) => s.nome === 'Alto Tietê')!.difMes, 11.9);
  // SIM: volume da SABESP; chuva e média histórica = média simples dos 7 sistemas
  assert.deepEqual([t.sim.atual, t.sim.difMes, t.sim.difAno, t.sim.chuvaMes, t.sim.mediaHistorica], [55.3, 12.2, 23.8, 353.4, 88.9]);
  assert.deepEqual(t.faltas, []);
});

test('Cantareira pela ANA quando ela publicou o dia; dia sem publicação fica sem valor', () => {
  const ana = new Map([
    ['2026-09-30', 41.10395696646156],
    ['2026-08-31', 32.987285545458256],
  ]);
  const t = montarTabela('2026-09', sabesp, ana);
  const c = t.sistemas[0]!;
  assert.equal(c.fonte, 'ana');
  assert.deepEqual([c.atual, c.mesAnterior, c.anoAnterior, c.difMes, c.difAno], [41.1, 33.0, 28.3, 8.1, 12.8]); // ano anterior sem ANA: SABESP

  const semAgosto = montarTabela('2026-09', new Map([...sabesp].filter(([d]) => d !== '2026-08-31')), new Map());
  assert.deepEqual(semAgosto.faltas, ['2026-08-31']);
  assert.equal(semAgosto.sistemas[1]!.mesAnterior, null);
  assert.equal(semAgosto.sistemas[1]!.difMes, null); // nunca troca por outro dia
  assert.equal(semAgosto.sistemas[1]!.atual, 54.3);
});

test('texto da análise: só fatos da tabela, diferença em p.p., SIM no fim', async () => {
  const { textoAnalise } = await import('../src/lib/hidrologia/volumes-mensais');
  const t = montarTabela('2026-09', sabesp, new Map());
  const texto = textoAnalise(t)!;
  assert.match(texto, /RMSP\) em 30\/09\/2026, comparada ao último dia do mês anterior \(31\/08\/2026\) e ao mesmo período do ano anterior \(30\/09\/2025\)\./);
  assert.match(texto, /Em relação ao mês anterior, o volume útil subiu em todos os sistemas\./);
  assert.match(texto, /Atualmente, o volume útil do sistema Cantareira é de 41,1%, enquanto no mesmo período do ano anterior registrava 28,3%\./);
  assert.match(texto, /O sistema Alto Tietê apresenta 54,3% do volume útil; Guarapiranga, 95,1%; .*; e São Lourenço, 84,9%\./);
  assert.match(texto, /As maiores variações foram no sistema Cotia em relação ao mês anterior \(\+35,5 p\.p\.\) e no sistema Guarapiranga em relação ao ano anterior \(\+47,3 p\.p\.\)\./);
  assert.match(texto, /Já o Sistema Integrado Metropolitano \(SIM\) possui 55,3% do volume útil atual, ante 43,1% no mês anterior e 31,5% no mesmo período do ano anterior\.$/);
  // mês misto
  const caiu = new Map(sabesp);
  caiu.set('2026-08-31', AGO26.map((s) => (s.id === 66 ? sis(66, 99) : s)));
  assert.match(textoAnalise(montarTabela('2026-09', caiu, new Map()))!, /subiu em 6 sistemas e caiu em 1\./);
  assert.equal(textoAnalise(montarTabela('2026-09', new Map(), new Map())), null);
});
