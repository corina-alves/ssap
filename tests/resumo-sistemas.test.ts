import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mesmoDiaAnoAnterior, montarLinhas, textoAnalise, type ResumoSistemas } from '../src/lib/hidrologia/resumo-sistemas';
import { SISTEMAS, type SistemaSabesp } from '../src/lib/integracoes/sabesp';

const sist = (id: number, volumePct: number | null): SistemaSabesp => ({
  id,
  nome: SISTEMAS[id]!,
  data: '2026-11-17',
  volumePct,
  volumeHm3: null,
  variacaoVolume: null,
  chuvaDia: null,
  chuvaMes: null,
  chuvaMediaHistorica: null,
  vazaoNatural: null,
  vazaoNaturalMes: null,
  vazaoNaturalMediaHistorica: null,
  vazaoProduzida: null,
  vazaoCaptada: null,
  vazaoJusante: null,
  vazaoAfluente: null,
});

// volumes por id: SIM, Cantareira, Alto Tietê, Guarapiranga, Cotia, Rio Grande, São Lourenço, Rio Claro
const dia = (v: Record<number, number | null>) => Object.entries(v).map(([id, p]) => sist(Number(id), p));
const HOJE = dia({ 69: 70, 72: 55, 68: 80, 67: 35, 66: 50, 65: 45, 64: 40, 75: 48 });
const ONTEM = dia({ 75: 48.1, 64: 40.2, 65: 45, 66: 49.9, 67: 35.3, 68: 79.8, 72: 55, 69: 70.1 });
const ANO = dia({ 75: 52, 64: 30, 65: 50, 66: 51, 67: 45, 68: 78, 72: 60, 69: 69 });

test('linhas na ordem da referência, SIM primeiro e por extenso', () => {
  const l = montarLinhas(HOJE, ONTEM, ANO, { hoje: null, ontem: null, ano: null });
  assert.deepEqual(
    l.map((s) => s.curto),
    ['SIM', 'Cantareira', 'Alto Tietê', 'Guarapiranga', 'Cotia', 'Rio Grande', 'São Lourenço', 'Rio Claro'],
  );
  assert.equal(l[0]!.nome, 'Sistema Integrado Metropolitano (SIM)');
  assert.equal(l.find((s) => s.curto === 'Cotia')!.estagio.codigo, 'E2');
});

test('sem ANA: tudo SABESP × SABESP, diferenças com uma casa', () => {
  const c = montarLinhas(HOJE, ONTEM, ANO, { hoje: null, ontem: null, ano: null }).find((s) => s.id === 64)!;
  assert.equal(c.volume, 40);
  assert.equal(c.fonteVolume, 'SABESP');
  assert.equal(c.difDia, -0.2);
  assert.equal(c.difAno, 10);
});

test('Cantareira com ANA nas três datas: volume e diferenças ANA × ANA', () => {
  const c = montarLinhas(HOJE, ONTEM, ANO, { hoje: 41.37, ontem: 41.1, ano: 33.05 }).find((s) => s.id === 64)!;
  assert.equal(c.volume, 41.37);
  assert.deepEqual([c.fonteVolume, c.fonteDifDia, c.fonteDifAno], ['ANA', 'ANA', 'ANA']);
  assert.equal(c.difDia, 0.3);
  assert.equal(c.difAno, 8.3);
  assert.equal(c.volumeAnoAnterior, 33.05);
});

test('Cantareira com ANA só hoje: volume da ANA, diferenças SABESP × SABESP (nunca misturadas)', () => {
  const c = montarLinhas(HOJE, ONTEM, ANO, { hoje: 41.37, ontem: null, ano: null }).find((s) => s.id === 64)!;
  assert.equal(c.volume, 41.37);
  assert.deepEqual([c.fonteVolume, c.fonteDifDia, c.fonteDifAno], ['ANA', 'SABESP', 'SABESP']);
  assert.equal(c.difDia, -0.2); // 40 − 40,2, não 41,37 − 40,2
  assert.equal(c.difAno, 10); // 40 − 30
  assert.equal(c.volumeAnoAnterior, 30);
});

test('sistema sem volume hoje fica de fora; sem o dia anterior, diferença nula', () => {
  const l = montarLinhas(dia({ 75: 48, 64: 40, 67: null }), null, null, { hoje: null, ontem: null, ano: null });
  assert.deepEqual(
    l.map((s) => s.id),
    [75, 64],
  );
  assert.equal(l[0]!.difDia, null);
  assert.equal(l[0]!.difAno, null);
});

test('mesmo dia do ano anterior, com 29/02 → 28/02', () => {
  assert.equal(mesmoDiaAnoAnterior('2026-11-17'), '2025-11-17');
  assert.equal(mesmoDiaAnoAnterior('2028-02-29'), '2027-02-28');
});

const resumo = (linhas = montarLinhas(HOJE, ONTEM, ANO, { hoje: null, ontem: null, ano: null })): ResumoSistemas => ({
  data: '2026-11-17',
  dataOntem: '2026-11-16',
  dataAnoAnterior: '2025-11-17',
  anoComparacao: 2025,
  linhas,
});

test('texto: lista com estágio e variação do dia, legenda e comparação com o ano anterior', () => {
  const t = textoAnalise(resumo());
  assert.match(t, /_Volume útil \(%\) em 17\/11\/2026_/);
  assert.match(t, /🟡 \*Sistema Integrado Metropolitano \(SIM\)\*: 48,00% ⬇️ \(-0,1\)/);
  assert.match(t, /🟠 \*Cotia\*: 35,00% ⬇️ \(-0,3\)/);
  assert.match(t, /🟡 \*Guarapiranga\*: 50,00% ⬆️ \(\+0,1\)/);
  assert.match(t, /🟡 \*Alto Tietê\*: 45,00% ➡️ \(0,0\)/);
  assert.match(t, /🟣 E4 - Emergência/);
  assert.match(t, /📝 \*Comparação com o ano de 2025\*/);
  assert.match(t, /⬇️ O \*SIM\* apresenta redução de \*4,0 p\.p\.\* em relação a 2025\./);
});

test('texto: duas maiores reduções e dois maiores ganhos, sem o SIM no ranking', () => {
  const t = textoAnalise(resumo());
  // reduções: Cotia −10, São Lourenço −5, Alto Tietê −5 (empate: a primeira na ordem fica)
  assert.match(t, /⬇️ \*Cotia\*: maior redução em relação ao ano de 2025 \(-10,0 p\.p\.\)/);
  assert.match(t, /⬇️ \*Alto Tietê\*: segunda maior redução/);
  // ganhos: Cantareira +10, Rio Grande +2
  assert.match(t, /⬆️ \*Cantareira\*: maior ganho em relação ao ano de 2025 \(\+10,0 p\.p\.\)/);
  assert.match(t, /⬆️ \*Rio Grande\*: segundo maior ganho/);
  assert.doesNotMatch(t, /\*Sistema Integrado Metropolitano \(SIM\)\*: (maior|segund)/);
});

test('texto: sem dados do ano anterior, diz que não há comparação', () => {
  const t = textoAnalise(resumo(montarLinhas(HOJE, ONTEM, null, { hoje: null, ontem: null, ano: null })));
  assert.match(t, /Sem dados de 2025 para comparar\.$/);
  assert.doesNotMatch(t, /Maiores/);
});
