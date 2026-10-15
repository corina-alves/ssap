import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ErroValidacao } from '../src/lib/graficos-tabela';
import { csvConsolidado, data, decodificar, formatarEsi, graficos, lerCsv, limiteFaixa, listaNumeros, numero, resumo, retomadas } from '../src/lib/hidrologia/projecoes';

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
  assert.deepEqual(listaNumeros('29, 30, 31', false), ['29', '30', '31']);
  assert.deepEqual(listaNumeros('29,5; 30; 30', false), ['29.5', '30']);
  assert.deepEqual(listaNumeros('100,70,50', true), ['100', '70', '50']);
  assert.deepEqual(listaNumeros('abc 0 1000', true), []);
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

test('retomadas no mesmo mês viram um bloco só; série curta gera aviso', () => {
  const linhas = ['data;esi;qn;volume', '30/11/2026;29;70;29', '31/12/2026;29;70;40', '30/11/2026;29;50;25'];
  const { graficos: gs, avisos } = graficos('sim', lerCsv(linhas.join('\n')));
  assert.deepEqual(gs[0]!.marcas, [{ de: 0, ate: 1, texto: 'Retomada da GDN: dez/26', cenarios: '(QN 70% e QN 50%)' }]);
  assert.deepEqual(avisos, ['ESI 29 / QN 70%: 2 meses (o kit espera 13).', 'ESI 29 / QN 50%: 1 meses (o kit espera 13).']);
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
