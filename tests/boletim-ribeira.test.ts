import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESTACOES_RIBEIRA } from '../src/conteudo/boletim-ribeira';
import {
  diagnostico,
  inicioDaSituacao,
  montarPonto,
  saidaDoExtravasamento,
  serieDoPosto,
  sintese,
  sinteseResumo,
  tendencia,
  textoSintese,
  textoVolumeCopel,
  type Leitura,
  type PontoRibeira,
} from '../src/lib/boletins-sala/boletim-ribeira-regras';
import { gerarPdf, limpar } from '../src/lib/boletins-sala/boletim-ribeira-pdf';
import { referencias } from '../src/lib/boletins-sala/sumario-automatico-tp';
import type { Cotas } from '../src/lib/integracoes/sibh-medicoes';

const cotas = { atencao: 2, alerta: 3, emergencia: 4, extravasamento: 5 };
/** Instante de "HH:MM" (Brasília) em 28/10/2026; "-1 HH:MM" = dia anterior. */
const t = (h: string) => {
  const [d, hm] = h.startsWith('-1 ') ? ['27', h.slice(3)] : ['28', h];
  return Date.parse(`2026-10-${d}T${hm}:00-03:00`);
};
const serie = (pares: [string, number][]): Leitura[] => pares.map(([h, nivel]) => ({ em: t(h), nivel, vazao: null }));
const T07 = t('07:00');
const AGORA = t('15:50');
const [RIBEIRA, , , , SETE_BARRAS, , REGISTRO, PARIQUERA] = ESTACOES_RIBEIRA;

const ponto = (e = SETE_BARRAS!, s: [string, number][], c: Cotas | null = cotas, guardado: { nivel: number; em: number | null } | null = null) =>
  montarPonto(e, serie(s), c, T07, AGORA, guardado);

test('tendência pelo valor arredondado a 2 casas (0,00 = estável)', () => {
  assert.equal(tendencia(0.004), 'estavel');
  assert.equal(tendencia(-0.004), 'estavel');
  assert.equal(tendencia(0.006), 'subida');
  assert.equal(tendencia(-0.01), 'queda');
  assert.equal(tendencia(null), null);
});

test('série do SIBH: cm → m, em ordem de tempo, só do posto pedido', () => {
  const s = serieDoPosto(
    [
      ['29726', '2026/10/28 18:50', 318.2, null],
      ['29726', '2026/10/28 18:40', 317.9, null],
      ['1176', '2026/10/28 18:50', 468.8, null],
      ['29726', '2026/10/28 18:30', null, null],
    ],
    29726,
  );
  assert.deepEqual(
    s.map((l) => l.nivel),
    [3.179, 3.182],
  );
  assert.equal(s[1]!.em, Date.parse('2026-10-28T18:50:00Z'));
});

test('ponto: 07h dentro de 30 min, leitura atual, situação, acima da cota e tendência', () => {
  const p = ponto(SETE_BARRAS, [
    ['06:20', 4.5],
    ['07:20', 4.6],
    ['15:40', 5.2],
    ['15:50', 5.25],
  ]);
  assert.equal(p.nivel07, 4.6); // 07h20 é a mais próxima das 07h dentro da tolerância
  assert.equal(p.atual, 5.25);
  assert.equal(p.situacao, 'EXTRAVASAMENTO');
  assert.equal(p.acima, 0.25);
  assert.equal(p.variacao, 0.65);
  assert.equal(p.tendencia, 'subida');
  assert.equal(p.atrasado, false);
  assert.deepEqual(p.desde, { em: t('15:40') });

  // sem leitura até 30 min das 07h: usa a guardada no banco, nunca outra hora
  const sem07 = ponto(SETE_BARRAS, [['07:40', 2.1], ['15:50', 2.0]]);
  assert.equal(sem07.nivel07, null);
  assert.equal(sem07.tendencia, null);
  const guardado = ponto(SETE_BARRAS, [['07:40', 2.1], ['15:50', 2.0]], cotas, { nivel: 2.2, em: T07 });
  assert.equal(guardado.nivel07, 2.2);
  assert.equal(guardado.variacao, -0.2);
  assert.equal(guardado.situacao, 'ATENÇÃO'); // a cota entra na faixa
});

