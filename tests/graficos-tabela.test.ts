import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comCores, ErroValidacao, lerTabela, paraChart, slug, tabelaDe } from '../src/lib/graficos-tabela';

test('lê tabela com ponto e vírgula, vírgula decimal, milhar e célula vazia', () => {
  const { rotulos, series } = lerTabela('Mês;2025;2026\nJan;250,4;1.190,2\nFev;210;\nMar;-;3.5');
  assert.deepEqual(rotulos, ['Jan', 'Fev', 'Mar']);
  assert.deepEqual(series, [
    { nome: '2025', valores: [250.4, 210, null] },
    { nome: '2026', valores: [1190.2, null, 3.5] },
  ]);
});

test('aceita tabulação (colado da planilha) e nomeia série sem título', () => {
  const { series } = lerTabela('Mês\t\tB\nJan\t1\t2');
  assert.deepEqual(series.map((s) => s.nome), ['Série 1', 'B']);
});

test('recusa tabela curta, séries demais e valor inválido (com o número da linha)', () => {
  assert.throws(() => lerTabela('Mês;2025'), /cabeçalho e ao menos uma linha/);
  assert.throws(() => lerTabela('R;1;2;3;4;5;6;7;8;9\nJan;1;1;1;1;1;1;1;1;1'), /de 1 a 8 séries/);
  assert.throws(
    () => lerTabela('Mês;2025\nJan;10\nFev;abc'),
    (e) => e instanceof ErroValidacao && e.erros[0] === 'Dados: valor inválido "abc" na linha 3.',
  );
});

test('tabela → texto → tabela dá o mesmo resultado', () => {
  const g = { rotulos: ['Jan', 'Fev'], series: [{ nome: 'Chuva; mm', valores: [10.5, null] }, { nome: 'MLT', valores: [8, 9.25] }] };
  const texto = tabelaDe(g);
  assert.equal(texto, 'Rótulo;Chuva, mm;MLT\nJan;10,5;8\nFev;;9,25');
  assert.deepEqual(lerTabela(texto).series.map((s) => s.valores), [[10.5, null], [8, 9.25]]);
});

test('cores fixas só entram se forem #rrggbb e de uma série existente', () => {
  const series = [{ nome: 'A', valores: [1] }, { nome: 'B', valores: [2] }];
  assert.deepEqual(comCores(series, { A: '#1f5c99', B: 'vermelho', C: '#000000' }), [{ nome: 'A', valores: [1], cor: '#1f5c99' }, { nome: 'B', valores: [2] }]);
  const c = paraChart({ tipo: 'barra', titulo: 'T', fonte: null, config: null });
  assert.deepEqual([c.rotulos, c.series, c.empilhado], [[], [], false]);
});

test('slug sem acento, minúsculo e nunca vazio', () => {
  assert.equal(slug('Vazão × MLT — 2026'), 'vazao-mlt-2026');
  assert.equal(slug('———'), 'grafico');
  assert.ok(slug('a'.repeat(300)).length <= 100);
});
