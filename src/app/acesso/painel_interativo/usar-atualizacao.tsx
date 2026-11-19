'use client';

import { useEffect, useState } from 'react';

const ATUALIZAR_MS = 60 * 60 * 1000;
const CONFERIR_MS = 5 * 60 * 1000;

/**
 * Atualização automática das telas do painel: só olhando o dia de hoje e com a
 * aba à vista, no máximo uma vez por hora (a conferência de 5 em 5 min não faz
 * requisição; ao voltar para a aba depois de 1 h, atualiza na hora). Devolve um
 * contador que muda a cada atualização (vai nas URLs das consultas).
 */
export function useAtualizacao(data: string, hoje: string): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (data !== hoje) return;
    let ultima = Date.now();
    const atualizar = () => {
      if (document.visibilityState !== 'visible' || Date.now() - ultima < ATUALIZAR_MS) return;
      ultima = Date.now();
      setTick((x) => x + 1);
    };
    const t = setInterval(atualizar, CONFERIR_MS);
    document.addEventListener('visibilitychange', atualizar);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', atualizar);
    };
  }, [data, hoje]);
  return tick;
}
