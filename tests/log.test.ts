import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { classificarErro, classificarStatus, fonteDe, viaProxy } from '../src/lib/integracoes/monitor';
import { definirSaida, endpointSeguro, erroSeguro, log, textoSeguro, type Nivel } from '../src/lib/log';

/** Captura as linhas registradas. */
function capturar() {
  const linhas: { nivel: Nivel; dados: Record<string, unknown> }[] = [];
  definirSaida((nivel, linha) => linhas.push({ nivel, dados: JSON.parse(linha) }));
  return linhas;
}
afterEach(() => {
  definirSaida();
  delete process.env.LOG_NIVEL;
});

test('linha JSON com data, nível e evento; DEBUG só quando ligado', () => {
  const l = capturar();
  log.debug('nao_aparece');
  log.info('app_iniciada', { pid: 1 });
  process.env.LOG_NIVEL = 'debug';
  log.debug('aparece');
  process.env.LOG_NIVEL = 'error';
  log.warn('nao_aparece_tambem');
  assert.deepEqual(l.map((x) => x.dados.evento), ['app_iniciada', 'aparece']);
  assert.match(String(l[0]!.dados.ts), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(l[0]!.dados.nivel, 'info');
});

test('nunca registra segredos: chaves sensíveis, credenciais em URL e parâmetros sensíveis', () => {
  const l = capturar();
  log.info('teste', {
    senha: 'x', token: 'y', Authorization: 'Basic abc', cookie: 'ssap_sessao=z', SAISP_SENHA: 'w',
    proxy: 'http://usuario:segredo@10.0.0.1:80', url: 'https://ex.com/a?token=abc&data=2026-10-20&chave=k',
    aninhado: { db: { password: 'p' } },
  });
  const d = l[0]!.dados as Record<string, unknown>;
  for (const k of ['senha', 'token', 'Authorization', 'cookie', 'SAISP_SENHA']) assert.equal(d[k], '[oculto]');
  assert.equal(d.proxy, 'http://***@10.0.0.1:80');
  assert.equal(d.url, 'https://ex.com/a?token=***&data=2026-10-20&chave=***');
  assert.deepEqual(d.aninhado, { db: { password: '[oculto]' } });
  assert.ok(!JSON.stringify(d).match(/segredo|Basic abc|ssap_sessao/));
  assert.equal(endpointSeguro('https://u:s@apps.spaguas.sp.gov.br/sibh/api?x=1&api_key=k'), 'https://apps.spaguas.sp.gov.br/sibh/api?x=1&api_key=***');
  assert.equal(textoSeguro('a'.repeat(900)).length, 500);
});

test('registrar nunca lança, mesmo com saída quebrada ou dado circular', () => {
  definirSaida(() => {
    throw new Error('disco cheio');
  });
  assert.doesNotThrow(() => log.error('x'));
  definirSaida(() => {});
  const circular: Record<string, unknown> = {};
  circular.eu = circular;
  assert.doesNotThrow(() => log.info('x', { circular }));
});

test('erro vira campos seguros (sem pilha), com código e causa', () => {
  const e = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND x' } });
  assert.deepEqual(erroSeguro(e), { nome: 'TypeError', mensagem: 'fetch failed', causa: 'ENOTFOUND getaddrinfo ENOTFOUND x' });
});

test('falhas das APIs: timeout, DNS, certificado, proxy, conexão, autenticação, HTTP', () => {
  const erro = (code: unknown, message = '', name = 'TypeError') => Object.assign(new Error('fetch failed'), { name, cause: { code, message } });
  assert.equal(classificarErro(Object.assign(new Error('t'), { name: 'TimeoutError' }), false), 'timeout');
  assert.equal(classificarErro(erro('UND_ERR_CONNECT_TIMEOUT'), false), 'timeout');
  assert.equal(classificarErro(erro('ENOTFOUND'), false), 'dns');
  assert.equal(classificarErro(erro('SELF_SIGNED_CERT_IN_CHAIN'), true), 'certificado');
  assert.equal(classificarErro(erro(0, 'Request was cancelled.'), true), 'proxy'); // proxy recusou (403/407)
  assert.equal(classificarErro(erro('ECONNREFUSED'), true), 'proxy'); // proxy fora do ar
  assert.equal(classificarErro(erro('ECONNREFUSED'), false), 'conexao');
  assert.equal(classificarStatus(401), 'autenticacao');
  assert.equal(classificarStatus(407), 'proxy');
  assert.equal(classificarStatus(500), 'http');
});

test('fonte pelo endereço e uso do proxy conforme NO_PROXY', () => {
  assert.equal(fonteDe('https://apps.spaguas.sp.gov.br/sibh/api/v2/x'), 'sibh');
  assert.equal(fonteDe('https://sssp.spaguas.sp.gov.br/ssdsp/api-private/x'), 'ssd');
  assert.equal(fonteDe('https://mananciais.sabesp.com.br/api'), 'sabesp');
  assert.equal(fonteDe('https://geocoding-api.open-meteo.com/v1/search'), 'openmeteo');
  const env = { HTTPS_PROXY: 'http://10.0.0.1:80', NODE_USE_ENV_PROXY: '1', NO_PROXY: 'db,localhost,.spaguas.sp.gov.br' };
  assert.equal(viaProxy('https://mananciais.sabesp.com.br/', env), true);
  assert.equal(viaProxy('https://apps.spaguas.sp.gov.br/', env), false);
  assert.equal(viaProxy('https://mananciais.sabesp.com.br/', {}), false);
});
