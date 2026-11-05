import assert from 'node:assert/strict';
import { test } from 'node:test';
import limites from '../src/conteudo/ugrhi.json';
import { classificadorUgrhi, distanciaKm, montarGrade, thiessen, type Limites } from '../src/lib/climatologia/espacial';
import { climatologia, diasDoMes, estatistica, juntarRepetidos, resumir, tipoMedia, validade, valorDia, type PontoSerie } from '../src/lib/climatologia/regras';

const L = limites as unknown as Limites;

test('acervo: "-" e texto viram falta (nunca zero); só os dias que o mês tem', () => {
  assert.equal(valorDia('12.3'), 12.3);
  assert.equal(valorDia('0.0'), 0);
  assert.equal(valorDia('-'), null);
  assert.equal(valorDia(''), null);
  assert.equal(valorDia('-3'), null);
  const fev = diasDoMes(2023, 2, [...Array(28).fill('1.0'), '-', '-', '-']);
  assert.equal(fev.dias.length, 28); // o acervo manda 31 posições; fevereiro tem 28 dias
  assert.equal(fev.semDia1, false);
  assert.equal(diasDoMes(2024, 2, Array(29).fill('0.0')).dias.length, 29);
  const curto = diasDoMes(2023, 4, ['1.0', '2.0']); // vetor curto: o resto é falta
  assert.equal(curto.dias.length, 30);
  assert.equal(curto.dias.filter((d) => d === null).length, 28);
});

test('acervo com um valor a menos que os dias do mês: são os dias 2 a n, sem o dia 1', () => {
  const fev = diasDoMes(2023, 2, ['5.0', ...Array(26).fill('0.0')]); // 27 valores para 28 dias
  assert.equal(fev.semDia1, true);
  assert.equal(fev.dias.length, 28);
  assert.equal(fev.dias[0], null);
  assert.equal(fev.dias[1], 5);
  assert.equal(diasDoMes(2024, 2, Array(28).fill('0.0')).semDia1, true); // bissexto: 28 valores para 29 dias
  assert.equal(diasDoMes(2023, 1, Array(30).fill('0.0')).semDia1, true);
  // o dia 1 não está em leitura nenhuma: o mês não vale em nenhum critério
  assert.deepEqual(validade({ dias: fev.dias, conflito: false, semDia1: true }, false), { padrao: false, estrito: false });
  // a mesma falta no dia 1 sem a marca (falha comum seguida de leitura que acumula) vale no padrão
  assert.deepEqual(validade({ dias: fev.dias, conflito: false }, false), { padrao: true, estrito: false });
});

test('resumo do mês: total só dos dias lidos, faltas, maior sequência e falta no fim', () => {
  const r = resumir([1, null, null, 30.5, 0, null]);
  assert.deepEqual(r, { total: 31.5, diasFaltando: 3, maiorFalta: 2, faltaNoFim: true });
  assert.equal(resumir([null, null]).total, null);
});

test('mês repetido na fonte: igual vale um; diferente é conflito', () => {
  assert.equal(juntarRepetidos([1, 2], [1, 2]).conflito, false);
  assert.equal(juntarRepetidos([1, 2], [1, 3]).conflito, true);
});

test('validade: estrito exige todos os dias; padrão aceita acúmulo dentro do mês', () => {
  const completo = Array(30).fill(0);
  assert.deepEqual(validade({ dias: completo, conflito: false }, false), { padrao: true, estrito: true });
  // dois dias sem leitura seguidos de uma leitura (acúmulo): padrão aceita, estrito não
  const acumulo = [...Array(10).fill(0), null, null, 25, ...Array(17).fill(0)];
  assert.deepEqual(validade({ dias: acumulo, conflito: false }, false), { padrao: true, estrito: false });
  // falta no fim do mês: a chuva pode ter ido para o mês seguinte
  assert.deepEqual(validade({ dias: [...Array(29).fill(0), null], conflito: false }, false), { padrao: false, estrito: false });
  // mais de 10 dias sem leitura
  assert.deepEqual(validade({ dias: [...Array(11).fill(null), ...Array(19).fill(1)], conflito: false }, false), { padrao: false, estrito: false });
  // mês anterior terminou sem leitura: a primeira leitura pode carregar chuva dele
  assert.deepEqual(validade({ dias: completo, conflito: false }, true), { padrao: false, estrito: false });
  // conflito na fonte
  assert.deepEqual(validade({ dias: completo, conflito: true }, false), { padrao: false, estrito: false });
});

