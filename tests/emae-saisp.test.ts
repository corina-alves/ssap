import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diaOperacional, instanteDaPosicao, lerTabelaCanal, linhaPreenchida, linhasDoDia, slotsHorarios } from '../src/lib/integracoes/emae-saisp';

// Página do processo.jsp do SAISP, resumida: cada valor numa tabela aninhada, célula sem dado só com ícone.
const valor = (v: string) =>
  `<td bgcolor=""><table class="preta8" align="center"><tr><td width="80%" align="right"><font size="2" face="Verdana">${v}</font></td><td><img alt="Est&aacute;vel" src="/estaticos/icones/estavel.gif"></td></tr></table></td>`;
const semDado = `<td bgcolor=""><table class="preta8"><tr align="left" colspan="2"><td><div align="center"><img alt="N&atilde;o h&aacute; varia&ccedil;&atilde;o" src="naotemdado.gif"></div></td></tr></table></td>`;
const cabecalho = (nomes: string[]) =>
  `<tr bgcolor="#e7e7e7"><td align="center"><strong>Data</strong></td>${nomes.map((n) => `<td align="center"><font face="Verdana" size="2"><strong>${n}</strong></font></td>`).join('')}</tr>`;
const linha = (quando: string, celulas: string[]) =>
  `<tr class="ln" onmouseout="javascript:this.setAttribute('bgColor','#ffffff');"><td align="center">${quando}</td>${celulas.join('')}</tr>`;
const pagina = (nomes: string[], linhas: string[]) =>
  `<html><body><table><tr><td><strong>Data</strong></td><td>outra tabela</td></tr></table>
<table id="tbDadosTelem"><thead>${cabecalho(nomes)}</thead><tbody id="tbTelemBody">
<tr><td colspan="6">&nbsp;<strong>Pedreira - </strong></td></tr>${linhas.join('\n')}</tbody></table></body></html>`;

test('lerTabelaCanal: tabelas aninhadas, colunas repetidas (#2) e células sem dado', () => {
  const html = pagina(
    ['FLU(m) - EPUSP', 'FLU(m) - EPUSP', 'Vaz. Descarg(m3/s)', 'Vaz. Bombeada(m3/s)'],
    [linha('11 NOV 2026 08:00', [valor('744.95'), valor('719.70'), semDado, valor('12.5')]), linha('11 NOV 2026 07:00', [valor('744.94'), valor('719,68'), valor('3'), semDado])],
  );
  const t = lerTabelaCanal(html);
  assert.deepEqual([...t.keys()], ['2026-11-11 08:00', '2026-11-11 07:00']);
  assert.deepEqual(t.get('2026-11-11 08:00'), { 'flu(m)-epusp': 744.95, 'flu(m)-epusp#2': 719.7, 'vaz.bombeada(m3/s)': 12.5 });
  assert.deepEqual(t.get('2026-11-11 07:00'), { 'flu(m)-epusp': 744.94, 'flu(m)-epusp#2': 719.68, 'vaz.descarg(m3/s)': 3 });
  assert.equal(lerTabelaCanal('<html>sem tabela</html>').size, 0);
});

test('linhasDoDia: layout da planilha da EMAE, hora só com a rede observada, bombeamento negativo', () => {
  const series = new Map<number, Map<string, Record<string, number>>>([
    // Pedreira (rede observada, produto 70): bombeando às 07h
    [217, new Map([['2026-11-11 07:00', { 'flu(m)-epusp': 744.94, 'flu(m)-epusp#2': 719.7, 'vaz.bombeada(m3/s)': 12 }]])],
    // Rasgão (telemétrica): tem 07h e 08h, mas 08h ainda não tem a rede observada
    [
      559,
      new Map([
        ['2026-11-11 07:00', { 'flu(m)-epusp': 661.26, 'q(m3/s)': 100 }],
        ['2026-11-11 08:00', { 'flu(m)-epusp': 661.27, 'q(m3/s)': 100 }],
      ]),
    ],
  ]);
  const { linhas, ultimo } = linhasDoDia(series, '2026-11-11');
  assert.equal(linhas.length, 2 + 25);
  assert.deepEqual(linhas[0]!.slice(0, 2), ['h', 'PEDREIRA']);
  const l07 = linhas[2]!;
  assert.equal(l07[0], '7');
  assert.equal(l07[1], '744.94'); // B  Billings
  assert.equal(l07[2], '719.7'); // C  Pedreira CPS
  assert.equal(l07[3], '-12'); // D  bombeando: negativo
  assert.equal(l07[16], '661.26'); // Q  Rasgão
  assert.equal(l07[17], '100'); // R
  assert.equal(l07[20], ''); // U  Guarapiranga sem leitura
  assert.deepEqual(linhas[3], ['8']); // sem a rede observada, a hora fica em branco
  assert.equal(linhas[19]![0], '24');
  assert.equal(linhas[26]![0], '7'); // 07h do dia seguinte
  assert.equal(ultimo, Date.parse('2026-11-11T07:00:00Z')); // instante local
  const slots = slotsHorarios(linhas);
  assert.equal(slots.length, 25);
  assert.deepEqual(slots.map(linhaPreenchida).lastIndexOf(true), 0);
});

test('dia operacional (07h → 07h) e instante de cada posição', () => {
  assert.equal(diaOperacional(Date.parse('2026-11-11T09:59:00Z')), '2026-11-10'); // 06h59 em Brasília
  assert.equal(diaOperacional(Date.parse('2026-11-11T10:00:00Z')), '2026-11-11'); // 07h00
  assert.equal(diaOperacional(Date.parse('2026-11-12T02:30:00Z')), '2026-11-11'); // 23h30
  assert.equal(instanteDaPosicao('11/11/2026', 0), Date.parse('2026-11-11T10:00:00Z'));
  assert.equal(instanteDaPosicao('11/11/2026', 24), Date.parse('2026-11-12T10:00:00Z'));
  assert.ok(Number.isNaN(instanteDaPosicao('31/02/2026', 0)));
});