test('ponto: sem leitura em 12 h, leitura atrasada e posto sem cotas', () => {
  const velho = ponto(SETE_BARRAS, [['-1 22:00', 1]]);
  assert.equal(velho.semDado, true);
  assert.equal(velho.atual, null);
  const atrasado = ponto(SETE_BARRAS, [['07:00', 1], ['13:00', 1.1]]);
  assert.equal(atrasado.atrasado, true);
  const semCotas = ponto(SETE_BARRAS, [['07:00', 9], ['15:50', 9]], { atencao: null, alerta: null, emergencia: null, extravasamento: null });
  assert.equal(semCotas.semCotas, true);
});

test('desde quando em extravasamento e saída do extravasamento nas últimas 24 h', () => {
  assert.deepEqual(inicioDaSituacao(serie([['10:00', 4.9], ['11:00', 5.1], ['12:00', 5.3]]), cotas, 'EXTRAVASAMENTO'), { em: t('11:00') });
  assert.deepEqual(inicioDaSituacao(serie([['10:00', 5.1], ['11:00', 5.3]]), cotas, 'EXTRAVASAMENTO'), { antesDe: t('10:00') });
  const s = serie([['-1 20:00', 5.4], ['09:00', 5.2], ['09:10', 4.95], ['15:50', 4.1]]);
  assert.equal(saidaDoExtravasamento(s, cotas, 'EMERGÊNCIA', AGORA), t('09:10'));
  assert.equal(saidaDoExtravasamento(serie([['-1 10:00', 5.4], ['-1 11:00', 4.2], ['15:50', 4.1]]), cotas, 'EMERGÊNCIA', AGORA), null); // mais de 24 h
  assert.equal(saidaDoExtravasamento(s, cotas, 'EXTRAVASAMENTO', AGORA), null);
});

/** O boletim fechado: Referência 1 = 07h de 27/10, Referência 2 = 07h de 28/10. */
const INI = t('-1 07:00');
const fechado = (e = SETE_BARRAS!, s: [string, number][]) => montarPonto(e, serie(s), cotas, INI, T07, null);

test('período fechado: as 07h do dia vêm da reserva do banco quando o SIBH não as tem', () => {
  const p = montarPonto(SETE_BARRAS!, serie([['-1 07:00', 2.1]]), cotas, INI, T07, null, { nivel: 2.4, em: T07 });
  assert.equal(p.nivel07, 2.1);
  assert.equal(p.atual, 2.4);
  assert.equal(p.variacao, 0.3);
  assert.equal(p.situacao, 'ATENÇÃO');
  assert.equal(p.atrasado, false);
});

test('diagnóstico executivo: o modelo do sumário emitido, às 07h do dia', () => {
  const normais = ESTACOES_RIBEIRA.map((e) => fechado(e, [['-1 07:00', 1], ['07:00', 1]]));
  assert.equal(diagnostico(normais, T07), 'Nenhum dos 8 pontos monitorados no Vale do Ribeira de Iguape está acima da cota de extravasamento às 07h de 28/10.');

  const mistos: PontoRibeira[] = [
    fechado(SETE_BARRAS, [['-1 07:00', 4.8], ['07:00', 5.2]]),
    fechado(PARIQUERA, [['-1 07:00', 6.4], ['07:00', 6.3]]),
    fechado(REGISTRO, [['-1 07:00', 3.1], ['07:00', 3.4]]),
    fechado(RIBEIRA, [['-1 01:00', 1]]),
  ];
  assert.equal(
    diagnostico(mistos, T07),
    'Às 07h de 28/10, 2 de 4 pontos monitorados permanecem em extravasamento no Vale do Ribeira de Iguape, com redução de nível em 1 deles e elevação em 2 pontos. Maior excedência em Pariquera-Açu (+1,30 m acima da cota).',
  );
  assert.doesNotMatch(diagnostico(mistos, T07), /montante|jusante|em geral/); // sem interpretação que os dados não dão
  assert.equal(
    sinteseResumo(mistos),
    'Das 4 estações monitoradas, 2 permanecem em extravasamento, 1 em alerta. 0 estações apresentam condição de normalidade.',
  );
  assert.equal(diagnostico([fechado(RIBEIRA, [['-1 01:00', 1]])], T07), 'Sem dados suficientes para diagnóstico no momento.');
});

