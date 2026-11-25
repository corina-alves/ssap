'use client';

import { useMemo } from 'react';
import type { GraficosPluviometro as DadosPluviometro, GraficosReservatorio as DadosReservatorio } from '@/lib/hidrologia/paraiba-do-sul';
import { EChart } from '../echart';
import { PainelSobre } from '../grafico-posto';
import { ResumoReservatorio } from '../grafico-reservatorio';
import { dataBr, fmt, opcaoChuvaDias } from '../graficos';
import { Estado, useJson } from '../usar-json';

/**
 * Gráficos de um reservatório (ou elevatória) do ONS clicado no diagrama do
 * Paraíba do Sul: o dia mais recente com dado e, nos 30 dias até a data, o volume
 * útil e as vazões afluente e defluente de cada dia. No mesmo painel sobre o
 * mapa dos gráficos de posto (fecha no X, com Esc ou clicando de novo).
 */
export function GraficosReservatorio({ url, titulo, tick, aoFechar }: { url: string; titulo: string; tick: number; aoFechar: () => void }) {
  const g = useJson<DadosReservatorio>(`${url}&t=${tick}`);
  const d = g.dados;

  return (
    <PainelSobre titulo={titulo} rotulo={`Gráficos do reservatório ${titulo}`} icone="bi-water" aoFechar={aoFechar}>
      <Estado carregando={g.carregando} erro={g.erro}>
        {d?.semDados && <p className="pi-erro">O ONS não respondeu e não há cópia guardada.</p>}
        {d && <ResumoReservatorio dias={d.dias} titulo={titulo} />}
        <p className="pi-nota">
          ONS (dados diários, publicados com um dia de atraso), de {d ? `${dataBr(d.dias[0]!.data)} a ${dataBr(d.data)}` : '30 dias'}.
          {d?.capacidade ? ` Volume útil total: ${fmt(d.capacidade, 2, ' hm³')}.` : ''}
          {d?.tipo === 'elevatoria' ? ' Elevatória: o volume útil é pequeno e varia muito no dia.' : ''}
          {d?.desatualizado ? ' O ONS não respondeu agora: dados da última cópia guardada.' : ''}
        </p>
      </Estado>
    </PainelSobre>
  );
}

/**
 * Gráfico de um pluviômetro do SIBH clicado no diagrama do Paraíba do Sul: chuva
 * de cada dia nos 30 dias até a data e a acumulada no período.
 */
export function GraficosPluviometro({ url, titulo, tick, aoFechar }: { url: string; titulo: string; tick: number; aoFechar: () => void }) {
  const g = useJson<DadosPluviometro>(`${url}&t=${tick}`);
  const d = g.dados;
  const op = useMemo(() => (d ? opcaoChuvaDias(d.dias) : null), [d]);
  const doDia = d?.dias.at(-1)?.chuva ?? null;
  const total = d ? d.dias.reduce((s, x) => s + (x.chuva ?? 0), 0) : null;
  const comDado = d ? d.dias.filter((x) => x.chuva !== null).length : 0;
  const rotulo = `Gráfico de chuva do pluviômetro ${titulo}`;

  return (
    <PainelSobre titulo={`Pluviômetro ${titulo}`} rotulo={rotulo} icone="bi-cloud-rain" aoFechar={aoFechar}>
      <Estado carregando={g.carregando} erro={g.erro}>
        {d?.semDados && <p className="pi-erro">O SIBH não respondeu e não há cópia guardada deste pluviômetro.</p>}
        {d && !d.semDados && (
          <p className="un-sobre-agora">
            {d.hora ? `Hoje até ${d.hora.replace(':', 'h')}` : dataBr(d.data)}:<b>{fmt(doDia, 1, ' mm')}</b>
            30 dias:<b>{fmt(total, 1, ' mm')}</b>
          </p>
        )}
        <h5>Chuva de cada dia e acumulada — 30 dias</h5>
        {op && <EChart opcao={op} altura={210} rotulo={`Chuva de cada dia e acumulada — ${titulo}`} />}
        <p className="pi-nota">
          SIBH{d?.municipio ? ` · ${d.municipio}` : ''}, de {d ? `${dataBr(d.dias[0]!.data)} a ${dataBr(d.data)}` : '30 dias'} (hoje até a última leitura).
          {d && comDado < d.dias.length ? ` ${d.dias.length - comDado} dia(s) sem leitura do pluviômetro ficam em branco.` : ''}
        </p>
      </Estado>
    </PainelSobre>
  );
}
