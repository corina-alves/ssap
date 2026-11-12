/*
 * Sala de Situação — service worker SÓ dos arquivos estáticos do Next (/_next/static/).
 *
 * Esses arquivos (JS, CSS, fontes) levam o conteúdo no nome (hash): um arquivo com
 * o mesmo endereço nunca muda. O Next manda guardá-los por 1 ano, mas o proxy na
 * frente do site em produção acrescenta "Cache-Control: no-store", e o navegador
 * baixava tudo de novo (~290 KB, ~19 requisições) a cada página. Aqui eles ficam
 * guardados no navegador (Cache Storage, que não obedece ao no-store) e voltam
 * sem ir à rede.
 *
 * Qualquer outra requisição (páginas, APIs, imagens, formulários, área restrita)
 * não é tocada: o navegador faz como faria sem este arquivo.
 *
 * Para desligar em todos os navegadores: troque o conteúdo deste arquivo pelo
 * bloco "DESLIGAR" do DOCKER.md (seção "Arquivos estáticos e o proxy").
 */

const PREFIXO = 'ssap-estaticos-';
const CACHE = `${PREFIXO}v1`;
// a cada atualização do site entram arquivos novos; os mais antigos saem acima disto
const MAX_ARQUIVOS = 400;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nome of await caches.keys()) if (nome.startsWith(PREFIXO) && nome !== CACHE) await caches.delete(nome);
      await self.clients.claim();
    })(),
  );
});

/** Tira os mais antigos (a lista vem na ordem em que entraram). */
async function aparar(cache) {
  const chaves = await cache.keys();
  for (let i = 0; i < chaves.length - MAX_ARQUIVOS; i++) await cache.delete(chaves[i]);
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/_next/static/')) return;

  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const guardado = await cache.match(pedido, { ignoreVary: true });
      if (guardado) return guardado;
      const resposta = await fetch(pedido);
      // só resposta completa e do próprio site (nada de erro, redirecionamento ou pedaço)
      if (resposta.status === 200 && resposta.type === 'basic') {
        evento.waitUntil(cache.put(pedido, resposta.clone()).then(() => aparar(cache)).catch(() => {}));
      }
      return resposta;
    })(),
  );
});
