import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combinarCotas, lerCotasCsv } from '../src/lib/boletins-sala/cotas-planilha';

const CSV = `﻿UGRHI;Prefixo;Municipio;Nome do posto;Atenção (m);Alerta (m);Emergência (m);Extravasamento (m);;;
11;5F-005;Ribeira de Iguape;Ribeira de Iguape;3,50;4,00;4,50;5,00;;;
6;3E-134;Guarulhos;Rio Tietê - Barragem da Penha Jusante;720,85;721,85;722,85;723,85;;;
6;844;São Paulo;Agua Vermelha;;;;741,65;;;
6;3E-173;Mauá;RT-3 Petrobras;748,85;751,02;754,00;756,98;;;
6;3E-173;Mauá;RT-3 Petrobras;748,05;751,02;754,00;756,98;;;
6;;São Paulo;Córrego Tatuapé;;;;734,17;;;
6;612;São Paulo;Elevatória Yasuda;;;;;;;
`;

test('lerCotasCsv: vírgula decimal, cotas em branco, 1ª ocorrência do prefixo; sem prefixo ou sem cota fica fora', () => {
  const l = lerCotasCsv(CSV);
  assert.deepEqual(
    l.map((x) => [x.ugrhi, x.prefixo]),
    [[11, '5F-005'], [6, '3E-134'], [6, '844'], [6, '3E-173']],
  );
  assert.deepEqual(l[1]!.cotas, { atencao: 720.85, alerta: 721.85, emergencia: 722.85, extravasamento: 723.85 });
  assert.deepEqual(l[2]!.cotas, { atencao: null, alerta: null, emergencia: null, extravasamento: 741.65 });
  assert.equal(l[3]!.cotas.atencao, 748.85);
});

test('combinarCotas: o SIBH vale; a planilha completa o que falta sem quebrar a ordem das faixas', () => {
  const sibh = { atencao: null, alerta: null, emergencia: null, extravasamento: 733 };
  assert.deepEqual(combinarCotas(sibh, { atencao: 731, alerta: 732, emergencia: 732.5, extravasamento: 740 }), { atencao: 731, alerta: 732, emergencia: 732.5, extravasamento: 733 });
  assert.equal(combinarCotas(sibh, null), sibh);
  assert.deepEqual(combinarCotas(null, { atencao: null, alerta: null, emergencia: null, extravasamento: 741.65 }), { atencao: null, alerta: null, emergencia: null, extravasamento: 741.65 });
  // erro de digitação na planilha (emergência 746,60 entre 723,60 e 725,60): fica de fora
  assert.deepEqual(
    combinarCotas({ atencao: 722.6, alerta: 723.6, emergencia: null, extravasamento: 725.6 }, { atencao: 722.6, alerta: 723.6, emergencia: 746.6, extravasamento: 725.6 }),
    { atencao: 722.6, alerta: 723.6, emergencia: null, extravasamento: 725.6 },
  );
  assert.equal(combinarCotas(null, null), null);
});