test('síntese por ponto nos modelos do sumário emitido (extravasamento, saída, demais)', () => {
  const extrav = sintese(fechado(SETE_BARRAS, [['-1 07:00', 4.8], ['-1 11:00', 5.05], ['07:00', 5.2]]), T07);
  assert.equal(
    textoSintese(extrav),
    'permanece em extravasamento desde 27/10, às 11h00. Às 07h00 de 28/10, o posto registrava nível de 5,20 m, aproximadamente 0,20 m acima da cota de extravasamento de 5,00 m, com variação de +0,40 m no período em análise. O monitoramento dos dados mais recentes indica que o nível permanece em subida.',
  );
  // os mesmos destaques em negrito do sumário emitido
  assert.deepEqual(
    extrav.filter((x) => x.b).map((x) => x.t),
    ['0,20 m acima', '+0,40 m', 'subida'],
  );

  const longo = sintese(fechado(SETE_BARRAS, [['-1 07:00', 5.3], ['07:00', 5.2]]), T07);
  assert.match(textoSintese(longo), /^permanece em extravasamento desde antes de 27\/10, às 07h00 \(início do período consultado\)\./);

  const saiu = sintese(fechado(SETE_BARRAS, [['-1 07:00', 5.3], ['-1 09:00', 4.9], ['07:00', 4.5]]), T07);
  assert.equal(
    textoSintese(saiu),
    'Saiu de extravasamento às 09h00 de 27/10. Às 07h00 de 28/10, o posto registrava nível de 4,50 m, com variação de -0,80 m no período em análise. O monitoramento dos dados mais recentes indica que o nível permanece em queda.',
  );

  assert.equal(
    textoSintese(sintese(fechado(SETE_BARRAS, [['-1 07:00', 1], ['07:00', 1]]), T07)),
    'permanece em normalidade. Às 07h00 de 28/10, o posto registrava nível de 1,00 m, com variação de 0,00 m no período em análise. O monitoramento dos dados mais recentes indica que o nível permanece em estável.',
  );
  assert.equal(
    textoSintese(sintese(fechado(SETE_BARRAS, [['-1 09:00', 1], ['07:00', 1]]), T07)),
    'permanece em normalidade. Às 07h00 de 28/10, o posto registrava nível de 1,00 m, sem variação registrada no período em análise.',
  );
  assert.equal(textoSintese(sintese(fechado(SETE_BARRAS, [['-1 01:00', 1]]), T07)), 'sem leitura disponível no SIBH às 07h00 de 28/10.');
});

test('volume útil da Copel: só o registro das 07h, aguardando ou indisponível', () => {
  assert.deepEqual(textoVolumeCopel({ estado: 'ok', valor: 81.26, lidoEm: T07 }), { valor: '81,3%', detalhe: 'Registro das 07h de 28/10 (horário de Brasília).' });
  assert.equal(textoVolumeCopel({ estado: 'aguardando' }).detalhe, 'Aguardando a publicação do registro pela Copel.');
  const ind = textoVolumeCopel({ estado: 'indisponivel', motivo: 'Fonte fora do ar.', ultima: { valor: 80, lidoEm: t('-1 07:00') } });
  assert.equal(ind.valor, 'Indisponível');
  assert.equal(ind.detalhe, 'Fonte fora do ar. Última medição válida: 80,0% em 27/10 às 07h00.');
});

