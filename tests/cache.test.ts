import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { definirDiretorio, lembrar, ultimoErro } from '../src/lib/integracoes/cache';

let pasta: string;
let n = 0;
const chave = () => `chave-${++n}`;

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'ssap-cache-'));
});
beforeEach(() => definirDiretorio(pasta));
after(async () => {
  definirDiretorio(null);
  await rm(pasta, { recursive: true, force: true });
});

test('dentro do prazo, não chama a fonte de novo', async () => {
  const k = chave();
  let chamadas = 0;
  const buscar = async () => ++chamadas;
  assert.equal((await lembrar('teste', k, 60, buscar))?.valor, 1);
  const segundo = await lembrar('teste', k, 60, buscar);
  assert.equal(segundo?.valor, 1);
  assert.equal(segundo?.desatualizado, false);
  assert.equal(chamadas, 1);
});

test('o valor sobrevive à perda da memória (arquivo)', async () => {
  const k = chave();
  await lembrar('teste', k, 60, async () => 'gravado');
  definirDiretorio(pasta); // limpa a memória, como num reinício
  const r = await lembrar('teste', k, 60, async () => 'novo');
  assert.equal(r?.valor, 'gravado');
});

test('pedidos simultâneos viram uma chamada só', async () => {
  const k = chave();
  let chamadas = 0;
  const buscar = async () => {
    chamadas++;
    await new Promise((ok) => setTimeout(ok, 20));
    return 'x';
  };
  const todos = await Promise.all([1, 2, 3, 4].map(() => lembrar('teste', k, 60, buscar)));
  assert.equal(chamadas, 1);
  assert.ok(todos.every((r) => r?.valor === 'x'));
});

test('fonte fora do ar: devolve o último valor, marcado como desatualizado', async () => {
  const k = chave();
  await lembrar('teste', k, 0, async () => 'antigo');
  const r = await lembrar('teste', k, 0, async () => {
    throw new Error('fora do ar');
  });
  assert.equal(r?.valor, 'antigo');
  assert.equal(r?.desatualizado, true);
  assert.equal(ultimoErro('teste', k), 'fora do ar');
});

test('reserva velha demais não é usada', async () => {
  const k = chave();
  await lembrar('teste', k, 0, async () => 'antigo');
  const r = await lembrar('teste', k, 0, async () => null, { validadeMaxSeg: 0 });
  assert.equal(r, null);
});

test('depois de uma falha, espera antes de chamar a fonte de novo', async () => {
  const k = chave();
  let chamadas = 0;
  const falhar = async () => {
    chamadas++;
    return null;
  };
  assert.equal(await lembrar('teste', k, 60, falhar), null);
  assert.equal(await lembrar('teste', k, 60, falhar), null);
  assert.equal(chamadas, 1);
  await lembrar('teste', k, 60, falhar, { esperaFalhaSeg: 0 });
  assert.equal(chamadas, 2);
});

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

test('esperaMaxSeg: fonte lenta devolve a reserva na hora e o valor novo chega em segundo plano', async () => {
  const k = chave();
  await lembrar('teste', k, 60, async () => 'antigo');
  let chamadas = 0;
  const lenta = async () => {
    chamadas++;
    await dormir(250);
    return 'novo';
  };
  const inicio = Date.now();
  const r = await lembrar('teste', k, 0, lenta, { esperaMaxSeg: 0.05 });
  assert.ok(Date.now() - inicio < 200, 'não esperou a fonte');
  assert.equal(r?.valor, 'antigo');
  assert.equal(r?.desatualizado, true);
  assert.ok(r?.obtidoEm instanceof Date);
  // quem chega com a consulta em andamento aproveita a mesma (sem nova chamada)
  const outro = await lembrar('teste', k, 0, lenta, { esperaMaxSeg: 0.05 });
  assert.equal(outro?.valor, 'antigo');
  await dormir(300);
  const depois = await lembrar('teste', k, 60, lenta);
  assert.equal(depois?.valor, 'novo');
  assert.equal(depois?.desatualizado, false);
  assert.equal(chamadas, 1);
});

test('esperaMaxSeg: fonte que responde a tempo entrega o valor novo', async () => {
  const k = chave();
  await lembrar('teste', k, 60, async () => 'antigo');
  const r = await lembrar('teste', k, 0, async () => 'novo', { esperaMaxSeg: 1 });
  assert.equal(r?.valor, 'novo');
  assert.equal(r?.desatualizado, false);
});

test('esperaMaxSeg: sem reserva, espera a fonte', async () => {
  const k = chave();
  const r = await lembrar(
    'teste',
    k,
    60,
    async () => {
      await dormir(150);
      return 'primeiro';
    },
    { esperaMaxSeg: 0.02 },
  );
  assert.equal(r?.valor, 'primeiro');
  assert.equal(r?.desatualizado, false);
});

test('esperaMaxSeg: reserva velha demais não é usada (espera a fonte)', async () => {
  const k = chave();
  await lembrar('teste', k, 60, async () => 'antigo');
  const r = await lembrar(
    'teste',
    k,
    0,
    async () => {
      await dormir(150);
      return 'novo';
    },
    { esperaMaxSeg: 0.02, validadeMaxSeg: 0 },
  );
  assert.equal(r?.valor, 'novo');
});

test('sem esperaMaxSeg: espera a fonte lenta, como antes', async () => {
  const k = chave();
  await lembrar('teste', k, 60, async () => 'antigo');
  const r = await lembrar('teste', k, 0, async () => {
    await dormir(150);
    return 'novo';
  });
  assert.equal(r?.valor, 'novo');
  assert.equal(r?.desatualizado, false);
});

test('recusa nome de serviço que sairia da pasta do cache', async () => {
  await assert.rejects(lembrar('../fora', 'k', 60, async () => 1), /inválido/);
});
