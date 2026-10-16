import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ErroValidacao } from '../src/lib/graficos-tabela';
import { csvConsolidado, data, dataExcel, decodificar, formatarEsi, graficos, lerCsv, lerGrade, limiteFaixa, mesesDa, numero, resumo, retomadas, sistemaCitado, filtrarPeriodo, filtrarSimulacoes, simulacoesDa, chaveSimulacao, retiradasIguais } from '../src/lib/hidrologia/projecoes';
import { lerXlsx } from '../src/lib/planilha-xlsx';

// dados_consolidados.csv do Kit_Atualizar_Graficos (Cantareira, 3 ESIs × 3 QNs × 13 meses)
const KIT = readFileSync(join(import.meta.dirname, 'dados', 'projecao_consolidado.csv'));

test('limite da faixa: tabela, mês fora da tabela usa o do ano anterior, sem dado → null', () => {
  assert.equal(limiteFaixa('2026-11'), 30);
  assert.equal(limiteFaixa('2026-11', 7), -12);
  assert.equal(limiteFaixa('2027-06'), 49.2); // jun/2027 = jun/2026
  assert.equal(limiteFaixa('2025-01'), null);
});

test('números, datas, ESI e listas da grade', () => {
  assert.deepEqual(['40,13716', '40.13716', '1.234,5', ' 38 %', 'abc', '', '1,2,3'].map(numero), [40.13716, 40.13716, 1234.5, 38, null, null, null]);
  assert.deepEqual(['2026-09-30 03:00', '2026-09-30T03:00:00', '30/09/2026', '1/2/26 03:00', '31/02/2026', 'Data'].map(data), [
    '2026-09-30', '2026-09-30', '2026-09-30', '2026-02-01', null, null,
  ]);
  assert.deepEqual([29, 29.5, 29.25, 30.004].map(formatarEsi), ['29', '29.5', '29.25', '30']);
});

test('CSV consolidado do kit: 117 fechamentos e o mesmo resumo da marcação da GDN', () => {
  const registros = lerCsv(decodificar(KIT), 'dados_consolidados.csv');
  assert.equal(registros.length, 117);
  const texto = resumo('cantareira', registros);
  // mesmas linhas do resumo_marcacao_GDN.txt do kit (lá com ponto decimal)
  for (const linha of [
    'ESI 29 m³/s:',
    '  QN 100%: sem retomada identificada no período analisado',
    '  QN 70%: jan/27 fecha em 38,82% (< 39,90%); retomada em fev/27',
    '  QN 50%: nov/26 fecha em 29,36% (< 30,00%); retomada em dez/26',
    '  QN 70%: jan/27 fecha em 37,69% (< 39,90%); retomada em fev/27',
    '  QN 50%: nov/26 fecha em 28,75% (< 30,00%); retomada em dez/26',
    '  QN 70%: jan/27 fecha em 36,55% (< 39,90%); retomada em fev/27',
    '  QN 50%: nov/26 fecha em 28,16% (< 30,00%); retomada em dez/26',
  ]) {
    assert.ok(texto.split('\n').includes(linha), linha);
  }
  assert.deepEqual(texto.split('\n').filter((l) => l.startsWith('ESI')), ['ESI 29 m³/s:', 'ESI 30 m³/s:', 'ESI 31 m³/s:']);
});

