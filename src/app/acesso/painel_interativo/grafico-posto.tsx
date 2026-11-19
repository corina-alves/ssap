'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { GraficosPosto as DadosSibh } from '@/lib/hidrologia/cantareira-operacao';
import { EChart } from './echart';
import { dataBr, fmt, opcaoChuvaDias, opcaoPostoDias } from './graficos';
import { Estado, useJson } from './usar-json';

/**
 * Dados dos gráficos de um posto: os do SIBH (cantareira-operacao.ts) ou os de
 * uma estação da ANA no mesmo formato, com `fonte` e a chuva do próprio
 * pluviômetro da estação (`chuvaDoPosto`) no lugar da chuva por radar.
 */
export type DadosPosto = DadosSibh & { fonte?: string; chuvaDoPosto?: boolean };

/**
 * Gráficos de um posto clicado no diagrama unifilar, num painel sobre o mapa
 * (DiagramaUnifilar, prop `sobre`): a leitura mais recente de vazão e nível, a
 * vazão e o nível médios de cada dia nos últimos 30 dias e a chuva (por radar
 * na bacia do posto, no SIBH; no pluviômetro da estação, na ANA), dia a dia e
 * acumulada. Fecha no X, com Esc ou clicando de novo no posto. `url`: a API do
 * posto, já com o posto e a data (o `tick` vai junto, para atualizar).
 */
export function GraficosPosto({ url, titulo, tick, aoFechar }: { url: string; titulo: string; tick: number; aoFechar: () => void }) {
  const g = useJson<DadosPosto>(`${url}&t=${tick}`);
  const fechar = useRef<HTMLButtonElement>(null);
  const d = g.dados;
  const fonte = d?.fonte ?? 'SIBH';
  const temVazao = !!d?.dias.some((x) => x.vazao !== null);
  const opDias = useMemo(() => (d ? opcaoPostoDias(d.dias) : null), [d]);
  const opChuva = useMemo(() => (d ? opcaoChuvaDias(d.dias) : null), [d]);
  const primeiroRadar = d?.radar ? d.dias.find((x) => x.chuva !== null)?.data : undefined;
  const ultimoDia = d?.dias.at(-1);
  // chuva: por radar (postos do SIBH dos sistemas produtores), do pluviômetro da estação (ANA) ou nenhuma
  const chuva = !d ? 'radar' : d.radar ? 'radar' : d.chuvaDoPosto ? 'posto' : null;
  const tituloChuva = chuva === 'posto' ? 'Chuva no pluviômetro da estação' : `Chuva por radar — ${d?.radar?.nome ?? 'bacia do posto'}`;

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
        {d?.semDados && <p className="pi-erro">{fonte === 'SIBH' ? 'O SIBH' : `A fonte (${fonte})`} não respondeu e não há cópia guardada deste posto.</p>}
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
        {d && !temVazao && <p className="pi-nota">{d.radar ? 'Este posto só mede nível (canal de jusante da barragem).' : 'Este posto só mede nível.'}</p>}
        {chuva && (
          <>
            <h5>{tituloChuva}</h5>
            {opChuva && <EChart opcao={opChuva} altura={190} rotulo={`${tituloChuva}: chuva de cada dia e acumulada`} />}
          </>
        )}
        <p className="pi-nota">
          {fonte}, de {d ? `${dataBr(d.dias[0]!.data)} a ${dataBr(d.data)}` : '30 dias'} (hoje até a última leitura).
          {d?.radar && ` Radar: posto ${d.radar.prefixo}.`}
          {primeiroRadar && primeiroRadar > (d?.dias[0]?.data ?? '') && ` O radar só tem leituras no SIBH a partir de ${dataBr(primeiroRadar)}.`}
        </p>
      </Estado>
    </section>
  );
}