test('tipo da média: normal com 80% dos anos (24 de 30), média histórica com 10 ou mais, senão insuficiente', () => {
  assert.equal(tipoMedia(24, [1991, 2020]), 'normal');
  assert.equal(tipoMedia(23, [1991, 2020]), 'media_historica');
  assert.equal(tipoMedia(10, [1991, 2020]), 'media_historica');
  assert.equal(tipoMedia(9, [1991, 2020]), 'insuficiente');
  // período com menos de 30 anos (2010 até hoje) nunca é normal, mesmo com todos os anos
  assert.equal(tipoMedia(14, [2010, 2023]), 'media_historica');
  assert.equal(tipoMedia(17, [2010, 2026]), 'media_historica');
  assert.equal(tipoMedia(9, [2010, 2026]), 'insuficiente');
});

test('estatística: média, mediana, desvio amostral e extremos com o ano', () => {
  const e = estatistica([10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v, i) => ({ ano: 2000 + i, valor: v })), [1991, 2020]);
  assert.equal(e.tipo, 'media_historica');
  assert.equal(e.media, 55);
  assert.equal(e.mediana, 55);
  assert.equal(e.desvio, 30.3); // desvio amostral de 10..100
  assert.deepEqual([e.minimo, e.anoMinimo, e.maximo, e.anoMaximo], [10, 2000, 100, 2009]);
});

test('climatologia: média mensal só dos anos válidos; anual = soma das 12 médias', () => {
  const serie: PontoSerie[] = [];
  for (let ano = 1991; ano <= 2020; ano++) {
    for (let mes = 1; mes <= 12; mes++) serie.push({ ano, mes, chuva: mes * 10 + (ano % 2), valido: !(mes === 1 && ano <= 1997) }); // jan inválido em 7 anos
  }
  serie.push({ ano: 1990, mes: 3, chuva: 9999, valido: true }); // fora do período: não entra
  const c = climatologia(serie, [1991, 2020]);
  assert.equal(c[1]!.tipo, 'media_historica'); // janeiro: 23 anos válidos
  assert.equal(c[1]!.anosValidos, 23);
  assert.equal(c[3]!.tipo, 'normal');
  assert.equal(c[3]!.media, 30.5); // 30 + média de (ano % 2) = 0,5
  assert.equal(c[0]!.tipo, 'media_historica'); // um mês não é normal → o ano também não
  assert.equal(c[0]!.media, Math.round(c.slice(1).reduce((s, m) => s + m.media!, 0) * 10) / 10);
  assert.equal(c[0]!.anosValidos, 23); // anos com os 12 meses válidos
});

test('UGRHI pelo polígono oficial', () => {
  const ugrhi = classificadorUgrhi(L);
  assert.equal(ugrhi(-46.6333, -23.5505), 6); // Sé, São Paulo: Alto Tietê
  assert.equal(ugrhi(-47.9292, -24.7108), 11); // Registro: Ribeira de Iguape
  assert.equal(ugrhi(-51.3889, -22.1256), 22); // Presidente Prudente: Pontal do Paranapanema
  assert.equal(ugrhi(-43.2, -22.9), null); // Rio de Janeiro: fora de SP
  assert.ok(Math.abs(distanciaKm(-23.5, -46.6, -23.5, -46.5) - 10.2) < 0.2);
});

test('Thiessen na grade: pesos somam 1, posto inválido sai, cobertura cai com a distância', () => {
  // dois postos dentro da UGRHI 3 (Litoral Norte) e um longe
  const postos = [
    { id: 1, lat: -23.62, lon: -45.41, ugrhi: 3 }, // Caraguatatuba
    { id: 2, lat: -23.81, lon: -45.4, ugrhi: 3 }, // São Sebastião
    { id: 3, lat: -21.0, lon: -50.0, ugrhi: 19 },
  ];
  const u = montarGrade(L, postos).get(3)!;
  assert.ok(u.n > 300); // ~1.950 km² em células de ~4,5 km²
  const t = thiessen(u, Float64Array.from([100, 200, NaN]));
  const soma = [...t.pesos.values()].reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(soma - 1) < 1e-9);
  assert.ok(t.chuva! > 100 && t.chuva! < 200);
  // só um posto válido: tudo dele
  const so1 = thiessen(u, Float64Array.from([100, NaN, NaN]));
  assert.equal(so1.chuva, 100);
  assert.ok(so1.cobertura < t.cobertura); // com menos postos, menos área perto de um posto
  // nenhum válido
  assert.equal(thiessen(u, Float64Array.from([NaN, NaN, NaN])).chuva, null);
});