test('gráficos: um por ESI, QNs em ordem decrescente, limite e blocos da retomada', () => {
  const { graficos: gs, avisos } = graficos('cantareira', lerCsv(decodificar(KIT)));
  assert.deepEqual(avisos, []);
  assert.deepEqual(gs.map((g) => g.esi), ['29', '30', '31']);
  const g = gs[0]!;
  assert.equal(g.subtitulo, 'Retirada na ESI: 29 m³/s');
  assert.equal(g.arquivo, 'projecao_Sistema_Cantareira_ESI_29.png');
  assert.deepEqual(g.series.map((s) => [s.nome, s.cor]), [['QN 100%', '#255C8D'], ['QN 70%', '#E8912D'], ['QN 50%', '#B33A3A']]);
  assert.equal(g.rotulos.length, 13);
  assert.deepEqual([g.rotulos[0], g.rotulos[12]], ['set/26', 'set/27']);
  assert.equal(g.series[0]!.valores[0], 40.14);
  assert.equal(g.limite!.valores[2], 30); // nov/26
  // set/26 = índice 0: QN 50% cai em nov/26 (2) → dez/26 (3); QN 70% em jan/27 (4) → fev/27 (5)
  assert.deepEqual(g.marcas, [
    { de: 2, ate: 3, texto: 'Retomada da GDN: dez/26', cenarios: '(QN 50%)' },
    { de: 4, ate: 5, texto: 'Retomada da GDN: fev/27', cenarios: '(QN 70%)' },
  ]);
  assert.equal(g.y_min, 0);
  assert.ok(g.y_max >= 80 && g.y_max % 10 === 0);
});

test('retomadas no mesmo mês viram um bloco só; simulação com menos meses que as outras gera aviso', () => {
  const linhas = ['data;esi;qn;volume', '30/11/2026;29;70;29', '31/12/2026;29;70;40', '30/11/2026;29;50;25'];
  const { graficos: gs, avisos } = graficos('sim', lerCsv(linhas.join('\n')));
  assert.deepEqual(gs[0]!.marcas, [{ de: 0, ate: 1, texto: 'Retomada da GDN: dez/26', cenarios: '(QN 70% e QN 50%)' }]);
  assert.deepEqual(avisos, ['ESI 29 / QN 50%: sem valor em dez/26 (as outras simulações têm).']);
  assert.equal(retomadas(new Map([[100, new Map([['2026-11', 30]])]])).size, 0); // igual ao limite não é abaixo
});

test('simulação do SSD: dados diários viram o fechamento do mês; ESI e QN da célula ou do nome', () => {
  const csv = ['Data;Vazão;Volume Útil Final (%)', '29/09/2026;10,0;40,5', '30/09/2026;10,0;40,1', '01/10/2026;9,5;39,9', '31/10/2026;9,5;38,25'].join('\r\n');
  assert.deepEqual(lerCsv(csv, 'sim.csv', '29.5', 70), [
    { mes: '2026-09', esi: '29.5', qn: 70, valor: 40.1 },
    { mes: '2026-10', esi: '29.5', qn: 70, valor: 38.25 },
  ]);
  // sem cabeçalho de volume: primeiro número depois da data; ESI e QN pelo nome do arquivo
  assert.deepEqual(lerCsv('2026-09-30 03:00,40.13\n', 'QN70_ESI29,5.csv'), [{ mes: '2026-09', esi: '29.5', qn: 70, valor: 40.13 }]);
  assert.throws(() => lerCsv('2026-09-30,40.13', 'dados.csv'), (e) => e instanceof ErroValidacao && /informe a ESI e o QN/.test(e.erros[0]!));
  assert.throws(() => lerCsv('  \n', 'vazio.csv'), /arquivo vazio/);
  assert.throws(() => lerCsv('Data;Volume\nsem;dados', 'x_QN50_ESI30.csv'), /nenhuma linha com data e volume/);
});

