'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { NoSibh } from '@/conteudo/diagramas-unifilares';
import type { GraficosPosto as Dados } from '@/lib/hidrologia/cantareira-operacao';
import { EChart } from './echart';
import { dataBr, fmt, opcaoChuvaDias, opcaoPostoDias } from './graficos';
import { Estado, useJson } from './usar-json';

/**
 * Gráficos de um posto do SIBH clicado no diagrama unifilar, num painel sobre o
 * mapa (DiagramaUnifilar, prop `sobre`): a leitura mais recente de vazão e
 * nível, a vazão e o nível médios de cada dia nos últimos 30 dias e a chuva por
 * radar da bacia dele, dia a dia e acumulada. Fecha no X, com Esc ou clicando
 * de novo no posto.
 */
export function GraficosPosto({ posto, data, tick, aoFechar }: { posto: NoSibh; data: string; tick: number; aoFechar: () => void }) {
  const g = useJson<Dados>(`/api/acesso/painel_interativo/posto?id=${posto.sibh.id}&data=${data}&t=${tick}`);
  const fechar = useRef<HTMLButtonElement>(null);
  const d = g.dados;
  const temVazao = !!d?.dias.some((x) => x.vazao !== null);
  const opDias = useMemo(() => (d ? opcaoPostoDias(d.dias) : null), [d]);
  const opChuva = useMemo(() => (d ? opcaoChuvaDias(d.dias) : null), [d]);
  const titulo = [posto.prefixo, posto.nome].filter(Boolean).join(' · ');
  const primeiroRadar = d?.dias.find((x) => x.chuva !== null)?.data;
  const ultimoDia = d?.dias.at(-1);

  // foco no botão de fechar (sem rolar a página) e Esc fecha; uma vez só (aoFechar muda a cada renderização da tela)
  const aoFecharAtual = useRef(aoFechar);
  aoFecharAtual.current = aoFechar;
  useEffect(() => {
    fechar.current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFecharAtual.current();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);

  return (
    <section className="un-sobre" role="dialog" aria-label={`Gráficos do posto ${titulo}`}>
      <header className="un-sobre-topo">
        <h4>
          <i className="bi bi-graph-up" aria-hidden /> Posto {titulo}
        </h4>
        <button type="button" ref={fechar} onClick={aoFechar} aria-label="Fechar os gráficos do posto" title="Fechar (Esc)">
          <i className="bi bi-x-lg" aria-hidden />
        </button>
      </header>
      <Estado carregando={g.carregando} erro={g.erro}>
        {d?.semDados && <p className="pi-erro">O SIBH não respondeu e não há cópia guardada deste posto.</p>}
        {d && (
          <p className="un-sobre-agora">
            {d.atual ? (
              <>
                Agora{d.atual.hora ? ` (${d.atual.hora.replace(':', 'h')})` : ''}:{temVazao && <b>vazão {fmt(d.atual.vazao, 2, ' m³/s')}</b>}
                <b>nível {fmt(d.atual.nivel, 2, ' m')}</b>
              </>
            ) : (
              <>
                Média de {ultimoDia ? dataBr(ultimoDia.data) : '—'}:{temVazao && <b>vazão {fmt(ultimoDia?.vazao, 2, ' m³/s')}</b>}
                <b>nível {fmt(ultimoDia?.nivel, 2, ' m')}</b>
              </>
            )}
          </p>
        )}
        <h5>{temVazao ? 'Vazão e nível' : 'Nível'} — média de cada dia, 30 dias</h5>
        {opDias && <EChart opcao={opDias} altura={temVazao ? 250 : 180} rotulo={`${temVazao ? 'Vazão e nível médios' : 'Nível médio'} de cada dia no posto ${titulo}`} />}
        {d && !temVazao && <p className="pi-nota">Este posto só mede nível (canal de jusante da barragem).</p>}
        <h5>Chuva por radar — {d?.radar?.nome ?? 'bacia do posto'}</h5>
        {opChuva && <EChart opcao={opChuva} altura={190} rotulo={`Chuva por radar de cada dia e acumulada na ${d?.radar?.nome ?? 'bacia'}`} />}
        <p className="pi-nota">
          SIBH, de {d ? `${dataBr(d.dias[0]!.data)} a ${dataBr(data)}` : '30 dias'} (hoje até a última leitura).
          {d?.radar && ` Radar: posto ${d.radar.prefixo}.`}
          {primeiroRadar && primeiroRadar > (d?.dias[0]?.data ?? '') && ` O radar só tem leituras no SIBH a partir de ${dataBr(primeiroRadar)}.`}
        </p>
      </Estado>
    </section>
  );
}
