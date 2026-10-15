import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dataSumario, extrair, mediaSistemas, previsaoPorSistema, RESERVATORIOS, simCalculado, tabelaDescargas, ultimos7Dias } from '../src/lib/boletins-sala/sumario-hidrico';
import { hojeSp } from '../src/lib/integracoes/comum';
import type { PrevisaoDiaria } from '../src/lib/integracoes/openmeteo';
import type { SistemaSabesp } from '../src/lib/integracoes/sabesp';

const sabesp = (id: number, v: Partial<SistemaSabesp>): SistemaSabesp => ({
  id, nome: '', data: '2026-10-05', volumePct: null, volumeHm3: null, variacaoVolume: null, chuvaDia: null, chuvaMes: null, chuvaMediaHistorica: null,
  vazaoNatural: null, vazaoNaturalMes: null, vazaoNaturalMediaHistorica: null, vazaoProduzida: null, vazaoCaptada: null, vazaoJusante: null, vazaoAfluente: null, ...v,
});

test('SIM: volume e vazão oficiais, chuva pela média dos sistemas; sem o id 75, tudo pela média', () => {
  const dia = extrair([
    sabesp(64, { volumePct: 40, chuvaMes: 10, chuvaDia: 2, vazaoNatural: 30, vazaoNaturalMes: 20 }),
    sabesp(65, { volumePct: 60, chuvaMes: 30, chuvaDia: 4, vazaoNatural: 10, vazaoNaturalMes: 10 }),
    sabesp(75, { volumePct: 55, chuvaMes: 99, vazaoNaturalMes: 95 }),
  ]);
  assert.equal(dia.get(64)!.nome, 'CANTAREIRA');
  assert.equal(mediaSistemas(dia, 'volume'), 50);
  const sim = simCalculado(dia);
  assert.deepEqual([sim.volume, sim.chuvaMes, sim.vazaoMes, sim.chuvaDia, sim.vazaoDia], [55, 20, 95, 3, 20]);
  dia.delete(75);
  assert.deepEqual([simCalculado(dia).volume, simCalculado(dia).vazaoMes], [50, 15]);
  assert.equal(simCalculado(extrair(null)).volume, null);
});

test('últimos 7 dias: chuva somada e vazão média, pulando dia sem dado', () => {
  const dia = (chuva: number | null, vazao: number | null) => extrair([sabesp(64, { chuvaDia: chuva, vazaoNatural: vazao }), sabesp(75, { chuvaDia: chuva, vazaoNatural: vazao })]);
  const r = ultimos7Dias([dia(5, 30), undefined, dia(null, 20), dia(1.5, null), extrair(null)]);
  assert.deepEqual(r.cantareira, { chuva7dias: 6.5, vazao7dias: 25 });
  assert.deepEqual(r.sim, { chuva7dias: 6.5, vazao7dias: 25 });
  assert.deepEqual(ultimos7Dias([]).sim, { chuva7dias: null, vazao7dias: null });
});

test('previsão: média diária e de 7 dias por sistema e do SIM; sem a Open-Meteo, tudo vazio', () => {
  const n = Object.values(RESERVATORIOS).flat().length;
  const ponto = (mm: (number | null)[]): PrevisaoDiaria => ({ lat: 0, lon: 0, datas: ['2026-10-05', '2026-10-06'], chuvaMm: mm, probabilidade: [], tmax: [], tmin: [] });
  // Cantareira (5 reservatórios): 10 e 20 mm em todos, menos o primeiro (0 e sem dado no 2º dia)
  const p = previsaoPorSistema(Array.from({ length: n }, (_, i) => (i === 0 ? ponto([0, null]) : ponto([10, 20]))));
  const cant = p.sistemas[0]!;
  assert.equal(cant.sistema, 'Cantareira');
  assert.deepEqual(cant.reservatorios[0], { nome: 'Jaguari/Jacareí', dias: [0, 0], total: 0 });
  assert.deepEqual(cant.media_dias, [8, 16]);
  assert.equal(cant.media7, 24);
  assert.deepEqual(p.resumo.map((r) => r.nome), [...Object.keys(RESERVATORIOS), 'SIM']);
  assert.equal(p.resumo.at(-1)!.chuva7dias, Math.round(((n - 1) * 30 * 10) / n) / 10);

  const vazio = previsaoPorSistema(null);
  assert.deepEqual([vazio.datas, vazio.sim_media7, vazio.sistemas[0]!.media7, vazio.sistemas[0]!.reservatorios[0]], [[], null, null, { nome: 'Jaguari/Jacareí', dias: [], total: null }]);
});

test('descargas: último valor, média dos 7 últimos e total pela soma quando a série do Cantareira não vem', () => {
  const serie = (...valores: number[]) => valores.map((valor, i) => ({ data: `2026-10-${String(i + 1).padStart(2, '0')}`, valor }));
  const vazias = { cantareira: [], atibainha: [], cachoeira: [], jaguari: [], paiva: [] };
  const t = tabelaDescargas('2026-10-09', { ...vazias, atibainha: serie(1, 2, 3, 4, 5, 6, 7, 8, 9), cachoeira: serie(2, 2) }, { ...vazias, cantareira: serie(6.4) });
  assert.deepEqual(t.diaria, { cantareira: 11, atibainha: 9, cachoeira: 2, jaguari: null, paiva: null });
  assert.deepEqual(t.media7dias, { cantareira: 8, atibainha: 6, cachoeira: 2, jaguari: null, paiva: null });
  assert.deepEqual(t.mensal, { cantareira: 6.4, atibainha: null, cachoeira: null, jaguari: null, paiva: null });
  assert.deepEqual([t.dataDiaria, t.mesTexto, t.ateTexto], ['2026-10-09', 'Outubro/2026', 'até 09/10']);
  assert.equal(tabelaDescargas('2026-10-01', vazias, vazias).diaria.cantareira, null);
});

test('data do sumário: só AAAA-MM-DD que não seja futura', () => {
  assert.equal(dataSumario('2026-01-15'), '2026-01-15');
  for (const ruim of [null, '', '15/01/2026', '2999-01-01', '2026-13-45', "2026-01-15' OR 1=1"]) assert.equal(dataSumario(ruim), hojeSp());
});
