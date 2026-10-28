import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESTACOES_RIBEIRA } from '../src/conteudo/boletim-ribeira';
import {
  diagnostico,
  inicioDaSituacao,
  montarPonto,
  observacoes,
  saidaDoExtravasamento,
  serieDoPosto,
  sintese,
  tendencia,
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

test('diagnóstico executivo: só fatos (contagem, movimento desde as 07h, maior excedência)', () => {
  const normais = ESTACOES_RIBEIRA.map((e) => ponto(e, [['07:00', 1], ['15:50', 1]]));
  assert.equal(
    diagnostico(normais, T07),
    'Às 15h50 de 28/10, os 8 pontos monitorados no Vale do Ribeira de Iguape estão em condição normal; nenhum está acima da cota de extravasamento. Desde as 07h de 28/10, o nível ficou estável em 8 pontos.',
  );

  const mistos: PontoRibeira[] = [
    ponto(SETE_BARRAS, [['07:00', 4.8], ['15:50', 5.2]]),
    ponto(PARIQUERA, [['07:00', 6.4], ['15:50', 6.3]]),
    ponto(REGISTRO, [['07:00', 3.1], ['15:50', 3.4]]),
    ponto(RIBEIRA, [['-1 01:00', 1]]),
  ];
  const d = diagnostico(mistos, T07);
  assert.match(d, /^Às 15h50 de 28\/10, entre os 3 pontos com situação classificada, 2 em extravasamento e 1 em alerta\./);
  assert.match(d, /1 ponto está sem leitura recente\./);
  assert.match(d, /Desde as 07h de 28\/10, o nível subiu em 2 pontos e caiu em 1 ponto\./);
  assert.match(d, /Maior excedência da cota de extravasamento em Pariquera-Açu \(\+1,30 m\)\.$/);
  assert.doesNotMatch(d, /montante|jusante|em geral/); // sem interpretação que os dados não dão

  assert.match(diagnostico([ponto(RIBEIRA, [['-1 01:00', 1]])], T07), /^Sem leituras recentes/);
});

test('síntese por ponto nos modelos do sumário tradicional', () => {
  const extrav = ponto(SETE_BARRAS, [['07:00', 4.8], ['11:00', 5.05], ['15:50', 5.2]]);
  assert.equal(sintese(extrav), 'em extravasamento desde 11h00 de 28/10. Às 15h50 de 28/10, o posto registrava nível de 5,20 m, 0,20 m acima da cota de extravasamento de 5,00 m, subida de 0,40 m desde as 07h.');

  const longo = ponto(SETE_BARRAS, [['07:00', 5.3], ['15:50', 5.2]]);
  assert.match(sintese(longo), /^em extravasamento desde antes de 07h00 de 28\/10 \(início do período consultado\)\./);

  const saiu = ponto(SETE_BARRAS, [['07:00', 5.3], ['09:00', 4.9], ['15:50', 4.5]]);
  assert.equal(sintese(saiu), 'saiu do extravasamento às 09h00 de 28/10 e está em emergência. Às 15h50 de 28/10, o posto registrava nível de 4,50 m, queda de 0,80 m desde as 07h.');

  assert.equal(sintese(ponto(SETE_BARRAS, [['07:00', 1], ['15:50', 1]])), 'em condição normal. Às 15h50 de 28/10, o posto registrava nível de 1,00 m, estável desde as 07h.');
  assert.match(sintese(ponto(SETE_BARRAS, [['09:00', 1], ['15:50', 1]])), /sem a leitura das 07h, a variação do dia não foi calculada\.$/);
  assert.equal(sintese(ponto(SETE_BARRAS, [['-1 01:00', 1]])), 'sem leitura disponível no SIBH nas últimas 12 horas.');
});

test('observações automáticas: registros ausentes ou incompletos', () => {
  const o = observacoes(
    [ponto(RIBEIRA, [['-1 01:00', 1]]), ponto(REGISTRO, [['07:00', 1], ['13:10', 1]]), ponto(SETE_BARRAS, [['09:00', 1], ['15:50', 1]])],
    T07,
  );
  assert.deepEqual(o, [
    'Sem leitura nas últimas 12 horas: Ribeira – Ponte Divisa Estadual.',
    'Última leitura recebida há mais de 1 hora: Registro (13h10 de 28/10).',
    'Sem leitura das 07h de 28/10 (até 30 minutos antes ou depois): Sete Barras — variação e tendência não calculadas.',
  ]);
  assert.match(observacoes([ponto(SETE_BARRAS, [['07:00', 1], ['15:50', 1]])], T07)[0]!, /enviaram leitura na última hora/);
});

test('volume útil da Copel: só o registro das 07h, aguardando ou indisponível', () => {
  assert.deepEqual(textoVolumeCopel({ estado: 'ok', valor: 81.26, lidoEm: T07 }), { valor: '81,3%', detalhe: 'Registro das 07h de 28/10 (horário de Brasília).' });
  assert.equal(textoVolumeCopel({ estado: 'aguardando' }).detalhe, 'Volume útil das 07h: aguardando atualização da Copel.');
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
