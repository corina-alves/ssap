import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIAGRAMAS_UNIFILARES, ehPostoSibh, IDS_RADAR, POSTOS_SIBH } from '../src/conteudo/diagramas-unifilares';
import {
  chuvaPorDia,
  climatologiaMes,
  diaSp,
  faixa925,
  hm3,
  janelasChuva,
  leiturasDe,
  mediaMovel,
  mediasDiarias,
  periodoHidrologico,
  POSTOS_CONTROLE,
  RESERVATORIOS_PCJ,
  somaMensal,
  tabelaMensal,
} from '../src/lib/hidrologia/cantareira-operacao';
import type { Medicao } from '../src/lib/integracoes/sibh-medicoes';

test('faixas da Res. ANA/DAEE 925: limites de volume, Santa Inês e metas dos postos', () => {
  assert.equal(faixa925(60).numero, 1);
  assert.equal(faixa925(59.99).numero, 2);
  assert.equal(faixa925(40).numero, 2);
  assert.equal(faixa925(39.9).numero, 3);
  assert.equal(faixa925(25).numero, 4);
  assert.equal(faixa925(19.99).numero, 5);
  assert.equal(faixa925(45).santaInes, 31);
  assert.deepEqual(faixa925(70).metas15d, { valinhos: 12, atibaia: 3, buenopolis: 2.5 });
  assert.deepEqual(faixa925(35).metas15d, { valinhos: 11, atibaia: 2, buenopolis: 2 });
  assert.equal(faixa925(10).metas15d, null);
  assert.equal(faixa925(10).minimoDiario.atibaia, null); // § 10: Faixa 5 só fala de Valinhos e Buenópolis
});

test('período hidrológico do art. 3º', () => {
  assert.deepEqual(periodoHidrologico('2026-11-16'), { nome: 'seco', de: '2026-06-01', ate: '2026-11-30' });
  assert.deepEqual(periodoHidrologico('2026-12-01'), { nome: 'úmido', de: '2026-12-01', ate: '2027-05-31' });
  assert.deepEqual(periodoHidrologico('2027-03-10'), { nome: 'úmido', de: '2026-12-01', ate: '2027-05-31' });
  assert.equal(periodoHidrologico('2026-05-31').nome, 'úmido');
  assert.equal(periodoHidrologico('2026-06-01').nome, 'seco');
});

test('leituras do SIBH: nível em cm vira m, vazão fica em m³/s, e as médias são por dia de Brasília', () => {
  // 02h UTC do dia 16 ainda é dia 15 em Brasília
  const med: Medicao[] = [
    ['30846', '2026/11/16 02', 200, 40],
    ['30846', '2026/11/16 03', 210, 50],
    ['30846', '2026/11/16 04', 220, 60],
    ['99999', '2026/11/16 04', 1, 1],
  ];
  const ls = leiturasDe(med, 30846);
  assert.equal(ls.length, 3);
  assert.equal(ls[0]!.nivel, 2);
  assert.equal(diaSp(ls[0]!.t), '2026-11-15');
  assert.deepEqual(mediasDiarias(ls), [
    { data: '2026-11-15', nivel: 2, vazao: 40, leituras: 1 },
    { data: '2026-11-16', nivel: 2.15, vazao: 55, leituras: 2 },
  ]);
});

test('média móvel de 15 dias: precisa de 13 dias com dado', () => {
  const dias = Array.from({ length: 15 }, (_, i) => ({ data: `2026-11-${String(i + 1).padStart(2, '0')}`, nivel: 1, vazao: i + 1, leituras: 24 }));
  assert.deepEqual(mediaMovel(dias, '2026-11-15'), { valor: 8, de: '2026-11-01', ate: '2026-11-15', dias: 15 });
  const faltando = dias.filter((d) => !['2026-11-03', '2026-11-04', '2026-11-05'].includes(d.data));
  assert.equal(mediaMovel(faltando, '2026-11-15'), null);
  assert.equal(mediaMovel(faltando.slice(1), '2026-11-15'), null);
  assert.equal(mediaMovel(dias.filter((d) => d.data !== '2026-11-03'), '2026-11-15')?.dias, 14);
});

test('volume despachado: m³/s de cada dia × 86 400 s', () => {
  assert.equal(hm3([0.5, 0.5]), 0.09); // 2 × 0,5 × 86 400 = 86 400 m³
  assert.equal(hm3(Array(30).fill(10)), 25.92);
  assert.equal(hm3([]), 0);
});

test('média climatológica do mês: só os anos antes do atual', () => {
  const mensais = [
    { data: '2023-11-01', valor: 150 },
    { data: '2024-11-01', valor: 200 },
    { data: '2025-11-01', valor: 100 },
    { data: '2026-11-01', valor: 20 }, // mês corrente, incompleto
    { data: '2025-10-01', valor: 999 },
  ];
  assert.deepEqual(climatologiaMes(mensais, 11, 2026), { media: 150, anos: 3, de: 2023, ate: 2025 });
  assert.equal(climatologiaMes(mensais, 1, 2026), null);
});

