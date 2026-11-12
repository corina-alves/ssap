import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contarSituacoes, ordenarPontos, piorSituacao, type Situacao } from '../src/lib/acesso/painel-monitoramento-regras';

test('piorSituacao: a mais grave da lista, ignorando os pontos sem situação', () => {
  assert.equal(piorSituacao([]), null);
  assert.equal(piorSituacao([null, null]), null);
  assert.equal(piorSituacao(['NORMAL', null, 'NORMAL']), 'NORMAL');
  assert.equal(piorSituacao(['ATENÇÃO', 'EMERGÊNCIA', 'ALERTA', 'NORMAL']), 'EMERGÊNCIA');
  assert.equal(piorSituacao(['EXTRAVASAMENTO', 'EMERGÊNCIA']), 'EXTRAVASAMENTO');
});

test('contarSituacoes: todas as situações aparecem, mesmo com zero', () => {
  assert.deepEqual(contarSituacoes(['NORMAL', 'NORMAL', 'ATENÇÃO', null]), { NORMAL: 2, ATENÇÃO: 1, ALERTA: 0, EMERGÊNCIA: 0, EXTRAVASAMENTO: 0 });
});

test('ordenarPontos: mais grave primeiro; no empate, mais perto do extravasamento; sem situação por último', () => {
  const p = (nome: string, situacao: Situacao | null, acima: number | null) => ({ nome, situacao, acima });
  const lista = [p('Registro', 'NORMAL', -3.2), p('Eldorado', null, null), p('Iporanga', 'NORMAL', -0.5), p('Pariquera-Açu', 'EMERGÊNCIA', -0.4), p('Juquiá', 'ATENÇÃO', -1)];
  assert.deepEqual(
    ordenarPontos(lista, (x) => x.acima).map((x) => x.nome),
    ['Pariquera-Açu', 'Juquiá', 'Iporanga', 'Registro', 'Eldorado'],
  );
  // sem a cota de extravasamento, o empate vai pelo nome
  assert.deepEqual(
    ordenarPontos([p('São Miguel', 'NORMAL', null), p('Ponte Dutra', 'NORMAL', null)]).map((x) => x.nome),
    ['Ponte Dutra', 'São Miguel'],
  );
});
