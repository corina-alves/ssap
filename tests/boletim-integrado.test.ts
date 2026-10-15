import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cargaMes, chuvaDiaria, estatisticasNivel, interpretarCargas, interpretarReservatorio, leituras, linhaChuva, mediasPorSubbacia, numeroBr, periodoBoletim, postoPorCodigo, resumoChuva,
  type ChuvaMes, type DadosExutorios,
} from '../src/lib/boletins-sala/boletim-integrado';
import { conformidadeConama, htmlExutorios } from '../src/lib/boletins-sala/boletim-integrado-html';
import { postosAtivos } from '../src/lib/boletins-sala/rede-pluviometrica';
import { normalizar } from '../src/lib/integracoes/simqua';
import type { Medicao } from '../src/lib/integracoes/sibh-medicoes';

const estacao = (id: string, v: Record<string, string> = {}) => ({
  id, prefix: `P-${id}`, alt_prefix: '', name: `Posto ${id}`, latitude: '-23.5458', longitude: '-46.1347', city_name: 'Mogi das Cruzes', station_owner: 'SP ÁGUAS',
  ugrhi_cod: '6', operation_status: '1', transmission_status: 'ok', ...v,
});

test('cadastro dos boletins: posto em operação (mesmo sem transmissão), dentro de um polígono; código alternativo tem preferência', () => {
  const postos = postosAtivos(
    [
      estacao('1', { transmission_status: 'pendente', alt_prefix: '346' }),
      estacao('2', { operation_status: '2' }),
      estacao('3', { latitude: '-23.95', longitude: '-46.3' }), // fora dos polígonos
      estacao('4', { prefix: '346' }),
    ],
    'operacao',
  );
  assert.deepEqual(postos.map((p) => p.id_sibh), ['4', '1']);
  assert.equal(postoPorCodigo(postos, '346')!.id_sibh, '1');
  assert.equal(postoPorCodigo(postos, 'p-1')!.id_sibh, '1');
  assert.equal(postoPorCodigo(postos, '999'), null);
});

test('chuva por sub-bacia: descarta leitura negativa ou acima de 200 mm; média dos acumulados dos postos com dado', () => {
  const postos = postosAtivos([estacao('1'), estacao('2'), estacao('3'), estacao('4', { latitude: '-23.6717', longitude: '-46.7267' })], 'operacao');
  const medidas: Medicao[] = [
    ['1', '2026/09/01', 10, null], ['1', '2026/09/02', 250, null], ['1', '2026/09/03', -3, null], ['1', '2026/09/04', 20.5, null],
    ['2', '2026/09/01', 0, null],
    ['4', '2026/09/10', 40, null], ['4', '2026/10/01', 99, null],
  ];
  const diario = chuvaDiaria(medidas, 2026, 9);
  assert.deepEqual([...diario.get('1')!], [['2026-09-01', 10], ['2026-09-04', 20.5]]);
  // Cabeceiras: postos 1 (30,5) e 2 (0); o 3 não tem dado e não entra
  assert.deepEqual(mediasPorSubbacia(postos, diario), { cabeceiras: { media: 15.25, postos: 2 }, cotia_guarapiranga: { media: 40, postos: 1 } });

  const porAno = new Map<number, ChuvaMes>([[2018, { cabeceiras: { media: 100, postos: 5 } }], [2021, { cabeceiras: { media: 40, postos: 5 } }], [2023, { cabeceiras: { media: 60, postos: 5 } }]]);
  assert.deepEqual(linhaChuva('cabeceiras', { cabeceiras: { media: 15.25, postos: 2 } }, porAno), {
    slug: 'cabeceiras', nome: 'Cabeceiras', atual: 15.25, minima: 40, media: 200 / 3, maxima: 100, // toda a série, desde 2015
  });
  assert.deepEqual(linhaChuva('juqueri_cantareira', null, porAno), { slug: 'juqueri_cantareira', nome: 'Juqueri/Cantareira', atual: null, minima: null, media: null, maxima: null });
});

test('nível: cm → m no horário de Brasília, estatísticas e permanência nas faixas de cota', () => {
  const l = leituras([['7', '2026/09/01 03:10', 73050, 12.5], ['7', '2026/09/01 03:00', 73000, null], ['7', '2026/09/01 03:20', null, null], ['7', '2026/09/01 03:30', 73200, 7.5]]);
  assert.deepEqual(l[0], { t: '2026-09-01 00:00', nivel: 730, vazao: null });
  assert.deepEqual(l.map((x) => x.nivel), [730, 730.5, null, 732]);
  const s = estatisticasNivel(l, { atencao: 730.4, alerta: 731, emergencia: 731.9, extravasamento: null });
  assert.deepEqual([s.nivel!.quantidade, s.nivel!.minimo, s.nivel!.maximo, s.vazao], [3, 730, 732, { media: 10, maximo: 12.5, minimo: 7.5, quantidade: 2 }]);
  assert.deepEqual(Object.values(s.permanencia!).map((v) => Math.round(v)), [33, 33, 0, 33, 0]);
  assert.equal(estatisticasNivel(l, null).permanencia, null);
  assert.deepEqual(estatisticasNivel([], null), { nivel: null, vazao: null, permanencia: null });

  const r = resumoChuva(new Map([['2026-09-02', 10], ['2026-09-01', 0], ['2026-09-03', 30]]));
  assert.deepEqual([Object.keys(r.diario), r.acumulada, r.maxima_diaria, r.dias_com_chuva, r.media_dias_com_chuva], [['2026-09-01', '2026-09-02', '2026-09-03'], 40, 30, 2, 20]);
  assert.deepEqual([resumoChuva(undefined).acumulada, resumoChuva(undefined).dias_com_chuva], [null, 0]);
});

