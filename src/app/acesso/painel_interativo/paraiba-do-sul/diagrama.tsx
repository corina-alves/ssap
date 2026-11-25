'use client';

import { useState } from 'react';
import { DIAGRAMA_PARAIBA } from '@/conteudo/diagrama-paraiba';
import { ehPluviometro, ehPostoSibh, type No } from '@/conteudo/diagramas-unifilares';
import { GraficosPosto } from '../grafico-posto';
import { chavePosto, DiagramaUnifilar, type NoPostoClicavel } from '../unifilar';
import { useAtualizacao } from '../usar-atualizacao';
import { GraficosPluviometro, GraficosReservatorio } from './graficos-no';

type Reservatorio = Extract<No, { tipo: 'reservatorio' }>;
/** O que está aberto por cima do desenho: um posto (SIBH, ANA ou pluviômetro) ou um reservatório. */
type Aberto = { tipo: 'posto'; n: NoPostoClicavel } | { tipo: 'reservatorio'; n: Reservatorio };

const chave = (a: Aberto) => (a.tipo === 'posto' ? chavePosto(a.n) : `reservatorio:${a.n.space}`);
const titulo = (n: { prefixo?: string; nome: string }) => [n.prefixo, n.nome].filter(Boolean).join(' · ');

/**
 * Diagrama unifilar da bacia do Paraíba do Sul na página do painel: mesma
 * atualização automática das outras telas e, ao clicar num nó, os gráficos dele
 * por cima do desenho: posto do SIBH ou da ANA (vazão, nível e chuva),
 * pluviômetro do SIBH (chuva) ou reservatório do ONS (volume e vazões).
 * Clicar de novo no mesmo nó fecha.
 */
export function DiagramaParaiba({ data, hoje }: { data: string; hoje: string }) {
  const d = DIAGRAMA_PARAIBA;
  const api = d.api!.posto;
  const tick = useAtualizacao(data, hoje);
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const alternar = (a: Aberto) => setAberto((x) => (x && chave(x) === chave(a) ? null : a));
  const fechar = () => setAberto(null);

  let sobre = null;
  if (aberto?.tipo === 'reservatorio') {
    const n = aberto.n;
    sobre = <GraficosReservatorio key={chave(aberto)} url={`${api}?reservatorio=${n.space}&data=${data}`} titulo={titulo(n)} tick={tick} aoFechar={fechar} />;
  } else if (aberto) {
    const n = aberto.n;
    sobre = ehPluviometro(n) ? (
      <GraficosPluviometro key={chave(aberto)} url={`${api}?pluvio=${n.pluvio}&data=${data}`} titulo={titulo(n)} tick={tick} aoFechar={fechar} />
    ) : (
      <GraficosPosto
        key={chave(aberto)}
        url={ehPostoSibh(n) ? `${api}?id=${n.sibh.id}&data=${data}` : `${api}?ana=${encodeURIComponent(n.ana.codigo)}&data=${data}`}
        titulo={titulo(n)}
        tick={tick}
        aoFechar={fechar}
      />
    );
  }

  return (
    <DiagramaUnifilar
      d={d}
      data={data}
      tick={tick}
      destaque={aberto?.tipo === 'reservatorio' ? aberto.n.space : null}
      aoEscolher={(space) => {
        const n = d.nos.find((x): x is Reservatorio => x.tipo === 'reservatorio' && x.space === space);
        if (n) alternar({ tipo: 'reservatorio', n });
      }}
      postoAtivo={aberto?.tipo === 'posto' ? chavePosto(aberto.n) : null}
      aoPosto={(n) => alternar({ tipo: 'posto', n })}
      sobre={sobre}
    />
  );
}
