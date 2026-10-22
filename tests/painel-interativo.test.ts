import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indicadores, limparSvg, VAR } from '../src/lib/hidrologia/painel-interativo';

const p = (data: string, valor: number) => ({ data, valor });

test('Cantareira 21/10/2026: variações em p.p. e capacidade calculada (valores do SSD)', () => {
  const ind = indicadores(
    {
      [VAR.volumePct]: [p('2026-09-21', 40.0), p('2026-10-14', 44.5), p('2026-10-20', 45.7), p('2026-10-21', 45.88408)],
      [VAR.volumeHm3]: [p('2026-10-21', 450.37847)],
    },
    '2026-10-21',
  );
  assert.equal(ind.dataUsada, '2026-10-21');
  assert.equal(ind.volumePct, 45.88);
  assert.equal(ind.var1d, 0.18); // 45,88408 − 45,7
  assert.equal(ind.var7d, 1.38); // 45,88408 − 44,5
  assert.equal(ind.var30d, 5.88);
  assert.equal(ind.capacidadeHm3, 981.6); // 450,37847 ÷ 0,4588408
});

test('sem dado na data pedida: usa o último dia anterior e diz qual', () => {
  const ind = indicadores({ [VAR.volumePct]: [p('2026-10-19', 50), p('2026-10-20', 51)] }, '2026-10-21');
  assert.equal(ind.dataUsada, '2026-10-20');
  assert.equal(ind.volumePct, 51);
  assert.equal(ind.var1d, 1);
  assert.equal(ind.var7d, null); // não há o dia 13/10
});

test('chuva: do dia, do mês (só o mês da data) e dos últimos 30 dias', () => {
  const chuva = [p('2026-09-21', 10), p('2026-09-30', 5), p('2026-10-02', 3.2), p('2026-10-21', 1.1), p('2026-10-22', 99)];
  const ind = indicadores({ [VAR.volumePct]: [p('2026-10-21', 40)], [VAR.chuva]: chuva }, '2026-10-21');
  assert.equal(ind.chuvaDia, 1.1);
  assert.equal(ind.chuvaMes, 4.3);
  assert.equal(ind.chuva30d, 9.3); // 22/09 a 21/10 (21/09 fica de fora; 22/10 é depois da data)
});

test('sem série de volume: tudo indisponível, sem inventar valor', () => {
  const ind = indicadores({}, '2026-10-21');
  assert.equal(ind.dataUsada, null);
  assert.equal(ind.volumePct, null);
  assert.equal(ind.capacidadeHm3, null);
  assert.equal(ind.var1d, null);
  assert.equal(ind.chuvaMes, null);
});

test('limparSvg tira scripts, eventos e links externos, e mantém imagens em data:', () => {
  const svg =
    '<?xml version="1.0"?><svg onload="x()"><script>alert(1)</script><rect onclick="y()" class="st0"/>' +
    '<a xlink:href="https://mal.example/">a</a><image xlink:href="data:image/png;base64,AAA"/><foreignObject><div/></foreignObject></svg>';
  const limpo = limparSvg(svg);
  assert.doesNotMatch(limpo, /script|onload|onclick|mal\.example|foreignObject|<\?xml/);
  assert.match(limpo, /data:image\/png;base64,AAA/);
  assert.match(limpo, /class="st0"/);
});