test('SIMQUA: só médias válidas do mês pedido; CONAMA conta dias conformes', () => {
  const dia = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const m = normalizar(
    {
      ph: { serie_validos: [[dia('2026-09-02'), 7.2, 'ate'], [dia('2026-09-01'), 5.5, 'ate'], [dia('2026-09-03'), null, 'ate'], [dia('2026-08-31'), 7, 'ate']] },
      oxigenio: { serie_validos: [[dia('2026-09-01'), 6.5], [dia('2026-09-02'), 4.9]] },
      turbidez: { serie_validos: [[dia('2026-09-01'), 41]] },
    },
    2026,
    9,
  );
  assert.deepEqual(m.ph, [['2026-09-01', 5.5], ['2026-09-02', 7.2]]);
  assert.deepEqual([m.od.length, m.condutividade, m.temperatura], [2, [], []]);
  assert.throws(() => normalizar([], 2026, 9), /formato inesperado/);
  assert.deepEqual(conformidadeConama('especial', m), {
    od: { conformes: 1, nao_conformes: 1, total: 2 }, ph: { conformes: 1, nao_conformes: 1, total: 2 }, turbidez: { conformes: 0, nao_conformes: 1, total: 1 },
  });
  assert.equal(conformidadeConama('2', m).turbidez.conformes, 1);
});

test('cadastro dos exutórios: linhas coladas da planilha, carga orgânica e período', () => {
  assert.deepEqual(['1.234,5', '12,3', '12.3', ' 7 ', '', 'abc', '1,2,3'].map(numeroBr), [1234.5, 12.3, 12.3, 7, null, null, null]);
  assert.deepEqual(interpretarReservatorio('01/09/2026;0,0;118,2;143,5;32,4\n2026-09-02\t12,5\t\t150\t33,1\n05/10/2026;1;1;1;1\n31/09/2026;1;1;1;1\nlixo', 2026, 9), {
    '2026-09-01': { chuva: 0, afluente: 118.2, efluente: 143.5, volume: 32.4 },
    '2026-09-02': { chuva: 12.5, afluente: null, efluente: 150, volume: 33.1 },
  });
  assert.deepEqual(interpretarCargas('2024;3;1,5;152,3;43,2;18,6\n2023;9;;;;\n1999;1;1;1;1;1\n2024;13;1;1;1;1\nano;mes'), {
    '2024-03': { q_pinheiros: 1.5, q_tiete: 152.3, dbo_pinheiros: 43.2, dbo_tiete: 18.6 },
    '2023-09': { q_pinheiros: null, q_tiete: null, dbo_pinheiros: null, dbo_tiete: null },
  });
  const c = cargaMes({ q_pinheiros: 2, dbo_pinheiros: 50, q_tiete: 100, dbo_tiete: 20 });
  assert.deepEqual([c.pinheiros, c.tiete, c.total].map((v) => Math.round(v! * 100) / 100), [8.64, 172.8, 181.44]);
  assert.deepEqual(cargaMes({ q_pinheiros: 2 }), { pinheiros: null, tiete: null, total: null });
  assert.deepEqual(periodoBoletim('2020', 3, { ano: 2026, mes: 9 }), { ano: 2020, mes: 3 });
  assert.deepEqual(periodoBoletim('1999', '13', { ano: 2026, mes: 9 }), { ano: 2026, mes: 9 });
});

test('Boletim Exutórios: sem cadastro avisa; com cadastro monta tabela e gráficos; edição vale na célula e marca o ajuste', () => {
  const vazio: DadosExutorios = { pedreira: null, manuais: { pedreira: {}, pirapora: {}, cargas: {} } };
  const semDados = htmlExutorios(vazio, 2026, 9, { textos: {}, valores: {} });
  assert.equal(semDados.split('class="slide-tela"').length - 1, 4); // mapa, dois reservatórios e carga, todos com aviso
  assert.match(semDados, /Reservatório Pirapora: sem dados de Setembro\/2026 e sem cadastro manual/);
  assert.match(semDados, /ainda não cadastradas/);
  assert.equal(semDados.includes('data-grafico='), false);

  const d: DadosExutorios = {
    pedreira: null,
    manuais: {
      pedreira: {}, pirapora: { '2026-09-01': { chuva: 0, afluente: 118.2, efluente: 143.5, volume: 32.4 } },
      cargas: { '2024-09': { q_pinheiros: 1.5, q_tiete: 150, dbo_pinheiros: 40, dbo_tiete: 18 }, '2026-09': { q_pinheiros: 2, q_tiete: 100, dbo_pinheiros: 50, dbo_tiete: 20 } },
    },
  };
  const html = htmlExutorios(d, 2026, 9, { textos: { 'carga_organica_no_pinheiros_pirapora.1': 'Carga <alta> no mês.' }, valores: { 'res.pirapora.volume.2026-09-01': 40 } });
  assert.equal(html.split('data-grafico=').length - 1, 3); // Pirapora, carga do mês ao longo dos anos e histórico
  assert.match(html, /<td><b>181<\/b><\/td>/); // carga total do mês: 8,64 + 172,8
  assert.match(html, /2024 a 2024\*<br>\(média\)/); // 2025 sem amostragem
  assert.match(html, /class="editavel ajustado" data-chave="res.pirapora.volume.2026-09-01" data-casas="2" data-original="32.4" data-valor="40"/);
  assert.match(html, /Carga &#60;alta&#62; no mês\./);
  assert.match(html, /Fonte: dados operativos informados manualmente\./);
});