test('arquivo em Windows-1252 é lido; rodada gravada e relida dá os mesmos registros', () => {
  const win1252 = Uint8Array.from([...'Data;Volume útil\n30/09/2026;40,1'].map((c) => c.charCodeAt(0)));
  assert.deepEqual(lerCsv(decodificar(win1252), 'QN100_ESI31.csv'), [{ mes: '2026-09', esi: '31', qn: 100, valor: 40.1 }]);

  const registros = lerCsv(decodificar(KIT));
  const csv = csvConsolidado(registros);
  assert.ok(csv.startsWith('﻿data,esi_m3s,qn,volume_util_pct\n2026-09-30,29,QN 100%,40.13716\n'));
  // a rodada sai ordenada por ESI, QN decrescente e mês (o kit grava os QNs em ordem alfabética)
  const chave = (r: { esi: string; qn: number; mes: string }) => `${r.esi}|${r.qn}|${r.mes}`;
  const ordenar = (l: typeof registros) => [...l].sort((a, b) => chave(a).localeCompare(chave(b)));
  assert.deepEqual(ordenar(lerCsv(csv)), ordenar(registros));
  assert.deepEqual(lerCsv(csv).slice(13, 15).map((r) => [r.esi, r.qn, r.mes]), [['29', 70, '2026-09'], ['29', 70, '2026-10']]);
});

// "Simulações Cantareira 16-10-2026.xlsx": planilha única (ESI 29/30/31 × QN 100/70/50, set/26 a set/27)
const PLANILHA = readFileSync(join(import.meta.dirname, 'dados', 'projecao_planilha.xlsx'));

test('data do Excel: número de série → AAAA-MM-DD; fora da faixa ou texto → null', () => {
  assert.equal(dataExcel('46295.125'), '2026-09-30');
  assert.equal(dataExcel('46660'), '2027-09-30');
  assert.equal(dataExcel('37.32'), null);
  assert.equal(dataExcel('2026-09-30'), null);
});

test('planilha .xlsx única: 9 simulações × 13 meses, ESI da célula mesclada acima do cabeçalho', () => {
  const [aba] = lerXlsx(PLANILHA);
  assert.equal(aba!.nome, 'Cantareira');
  assert.equal(sistemaCitado(aba!.linhas, aba!.nome), 'cantareira');
  const r = lerGrade(aba!.linhas, 'planilha.xlsx')!;
  assert.equal(r.length, 9 * 13);
  const v = (esi: string, qn: number, mes: string) => r.find((x) => x.esi === esi && x.qn === qn && x.mes === mes)?.valor;
  assert.equal(v('29', 100, '2026-09'), 37.32);
  assert.equal(v('30', 70, '2026-10'), 30.68);
  assert.equal(v('31', 50, '2027-09'), 15);
  assert.deepEqual(graficos('cantareira', r).graficos.map((g) => g.esi), ['29', '30', '31']);
});

test('mesma planilha salva como CSV (datas DD/MM/AAAA, vírgula decimal) e ESI no cabeçalho', () => {
  const csv = 'Cantareira;;;\nESI 29;;ESI 30;\ndata;QN100;QN70;QN100\n30/09/2026;37,32;36,76;37,24\n31/10/2026;33,94;31,03;33,58\n';
  const r = lerCsv(csv, 'simulacoes.csv');
  assert.equal(r.length, 6);
  assert.equal(r.find((x) => x.esi === '30' && x.qn === 100 && x.mes === '2026-10')?.valor, 33.58);
  const noCabecalho = lerGrade([['data', 'ESI29 QN70'], ['2026-09-30', '36,76']], 'x')!;
  assert.deepEqual(noCabecalho, [{ mes: '2026-09', esi: '29', qn: 70, valor: 36.76 }]);
  assert.equal(sistemaCitado([['Simulações Alto Tietê'], ['data', 'QN100']]), 'alto-tiete');
  assert.equal(sistemaCitado([['Simulações'], ['data', 'QN100']]), null);
});

test('planilha sem a linha de ESI: erro claro; tabela sem cabeçalho de QN não é desse formato', () => {
  assert.throws(() => lerGrade([['data', 'QN100'], ['2026-09-30', '37']], 'x.xlsx'), ErroValidacao);
  assert.equal(lerGrade([['data', 'volume'], ['2026-09-30', '37']], 'x'), null);
});