test('comparação: observado só com todos os meses válidos; climatologia do MESMO intervalo', async () => {
  const { anoAtual, comparar, lerSelecao, parametros, periodosReferencia, rotuloAnos, rotuloReferencia, faixaDesvio } = await import('../src/lib/climatologia/selecao');
  // anos da média histórica: seguidos viram intervalo
  assert.equal(rotuloAnos([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2025]), '10 anos: 2015–2023, 2025');
  assert.equal(rotuloAnos([2026]), '1 ano: 2026');
  assert.equal(rotuloAnos([]), 'sem anos com dado');
  const est = (media: number, tipo: 'normal' | 'media_historica' = 'normal') => ({ tipo, media, anosValidos: tipo === 'normal' ? 30 : 15, anos: [], mediana: null, desvio: null, minimo: null, anoMinimo: null, maximo: null, anoMaximo: null });
  const clima = new Map([[1, [est(1200), ...Array.from({ length: 12 }, () => est(100))]]]);
  clima.get(1)![3] = est(100, 'media_historica');
  const serie: import('../src/lib/climatologia/selecao').PontoMes[] = [1, 2, 3].map((mes) => ({ ugrhi: 1, ano: 2015, mes, chuva: 50, valido: mes !== 2 || false, postos: 4, cobertura: 90 }));
  serie[1]!.valido = true;
  const [mes] = comparar(serie, clima, 2015, 1, 'mes');
  assert.deepEqual([mes!.observado, mes!.climatologia, mes!.percentual, mes!.desvio, mes!.desvioMm, mes!.tipo], [50, 100, 50, -50, -50, 'normal']);
  // jan–mar: soma das 3 médias (não a média anual), e o pior tipo entre os meses
  const [ytd] = comparar(serie, clima, 2015, 3, 'ytd');
  assert.deepEqual([ytd!.observado, ytd!.climatologia, ytd!.tipo], [150, 300, 'media_historica']);
  assert.equal(ytd!.coberturaBaixa, false);
  // um mês com cobertura abaixo do mínimo: entra no observado, marcado
  serie[1]!.valido = false;
  const baixa = comparar(serie, clima, 2015, 3, 'ytd')[0]!;
  assert.deepEqual([baixa.observado, baixa.coberturaBaixa], [150, true]);
  // um mês sem chuva (nenhum posto com o mês válido): sem observado (nunca soma parcial)
  serie[1]!.chuva = null;
  assert.equal(comparar(serie, clima, 2015, 3, 'ytd')[0]!.observado, null);
  // mês em andamento: o intervalo leva o último dia encerrado
  serie[1]!.chuva = 50;
  serie[2]!.ateDia = 3;
  assert.equal(comparar(serie, clima, 2015, 3, 'ytd')[0]!.ateDia, 3);
  // ano: abril–dezembro sem série → sem observado
  assert.equal(comparar(serie, clima, 2015, 12, 'ano')[0]!.observado, null);
  // filtros inválidos voltam ao padrão
  const s = lerSelecao({ u: '99', crit: 'x', met: 'y', acum: 'z', ref: '1900-1910' });
  assert.deepEqual([s.ugrhi, s.criterio, s.metodo, s.acumulado, s.referencia], [6, 'padrao', 'aritmetica', 'mes', '1991-2020']);
  assert.match(parametros(s, { ugrhi: 3, ano: 2015 }), /^u=3&acum=mes&ref=1991-2020&crit=padrao&met=aritmetica&ano=2015$/);
  // período recente: de 2010 até o ano corrente
  const r = lerSelecao({ ref: '2010-atual' });
  assert.deepEqual([r.referencia, r.periodo], ['2010-atual', [2010, anoAtual()]]);
  assert.equal(rotuloReferencia('2010-atual', [2010, 2026]), '2010–2026 (2010 até hoje)');
  assert.deepEqual(Object.keys(periodosReferencia()), ['1991-2020', '2010-atual', '1981-2010', '1961-1990']);
  assert.equal(faixaDesvio(-35), 'muito abaixo da média');
  assert.equal(faixaDesvio(5), 'próximo da média');
});

test('exportação: CSV para o Excel em português e .xlsx válido (ZIP com a planilha)', async () => {
  const { csv, planilha } = await import('../src/lib/climatologia/xlsx');
  assert.equal(csv([['UGRHI', 'Chuva'], [1, 1706.1], ['a;b', null]]), '﻿UGRHI;Chuva\r\n1;1706,1\r\n"a;b";\r\n');
  const x = planilha('teste', [['A', 'B'], [1, 'é <&>']]);
  assert.deepEqual([...x.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]); // assinatura ZIP
  const texto = Buffer.from(x).toString('latin1');
  assert.ok(texto.includes('xl/worksheets/sheet1.xml'));
  assert.ok(Buffer.from(x).toString('utf8').includes('é &lt;&amp;&gt;'));
});