test('PDF: gera um documento válido com dados e com as fontes fora do ar', async () => {
  assert.equal(limpar('↑ Subida → 5 m³/s — ação'), ' Subida  5 m³/s — ação');
  const ref = { ...referencias(AGORA), agora: AGORA };
  const pontos = ESTACOES_RIBEIRA.map((e, i) => ponto(e, [['07:00', 4 + i * 0.2], ['15:50', 4.3 + i * 0.2]]));
  const copel = { estado: 'indisponivel' as const, motivo: 'Sem integração autorizada.', ultima: null };
  const pdf = await gerarPdf({
    ref,
    geradoEm: AGORA,
    niveis: { ok: true, fonte: 'SIBH', obtidoEm: new Date(AGORA), desatualizado: false, dados: { pontos, atualizadoEm: AGORA } },
    estruturas: { ok: false, fonte: 'SIBH', mensagem: 'SIBH indisponível.' },
    chuva: { ok: true, fonte: 'SIBH', obtidoEm: new Date(AGORA), desatualizado: false, dados: { ultimas3h: 1.2, ultimas24h: 30.5, previsao24h: 12, postos: 120, pontosPrevisao: 152 } },
    copel,
    endereco: 'http://127.0.0.1:3000/boletins/automatico/vale-do-ribeira',
  });
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), '%PDF-');
  assert.ok(pdf.length > 5_000);

  const vazio = await gerarPdf({
    ref,
    geradoEm: AGORA,
    niveis: { ok: false, fonte: 'SIBH', mensagem: 'SIBH indisponível.' },
    estruturas: { ok: false, fonte: 'SIBH', mensagem: 'SIBH indisponível.' },
    chuva: { ok: false, fonte: 'SIBH', mensagem: 'SIBH indisponível.' },
    copel,
    endereco: 'x',
  });
  assert.equal(Buffer.from(vazio.subarray(0, 5)).toString(), '%PDF-');
});

test('período: padrão das 07h às 07h; escolhido pelo usuário; valores inválidos voltam ao padrão', async () => {
  const { escolherPeriodo, paraCampo } = await import('../src/lib/boletins-sala/boletim-ribeira');
  // padrão: o dia operacional de hoje (referencias() usa o relógio), 07h → 07h, 24 h
  const padrao = escolherPeriodo(undefined, undefined);
  assert.equal(padrao.erro, null);
  assert.equal(padrao.ref.personalizado, false);
  assert.equal(padrao.ref.t07 - padrao.ref.t07Ontem, 24 * 3_600_000);
  assert.match(paraCampo(padrao.ref.t07), /T07:00$/);
  // o mesmo período do padrão, escolhido no formulário, continua sendo o padrão (usa a reserva das 07h)
  assert.equal(escolherPeriodo(paraCampo(padrao.ref.t07Ontem), paraCampo(padrao.ref.t07)).ref.personalizado, false);

  const agora = t('15:50');

  const esc = escolherPeriodo('2026-10-27T13:20', '2026-10-28T13:20', agora);
  assert.equal(esc.erro, null);
  assert.equal(esc.ref.personalizado, true);
  assert.equal(esc.ref.t07Ontem, t('-1 13:20'));
  assert.equal(esc.ref.t07, t('13:20'));
  assert.equal(esc.ref.dia, '2026-10-28');
  assert.equal(paraCampo(esc.ref.t07), '2026-10-28T13:20');

  for (const [ini, fim, msg] of [
    ['2026-10-28T10:00', '2026-10-28T09:00', /anterior ao fim/],
    ['2026-10-28T10:00', '2026-10-28T18:00', /depois de agora/],
    ['2026-10-10T10:00', '2026-10-28T10:00', /no máximo 7 dias/],
    ['ontem', '2026-10-28T10:00', /dia e a hora/],
  ] as const) {
    const r = escolherPeriodo(ini, fim, agora);
    assert.match(r.erro ?? '', msg);
    assert.equal(r.ref.personalizado, false); // volta ao padrão
  }
});