test('período: recorta os meses, sem aviso de meses faltando, e a GDN olha só o recorte', () => {
  const [aba] = lerXlsx(PLANILHA);
  const todos = lerGrade(aba!.linhas, 'planilha.xlsx')!;
  assert.equal(mesesDa(todos).length, 13);
  const r = filtrarPeriodo(todos, '2027-01', '2027-06');
  assert.deepEqual(mesesDa(r), ['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06']);
  const g = graficos('cantareira', r);
  assert.deepEqual(g.avisos.filter((a) => a.includes('sem valor')), []); // qualquer quantidade de meses vale
  assert.equal(g.graficos[0]!.rotulos.length, 6);
  assert.deepEqual(mesesDa(filtrarPeriodo(todos, '', '2026-10')), ['2026-09', '2026-10']);
  assert.equal(filtrarPeriodo(todos, '', '').length, todos.length);
});

test('simulações: cada retirada com os seus QNs; filtro por retirada/QN (vazio = todas)', () => {
  const [aba] = lerXlsx(PLANILHA);
  const todos = lerGrade(aba!.linhas, 'planilha.xlsx')!;
  assert.deepEqual(simulacoesDa(todos), [['29', [100, 70, 50]], ['30', [100, 70, 50]], ['31', [100, 70, 50]]]);
  const r = filtrarSimulacoes(todos, new Set([chaveSimulacao('29', 100), chaveSimulacao('29', 70), chaveSimulacao('31', 50)]));
  assert.deepEqual(simulacoesDa(r), [['29', [100, 70]], ['31', [50]]]);
  assert.deepEqual(graficos('cantareira', r).graficos.map((g) => [g.esi, g.series.map((s) => s.nome)]), [['29', ['QN 100%', 'QN 70%']], ['31', ['QN 50%']]]);
  assert.equal(filtrarSimulacoes(todos, new Set()).length, todos.length);
  // retiradas com QNs diferentes entre si
  const misto = lerGrade([['ESI 29', '', 'ESI 30'], ['data', 'QN100', 'QN80', 'QN60'], ['2026-09-30', '40', '30', '20']], 'x')!;
  assert.deepEqual(simulacoesDa(misto), [['29', [100]], ['30', [80, 60]]]);
});

test('retiradas com volumes copiados: acusa o par e o intervalo; retiradas diferentes não geram aviso', () => {
  const [aba] = lerXlsx(PLANILHA);
  const avisos = retiradasIguais(lerGrade(aba!.linhas, 'planilha.xlsx')!);
  assert.equal(avisos.length, 3);
  assert.match(avisos[0]!, /^ESI 29 e ESI 30 .* de jan\/27 a set\/27 \(9 meses\)/);
  assert.match(avisos[2]!, /^ESI 30 e ESI 31 .* de dez\/26 a set\/27 \(10 meses\)/);
  const tabela = [['ESI 29', '', 'ESI 30', ''], ['data', 'QN100', 'QN70', 'QN100', 'QN70']];
  const diferentes = ['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31'].map((d, i) => [d, `${40 - i}`, `${35 - i}`, `${39 - i}`, `${34 - i}`]);
  assert.deepEqual(retiradasIguais(lerGrade([...tabela, ...diferentes], 'x')!), []);
  // dois meses iguais seguidos ainda não bastam
  const doisIguais = diferentes.map((l, i) => (i >= 2 ? [l[0]!, l[1]!, l[2]!, l[1]!, l[2]!] : l));
  assert.deepEqual(retiradasIguais(lerGrade([...tabela, ...doisIguais], 'x')!), []);
});

