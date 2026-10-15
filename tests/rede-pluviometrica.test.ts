import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consolidar, csvRede, dataIso, estatisticas, periodoPedido, postosAtivos, subbaciaDoPonto, SUBBACIAS, type RedeMensal } from '../src/lib/boletins-sala/rede-pluviometrica';
import { hojeSp } from '../src/lib/integracoes/comum';
import type { Medicao } from '../src/lib/integracoes/sibh-medicoes';

const estacao = (id: string, v: Record<string, string> = {}) => ({
  id, prefix: `P-${id}`, name: `Posto ${id}`, latitude: '-23.5458', longitude: '-46.1347', city_name: 'Mogi das Cruzes', station_owner: 'SP ÁGUAS',
  ugrhi_cod: '6', operation_status: '1', transmission_status: 'ok', ...v,
});

test('sub-bacia pelo limite oficial: ponto dentro do polígono e ponto limítrofe pela mais próxima', () => {
  assert.deepEqual(subbaciaDoPonto(-46.1347, -23.5458), { slug: 'cabeceiras', metodo: 'poligono' }); // Rio Tietê em Mogi das Cruzes
  assert.deepEqual(subbaciaDoPonto(-46.7267, -23.6717), { slug: 'cotia_guarapiranga', metodo: 'poligono' }); // barragem Guarapiranga
  assert.deepEqual(subbaciaDoPonto(-46.6586, -23.3981), { slug: 'juqueri_cantareira', metodo: 'poligono' }); // Águas Claras
  assert.equal(subbaciaDoPonto(-46.3, -23.95)!.metodo, 'mais_proxima'); // Santos: fora da bacia
});

test('cadastro: só transmissão ok, da UGRHI 6 (ou dentro de um polígono), com coordenada e sem repetir', () => {
  const postos = postosAtivos([
    estacao('2'),
    estacao('1', { latitude: '-23.6717', longitude: '-46.7267' }),
    estacao('2'), // repetido
    estacao('3', { transmission_status: 'pendente' }),
    estacao('4', { ugrhi_cod: '5' }),
    estacao('5', { latitude: '' }),
    estacao('6', { operation_status: '0' }),
    estacao('7', { ugrhi_cod: '', latitude: '-23.95', longitude: '-46.3' }), // sem UGRHI e fora dos polígonos
    estacao('8', { latitude: '-23.95', longitude: '-46.3' }), // UGRHI 6 no cadastro, fora dos polígonos: sub-bacia mais próxima
    null,
  ]);
  assert.deepEqual(postos.map((p) => [p.id_sibh, p.subbacia, p.classificacao_espacial]), [
    ['8', 'billings_tamanduatei', 'mais_proxima'],
    ['2', 'cabeceiras', 'poligono'],
    ['1', 'cotia_guarapiranga', 'poligono'],
  ]);
  assert.deepEqual([postos[1]!.codigo, postos[1]!.nome, postos[1]!.municipio, postos[1]!.subbacia_nome], ['P-2', 'Posto 2', 'Mogi das Cruzes', 'Cabeceiras']);
});

test('consolidação: zero é dado, sem medição é "sem dados", e só entra o mês pedido', () => {
  const postos = postosAtivos([estacao('1'), estacao('2'), estacao('3')]);
  const medidas: Medicao[] = [
    ['1', '2026/09/01', 10.25, null], ['1', '2026/09/02', 0, null], ['1', '2026/09/03', 30.4, null],
    ['1', '2026/10/01', 99, null], // outro mês
    ['1', '2026/09/04', -1, null], // negativo: descartado
    ['1', '2026/09/05', null, null],
    ['2', '2026/09/10', 0, null],
    ['9', '2026/09/10', 5, null], // posto fora do cadastro
  ];
  const [a, b, c] = consolidar(postos, medidas, 2026, 9);
  assert.deepEqual(
    [a!.acumulado_mensal, a!.dias_com_dados, a!.dias_com_chuva, a!.maior_chuva_diaria, a!.data_maior_chuva, a!.media_diaria, a!.situacao_dados],
    [40.7, 3, 2, 30.4, '2026-09-03', 13.6, 'parcial'],
  );
  assert.deepEqual([b!.acumulado_mensal, b!.situacao_dados], [0, 'parcial']);
  assert.deepEqual([c!.acumulado_mensal, c!.dias_com_dados, c!.situacao_dados], [null, 0, 'sem_dados']);

  const e = estatisticas([a!, b!, c!]);
  assert.deepEqual([e.postos_total, e.postos_com_dados, e.postos_sem_dados, e.cobertura_percentual], [3, 2, 1, 66.7]);
  assert.deepEqual([e.media, e.minima, e.maxima, e.total_rede], [20.4, 0, 40.7, 40.7]);
  assert.deepEqual([e.posto_minimo, e.posto_maximo], [{ codigo: 'P-2', nome: 'Posto 2' }, { codigo: 'P-1', nome: 'Posto 1' }]);
  assert.deepEqual([estatisticas([]).media, estatisticas([]).cobertura_percentual], [null, 0]);

  // mês com todos os dias: "completo"
  const fev = Array.from({ length: 28 }, (_, i): Medicao => ['1', `2027/02/${String(i + 1).padStart(2, '0')}`, 1, null]);
  assert.equal(consolidar(postos, fev, 2027, 2)[0]!.situacao_dados, 'completo');
});

test('datas do SIBH, período pedido e planilha', () => {
  assert.deepEqual(['2026/10/05', '2026-10-05T03:00:00Z', '05/10/2026', 'ontem'].map(dataIso), ['2026-10-05', '2026-10-05', '2026-10-05', null]);
  const hoje = hojeSp();
  const atual = { ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) };
  assert.deepEqual(periodoPedido('2020', '3'), { ano: 2020, mes: 3 });
  for (const [a, m] of [[null, null], ['1999', '13'], ['2999', '0'], ['x', '1e1']] as const) assert.deepEqual(periodoPedido(a, m), atual);

  const postos = consolidar(postosAtivos([estacao('1', { name: 'Posto; "A"' }), estacao('2')]), [['1', '2026/09/01', 10.5, null]], 2026, 9);
  const linhas = csvRede({ postos } as RedeMensal).split('\n');
  assert.ok(linhas[0]!.startsWith('﻿Código;Nome;Município;Sub-bacia;Latitude;'));
  assert.equal(linhas[1], 'P-1;"Posto; ""A""";"Mogi das Cruzes";Cabeceiras;-23,5458;-46,1347;ativo;10,5;10,5;2026-09-01;1;1;1;parcial');
  assert.equal(linhas[2], 'P-2;"Posto 2";"Mogi das Cruzes";Cabeceiras;-23,5458;-46,1347;ativo;;;;0;0;0;sem_dados');
  assert.equal(Object.keys(SUBBACIAS).length, 6);
});
