'use client';

import { useMemo } from 'react';
import { VD } from '@/conteudo/diagramas-unifilares';
import { EChart } from './echart';
import { PainelSobre } from './grafico-posto';
import { dataBr, dias as diasEntre, fmt, opcaoChuvaDias, opcaoVazoesDias, opcaoVolumeDias, type Ponto } from './graficos';
import { Estado, useJson } from './usar-json';

/** Um dia do gráfico de um reservatório; `chuva` só onde a fonte tem chuva na bacia (SSD). */
export type DiaReservatorio = {
  data: string;
  volumePct: number | null;
  volumeHm3: number | null;
  nivel: number | null;
  afluente: number | null;
  defluente: number | null;
  chuva?: number | null;
};

/**
 * Miolo do cartão de um reservatório clicado no diagrama: o dia mais recente com
 * dado e, nos 30 dias, o volume útil e as vazões afluente e defluente de cada
 * dia; a chuva na bacia (dia a dia e acumulada) quando houver.
 */
export function ResumoReservatorio({ dias, titulo }: { dias: DiaReservatorio[]; titulo: string }) {
  const opVolume = useMemo(() => opcaoVolumeDias(dias), [dias]);
  const opVazoes = useMemo(() => opcaoVazoesDias(dias), [dias]);
  const temVolume = dias.some((x) => x.volumePct !== null);
  const temVazao = dias.some((x) => x.afluente !== null || x.defluente !== null);
  const temChuva = dias.some((x) => x.chuva != null);
  const opChuva = useMemo(() => (temChuva ? opcaoChuvaDias(dias.map((x) => ({ data: x.data, chuva: x.chuva ?? null }))) : null), [dias, temChuva]);
  // as fontes publicam a média do dia com atraso: o último dia com volume ou vazão
  const ultimo = dias.findLast((x) => x.volumePct !== null || x.defluente !== null);

  return (
    <>
      {ultimo && (
        <p className="un-sobre-agora">
          {dataBr(ultimo.data)}:{ultimo.volumePct !== null && <b>volume útil {fmt(ultimo.volumePct, 2, '%')}</b>}
          {ultimo.volumeHm3 !== null && <b>{fmt(ultimo.volumeHm3, 2, ' hm³')}</b>}
          {ultimo.nivel !== null && <b>nível {fmt(ultimo.nivel, 2, ' m')}</b>}
          <b>afluente {fmt(ultimo.afluente, 2, ' m³/s')}</b>
          <b>defluente {fmt(ultimo.defluente, 2, ' m³/s')}</b>
        </p>
      )}
      {/* um gráfico por grandeza; o que a fonte não tem para este reservatório não aparece */}
      {temVolume && (
        <>
          <h5>Volume útil — cada dia, 30 dias</h5>
          <EChart opcao={opVolume} altura={190} rotulo={`Volume útil de cada dia — ${titulo}`} />
        </>
      )}
      {temVazao && (
        <>
          <h5>Vazões afluente e defluente — cada dia, 30 dias</h5>
          <EChart opcao={opVazoes} altura={190} rotulo={`Vazões afluente e defluente de cada dia — ${titulo}`} />
        </>
      )}
      {opChuva && (
        <>
          <h5>Chuva na bacia — cada dia e acumulada</h5>
          <EChart opcao={opChuva} altura={190} rotulo={`Chuva na bacia de ${titulo}: cada dia e acumulada`} />
        </>
      )}
    </>
  );
}

const API_SERIES = '/api/acesso/painel_interativo/series';

/** AAAA-MM-DD menos n dias. */
const diasAntes = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - n);
  return x.toISOString().slice(0, 10);
};

/**
 * Cartão de um reservatório do SSD clicado num diagrama dos sistemas produtores:
 * as séries diárias do SSD (volume útil em % e hm³, nível, vazões afluente e
 * defluente e chuva na bacia) dos 30 dias até a data. Fecha no X, com Esc ou
 * clicando de novo no reservatório.
 */
export function GraficosReservatorioSsd({ space, titulo, data, tick, semChuva = false, aoFechar }: { space: number; titulo: string; data: string; tick: number; semChuva?: boolean; aoFechar: () => void }) {
  const de = diasAntes(data, 29);
  const variaveis = [VD.volumePct, VD.volumeHm3, VD.nivel, VD.afluente, VD.defluente, ...(semChuva ? [] : [VD.chuva])];
  const g = useJson<{ series: Record<string, Ponto[]> }>(`${API_SERIES}?de=${de}&ate=${data}&${variaveis.map((v) => `s=${space}:${v}`).join('&')}&t=${tick}`);
  const series = g.dados?.series;
  const dias = useMemo<DiaReservatorio[] | null>(() => {
    if (!series) return null;
    const mapa = (v: number) => new Map((series[`${space}:${v}`] ?? []).map((p) => [p.data, p.valor]));
    const [pct, hm3, nivel, aflu, deflu, chuva] = [VD.volumePct, VD.volumeHm3, VD.nivel, VD.afluente, VD.defluente, VD.chuva].map(mapa);
    return diasEntre(de, data).map((d) => ({
      data: d,
      volumePct: pct!.get(d) ?? null,
      volumeHm3: hm3!.get(d) ?? null,
      nivel: nivel!.get(d) ?? null,
      afluente: aflu!.get(d) ?? null,
      defluente: deflu!.get(d) ?? null,
      chuva: semChuva ? undefined : (chuva!.get(d) ?? null),
    }));
  }, [series, space, de, data, semChuva]);
  const vazio = dias !== null && !dias.some((x) => x.volumePct !== null || x.defluente !== null || x.chuva != null);

  return (
    <PainelSobre titulo={titulo} rotulo={`Gráficos do reservatório ${titulo}`} icone="bi-water" aoFechar={aoFechar}>
      <Estado carregando={g.carregando} erro={g.erro}>
        {vazio && <p className="pi-erro">O SSD não tem dados deste reservatório nos últimos 30 dias.</p>}
        {dias && !vazio && <ResumoReservatorio dias={dias} titulo={titulo} />}
        <p className="pi-nota">
          SSD SP Águas (médias diárias), de {dataBr(de)} a {dataBr(data)}.
        </p>
      </Estado>
    </PainelSobre>
  );
}