test('cada retirada com os seus QNs: séries, cores pela posição e resumo da GDN', () => {
  const tabela = [
    ['Cantareira'],
    ['ESI 29', '', '', '', 'ESI 30'],
    ['data', 'QN100', 'QN70', 'QN50', 'QN90', 'QN60'],
    ...['2026-09-30', '2026-10-31', '2026-11-30'].map((d, i) => [d, `${40 - i}`, `${35 - 2 * i}`, `${33 - 3 * i}`, `${39 - i}`, `${34 - 3 * i}`]),
  ];
  const r = lerGrade(tabela, 'x')!;
  assert.deepEqual(simulacoesDa(r), [['29', [100, 70, 50]], ['30', [90, 60]]]);
  const g = graficos('cantareira', r).graficos;
  assert.deepEqual(g.map((x) => x.series.map((s) => [s.nome, s.cor])), [
    [['QN 100%', '#255C8D'], ['QN 70%', '#E8912D'], ['QN 50%', '#B33A3A']],
    [['QN 90%', '#255C8D'], ['QN 60%', '#E8912D']],
  ]);
  const txt = resumo('cantareira', r);
  assert.match(txt, /ESI 30 m³\/s:\n  QN 90%/);
  assert.deepEqual(retiradasIguais(r), []); // sem QN em comum, nada a comparar
});

test('blocos lado a lado (uma aba por QN), rótulos em células separadas, só números e QN pelo nome da aba', () => {
  // como "Cantareira 70": QN no título, "ESI 29" acima de cada bloco Data | Volume útil
  const qn70 = [
    ['', 'QN 70'],
    ['', '', 'ESI 29', '', '', 'ESI 30'],
    ['', 'Data', 'Volume útil final (%)', '', '', 'Data', 'Volume útil final (%)'],
    ['', '46326.125', '42.51', '', '', '46326.125', '42.37'],
    ['', '46356.125', '39.52', '', '', '46356.125', '39.11'],
  ];
  assert.deepEqual(lerGrade(qn70, 'x', 'Cantareira 70'), [
    { mes: '2026-10', esi: '29', qn: 70, valor: 42.51 },
    { mes: '2026-11', esi: '29', qn: 70, valor: 39.52 },
    { mes: '2026-10', esi: '30', qn: 70, valor: 42.37 },
    { mes: '2026-11', esi: '30', qn: 70, valor: 39.11 },
  ]);
  // como "Cantareira 50": "ESI" | "29" em células separadas, título "0.5", QN pelo nome da aba
  const qn50 = [['', '0.5'], ['', 'ESI', '29', '', '', 'ESI', '30'], ['', 'Data', 'Volume'], ['', '46326.125', '41.71', '', '', '46326.125', '41.57']];
  assert.deepEqual(simulacoesDa(lerGrade(qn50, 'x', 'Cantareira 50')!), [['29', [50]], ['30', [50]]]);
  // como "SIM - 70": só números acima dos blocos
  const so = [['', '', 'QN 70'], ['', '', '29', '', '30'], ['', 'Data', 'Vol', 'Data', 'Vol'], ['', '46295.125', '51.62', '46295.125', '51.54']];
  assert.deepEqual(simulacoesDa(lerGrade(so, 'x', 'SIM - 70')!), [['29', [70]], ['30', [70]]]);
  // como "El Niño": um QN diferente em cada bloco, todos na mesma ESI
  const nino = [['QN: 82%', 'ESI', '31', '', 'QN:79%', 'ESI', '31'], ['', 'Data', 'Volume', '', '', 'Data', 'Volume'], ['', '46326.125', '42.72', '', '', '46326.125', '42.6']];
  assert.deepEqual(simulacoesDa(lerGrade(nino, 'x', 'Cantareira El Niño')!), [['31', [82, 79]]]);
});

test('quantidade de meses livre: menos ou mais datas não gera aviso; só falta de mês entre simulações', () => {
  const curta = lerGrade([['ESI 29'], ['data', 'QN100', 'QN70'], ['2026-10-31', '40', '38'], ['2026-11-30', '39', '36']], 'x')!;
  assert.deepEqual(graficos('cantareira', curta).avisos, []);
  assert.equal(graficos('cantareira', curta).graficos[0]!.rotulos.length, 2);
});
