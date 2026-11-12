'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker dos arquivos estáticos (public/sw.js): JS, CSS e
 * fontes do Next ficam guardados no navegador mesmo com o "no-store" que o proxy
 * de produção acrescenta. Só em produção: no `next dev` os arquivos mudam a cada
 * edição e o service worker atrapalharia a recarga.
 */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
