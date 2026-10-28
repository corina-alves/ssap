'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// dados diários e mensais (Sabesp, SSD): uma atualização por hora basta
const ATUALIZAR_MS = 60 * 60 * 1000;

/**
 * Relógio do topo; também recarrega os dados do painel uma vez por hora, só
 * com a aba à vista (ao voltar para a aba depois de 1 h, recarrega na hora).
 */
export function Relogio() {
  const router = useRouter();
  const [hora, setHora] = useState('--:--');

  useEffect(() => {
    const marcar = () => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    marcar();
    let ultima = Date.now();
    const recarregar = () => {
      if (document.visibilityState !== 'visible' || Date.now() - ultima < ATUALIZAR_MS) return;
      ultima = Date.now();
      router.refresh();
    };
    // o relógio confere também a hora de recarregar (sem requisição até passar 1 h)
    const relogio = setInterval(() => {
      marcar();
      recarregar();
    }, 20_000);
    document.addEventListener('visibilitychange', recarregar);
    return () => {
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', recarregar);
    };
  }, [router]);

  return <div className="pnl-relogio">{hora}</div>;
}
