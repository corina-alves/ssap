'use client';

import { useState } from 'react';
import { DIAGRAMA_PARAIBA } from '@/conteudo/diagrama-paraiba';
import { ehPostoSibh } from '@/conteudo/diagramas-unifilares';
import { GraficosPosto } from '../grafico-posto';
import { chavePosto, DiagramaUnifilar, type NoPostoClicavel } from '../unifilar';
import { useAtualizacao } from '../usar-atualizacao';

/**
 * Diagrama unifilar da bacia do Paraíba do Sul na página do painel: mesma
 * atualização automática das outras telas e, ao clicar num posto (SIBH ou ANA),
 * os gráficos dele por cima do desenho.
 */
export function DiagramaParaiba({ data, hoje }: { data: string; hoje: string }) {
  const d = DIAGRAMA_PARAIBA;
  const tick = useAtualizacao(data, hoje);
  const [posto, setPosto] = useState<NoPostoClicavel | null>(null);
  const url = !posto ? null : ehPostoSibh(posto) ? `${d.api!.posto}?id=${posto.sibh.id}&data=${data}` : `${d.api!.posto}?ana=${encodeURIComponent(posto.ana.codigo)}&data=${data}`;

  return (
    <DiagramaUnifilar
      d={d}
      data={data}
      tick={tick}
      postoAtivo={posto ? chavePosto(posto) : null}
      aoPosto={(n) => setPosto((p) => (p && chavePosto(p) === chavePosto(n) ? null : n))}
      sobre={
        posto && url ? (
          <GraficosPosto key={chavePosto(posto)} url={url} titulo={[posto.prefixo, posto.nome].filter(Boolean).join(' · ')} tick={tick} aoFechar={() => setPosto(null)} />
        ) : null
      }
    />
  );
}
