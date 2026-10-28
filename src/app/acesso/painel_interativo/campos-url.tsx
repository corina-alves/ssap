'use client';

import { useSearchParams } from 'next/navigation';

/** Campos ocultos com parâmetros da URL atual, para o formulário de data não perdê-los. */
export function CamposDaUrl({ nomes }: { nomes: string[] }) {
  const busca = useSearchParams();
  return nomes.map((n) => {
    const v = busca.get(n);
    return v ? <input key={n} type="hidden" name={n} value={v} /> : null;
  });
}
