'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const ATUALIZAR_MS = 10 * 60 * 1000;

/** Relógio do topo; também recarrega os dados do painel a cada 10 minutos. */
export function Relogio() {
  const router = useRouter();
  const [hora, setHora] = useState('--:--');

  useEffect(() => {
    const marcar = () => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    marcar();
    const relogio = setInterval(marcar, 20_000);
    const dados = setInterval(() => router.refresh(), ATUALIZAR_MS);
    return () => {
      clearInterval(relogio);
      clearInterval(dados);
    };
  }, [router]);

  return <div className="pnl-relogio">{hora}</div>;
}
