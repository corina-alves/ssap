import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classificar, hora, m, nomeTexto, texto, textoChuvaWhatsapp, textoWhatsapp, type Posto } from '../src/lib/hidrologia/situacao-rios';

const cotas = { atencao: 2, alerta: 3, emergencia: 4, extravasamento: 5 };

function posto(parcial: Partial<Posto> & { nome: string; nivel: number }): Posto {
  return {
    id: parcial.nome, prefixo: '123', cidade: 'Tatuí', ugrhi: 10, piscinao: false, cotas,
    hora: null, tendencia: null, variacao_1h: null,
    ...parcial,
    ...classificar(parcial.nivel, parcial.cotas ?? cotas),
  };
}

test('classifica pela cota mais grave atingida (a cota entra na faixa)', () => {
  assert.equal(classificar(1.99, cotas).situacao, 'normal');
  assert.deepEqual(classificar(2, cotas), { situacao: 'atencao', cota_ref: 2, acima: 0 });
  assert.deepEqual(classificar(4.153, cotas), { situacao: 'emergencia', cota_ref: 4, acima: 0.153 });
  assert.equal(classificar(9, cotas).situacao, 'extravasamento');
  // posto só com cota de alerta: abaixo dela é normal, mesmo sem cota de atenção
  assert.equal(classificar(2.5, { atencao: null, alerta: 3, emergencia: null, extravasamento: null }).situacao, 'normal');
});

test('formatos: número, hora de São Paulo e nome do posto', () => {
  assert.equal(m(550.6531, 3), '550,653');
  assert.equal(m(null, 2), '—');
  assert.equal(hora(Date.parse('2026-10-05T13:30:00Z') / 1000), '10h30');
  assert.equal(nomeTexto({ nome: 'Tatuí  (Barragem)' }), 'Tatuí – Barragem');
  assert.equal(nomeTexto({ nome: 'Rio Sorocaba' }), 'Rio Sorocaba');
});

test('texto formal: sem pontos, todos normais e com pontos fora do normal', () => {
  assert.match(texto([]), /Não há pontos monitorados/);
  assert.equal(texto([posto({ nome: 'A', nivel: 1 })]), 'O único ponto monitorado permanece em condição normal.');
  assert.match(texto([posto({ nome: 'A', nivel: 1 }), posto({ nome: 'B', nivel: 1 })]), /Entre os 2 pontos monitorados, todos/);

  const t = texto([
    posto({ nome: 'Tatuí (Barragem)', nivel: 4.153, hora: Date.parse('2026-10-05T13:30:00Z') / 1000, tendencia: 'estavel' }),
    posto({ nome: 'Piedade (Captação)', nivel: 2.1 }),
    posto({ nome: 'Cabreúva', nivel: 2.2 }),
    posto({ nome: 'Normal 1', nivel: 1 }),
    posto({ nome: 'Normal 2', nivel: 1 }),
  ]);
  assert.match(t, /^Entre os pontos monitorados, 1 encontra-se em emergência e 2 em atenção\. Os demais pontos permanecem em condição normal\./);
  assert.match(t, /O ponto em emergência é Tatuí – Barragem \(123\)\./);
  assert.match(t, /o nível permanece estável, registrando 4,153 m às 10h30, valor 0,153 m acima da cota de emergência de 4,00 m\./);
  assert.match(t, /Os dois pontos em atenção são Piedade – Captação \(123\) e Cabreúva \(123\)\./);
});

test('mensagem de WhatsApp: resumo, bloco por situação e chuva', () => {
  const chuva = textoChuvaWhatsapp([{ id: '1', p: 'X', n: 'Sorocaba (Morros)', c: 'Sorocaba', lat: 0, lng: 0, v: 25.2 }], 24);
  assert.match(chuva, /CHUVA NAS ÚLTIMAS 24 HORAS/);
  assert.match(chuva, /\*25,2 mm\* — Sorocaba – Morros/); // sem repetir o município
  assert.match(textoChuvaWhatsapp([], 3), /Nenhum posto com chuva acima de 10 mm nas últimas 3 horas/);

  const z = textoWhatsapp([posto({ nome: 'Tatuí (Barragem)', nivel: 3.5, tendencia: 'elevacao' }), posto({ nome: 'N', nivel: 1 })], 'UGRHI 10', Date.parse('2026-10-05T13:35:00Z') / 1000, chuva);
  assert.match(z, /🗓️ 05\/10\/2026 {2}🕒 10h35/);
  assert.match(z, /🟠 1 em alerta\n🟢 1 em condição normal/);
  assert.match(z, /⬆️ subindo/);
  assert.match(z, /0,50 m acima da cota de alerta \(3,00 m\)/);
  assert.match(z, /✅ Demais pontos em condição normal\./);
});