test('chuva por radar: soma por dia de Brasília e janelas de 1 a 72 h', () => {
  const med: Medicao[] = [
    ['35839', '2026/11/15 02', 1, null], // dia 14 em Brasília
    ['35839', '2026/11/15 12', 2, null],
    ['35839', '2026/11/16 02', 4, null], // 23h do dia 15
  ];
  assert.deepEqual(chuvaPorDia(med), { '35839': { '2026-11-14': 1, '2026-11-15': 6 } });
  const hoje: Medicao[] = [
    ['35839', '2026/11/16 10:00', 0.5, null],
    ['35839', '2026/11/16 11:50', 1.5, null],
  ];
  const ate = Date.parse('2026-11-16T12:00:00Z'); // 09h em Brasília
  const j = janelasChuva(med, hoje, 35839, '2026-11-16', ate);
  // 24 h (desde 09h de ontem): 2 + 4 das horas fechadas e 0,5 + 1,5 de hoje; 48 h: mais o 1 de antes
  assert.deepEqual(j, { h1: 1.5, h24: 8, h48: 9, h72: 9, ate: '08:50' });
  assert.equal(janelasChuva(med, hoje, 1, '2026-11-16', ate), null);
});

test('diagrama do Cantareira: os 9 postos novos, os 3 de controle e o radar de cada um', () => {
  const d = DIAGRAMAS_UNIFILARES.cantareira!;
  const ids = d.nos.filter(ehPostoSibh).map((n) => n.sibh.id);
  for (const id of [24, 23, 22, 20, 805, 832, 29652, 15314, 29591]) assert.ok(ids.includes(id), `posto ${id} no diagrama`);
  for (const p of POSTOS_CONTROLE) {
    assert.ok(POSTOS_SIBH.has(p.id), `posto de controle ${p.prefixo} no diagrama`);
    assert.equal(POSTOS_SIBH.get(p.id)!.no.sibh.radar, p.radar);
  }
  for (const n of d.nos.filter(ehPostoSibh)) {
    assert.ok(n.ll, `${n.nome} com coordenada`);
    assert.ok(n.sibh.radar !== undefined && IDS_RADAR.has(n.sibh.radar), `radar de ${n.nome} é do diagrama`);
  }
  for (const r of RESERVATORIOS_PCJ) assert.ok(IDS_RADAR.has(r.radar));
});

test('vazão descarregada mensal: total só com os três reservatórios, volume pelos dias do mês (o corrente, pelos dias com dado)', () => {
  const m = (data: string, valor: number) => ({ data, valor });
  const linhas = tabelaMensal(
    [
      [m('2026-10-01', 0.25), m('2026-11-01', 0.25)],
      [m('2026-10-01', 1.150645), m('2026-11-01', 0.13)],
      [m('2026-10-01', 1.040645), m('2026-11-01', 0.12)],
    ],
    16,
    '2026-11',
  );
  assert.deepEqual(linhas[0], { mes: '2026-10', reservatorios: [0.25, 1.15, 1.04], total: 2.44, dias: 31, parcial: false, hm3: 6.54 });
  assert.deepEqual(linhas[1], { mes: '2026-11', reservatorios: [0.25, 0.13, 0.12], total: 0.5, dias: 16, parcial: true, hm3: 0.69 });
  assert.equal(tabelaMensal([[m('2026-10-01', 1)], [], []], 0, '2026-11')[0]!.total, null);
});

test('soma da tabela mensal: volume somado mês a mês e vazão média ponderada pelos dias', () => {
  const m = (data: string, valor: number) => ({ data, valor });
  const mensais = [
    [m('2026-09-01', 2), m('2026-10-01', 0.25), m('2026-11-01', 0.25)],
    [m('2026-10-01', 1.150645), m('2026-11-01', 0.13)], // setembro sem Cachoeira: fica fora da soma
    [m('2026-09-01', 2), m('2026-10-01', 1.040645), m('2026-11-01', 0.12)],
  ];
  const s = somaMensal(mensais, 16, '2026-11')!;
  // outubro (31 dias) + novembro até o dia 16: 47 dias
  assert.equal(s.dias, 47);
  assert.deepEqual([s.de, s.ate, s.meses, s.foraDaSoma], ['2026-10', '2026-11', 2, 1]);
  // Jaguari: (0,25 × 31 + 0,25 × 16) × 86 400 / 10⁶ = 1,0152 hm³
  assert.deepEqual(s.hm3, [1.02, 3.26, 2.95]);
  // o total bate com a soma da coluna de volume da tabela (6,54 + 0,69)
  assert.equal(s.hm3Total, 7.23);
  const tab = tabelaMensal(mensais, 16, '2026-11').filter((l) => l.hm3 !== null);
  assert.ok(Math.abs(tab.reduce((a, l) => a + l.hm3!, 0) - s.hm3Total) <= 0.01);
  assert.deepEqual(s.media, [0.25, 0.8, 0.73]);
  assert.equal(s.mediaTotal, 1.78);
  assert.equal(somaMensal([[m('2026-10-01', 1)], [], []], 0, '2026-11'), null);
});
