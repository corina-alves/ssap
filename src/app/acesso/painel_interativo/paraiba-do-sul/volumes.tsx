'use client';

import { useMemo, useState } from 'react';
import type { VolumesParaiba } from '@/lib/hidrologia/paraiba-do-sul';
import { EChart, TEMA } from '../echart';
import { bissexto, COR_SERIE, dataBr, dias, DIAS_ANO, opcaoVolumeAnos, opcaoVolumesReservatorios } from '../graficos';
import { useAtualizacao } from '../usar-atualizacao';
import { Estado, useJson } from '../usar-json';

/**
 * Gráficos de volume dos reservatórios da bacia do Paraíba do Sul, abaixo do
 * diagrama: a evolução do volume útil de cada reservatório (30 dias, 90 dias ou
 * 12 meses) e o ano atual × os 4 anteriores (o equivalente ou um reservatório).
 * Dados: ONS, base diária (src/lib/hidrologia/paraiba-do-sul.ts, volumesParaiba).
 */

const API = '/api/acesso/painel_interativo/paraiba/volumes';
const PERIODOS = [
  { dias: 30, nome: '30 d' },
  { dias: 90, nome: '90 d' },
  { dias: 365, nome: '12 meses' },
];
/** Grupos da evolução: os quatro do equivalente (com ele) e os do RJ (Santa Cecília, Complexo de Lajes e Anta). */
const GRUPOS = [
  { chave: 'equivalente', nome: 'Reservatório equivalente' },
  { chave: 'rj', nome: 'Santa Cecília, Lajes e Anta' },
] as const;
const EQUIVALENTE = 'equivalente';
const NOME_EQUIVALENTE = 'Reservatório equivalente';

type Resposta = VolumesParaiba & { data: string; desatualizado: boolean };

export function GraficosVolumeParaiba({ data, hoje }: { data: string; hoje: string }) {
  const tick = useAtualizacao(data, hoje);
  const r = useJson<Resposta>(`${API}?data=${data}&t=${tick}`);
  const v = r.dados;
  const [periodo, setPeriodo] = useState(90);
  const [grupo, setGrupo] = useState<(typeof GRUPOS)[number]['chave']>('equivalente');
  const [local, setLocal] = useState(EQUIVALENTE);

  const datas = useMemo(() => (v ? dias(v.de, v.ate) : []), [v]);

  const opEvolucao = useMemo(() => {
    if (!v) return null;
    const i0 = Math.max(0, datas.length - periodo);
    const doGrupo = v.reservatorios.filter((x) => x.equivalente === (grupo === 'equivalente'));
    return opcaoVolumesReservatorios(datas.slice(i0), [
      ...(grupo === 'equivalente'
        ? [
            {
              nome: NOME_EQUIVALENTE,
              valores: v.equivalente.slice(i0),
              cor: TEMA.texto,
              destaque: true,
            },
          ]
        : []),
      ...doGrupo.map((x, k) => ({
        nome: x.nome,
        valores: (v.volumes[x.ons] ?? []).slice(i0),
        cor: COR_SERIE[k % COR_SERIE.length]!,
      })),
    ]);
  }, [v, datas, periodo, grupo]);

  const opAnos = useMemo(() => {
    if (!v) return null;
    const serie = local === EQUIVALENTE ? v.equivalente : (v.volumes[local] ?? []);
    const indice = new Map(datas.map((d, i) => [d, i]));
    const [a0, a1] = [Number(v.de.slice(0, 4)), Number(v.ate.slice(0, 4))];
    const valor = (d: string) => {
      const i = indice.get(d);
      return i === undefined ? null : (serie[i] ?? null);
    };
    const anos = Array.from({ length: a1 - a0 + 1 }, (_, k) => a0 + k).map((ano) => ({
      ano,
      valores: DIAS_ANO.map((mmdd) => {
        if (mmdd !== '02-29' || bissexto(ano)) return valor(`${ano}-${mmdd}`);
        // ano sem 29/02: a linha passa de 28/02 para 01/03 sem buraco
        const [a, b] = [valor(`${ano}-02-28`), valor(`${ano}-03-01`)];
        return a === null || b === null ? null : Math.round(((a + b) / 2) * 100) / 100;
      }),
    }));
    const limite =
      local === EQUIVALENTE
        ? {
            y: v.limiteEquivalente,
            texto: `${v.limiteEquivalente}%: acima dele, a Res. 1.382 admite aumentar as vazões`,
          }
        : null;
    // ano sem nenhum dado do reservatório (antes de o ONS publicar o volume dele) fica fora, também da legenda
    return opcaoVolumeAnos(
      anos.filter((a) => a.valores.some((x) => x !== null)),
      limite,
    );
  }, [v, datas, local]);

  // reservatórios com volume no ONS só a partir de uma data (Santa Cecília, Vigário): avisado na nota
  const desde = useMemo(() => {
    const m = new Map<string, string>();
    if (v)
      for (const x of v.reservatorios) {
        const i = (v.volumes[x.ons] ?? []).findIndex((y) => y !== null);
        if (i > 0) m.set(x.ons, datas[i]!);
      }
    return m;
  }, [v, datas]);
  const inicioPeriodo = datas[Math.max(0, datas.length - periodo)] ?? '';
  const tardios = (v?.reservatorios ?? []).filter((x) => x.equivalente === (grupo === 'equivalente') && (desde.get(x.ons) ?? '') > inicioPeriodo);
  const aviso = (nome: string, ons: string) => ` ${nome}: volume no ONS só desde ${dataBr(desde.get(ons)!)}.`;

  const nomeLocal = local === EQUIVALENTE ? NOME_EQUIVALENTE : (v?.reservatorios.find((x) => x.ons === local)?.nome ?? '');
  const ate = v ? dataBr(v.ate) : '';

  // dentro de .pi: as cores, os cartões e os botões do painel (como os gráficos do Cantareira)
  return (
    <div className="pi pv">
      <section className="pi-card" aria-label="Evolução do volume útil dos reservatórios">
        <div className="pi-card-topo">
          <h3>
            <i className="bi bi-graph-up" /> Evolução do volume útil — reservatórios
          </h3>
          <div className="pv-controles">
            <div className="pi-periodos" role="group" aria-label="Reservatórios">
              {GRUPOS.map((g) => (
                <button key={g.chave} type="button" className={grupo === g.chave ? 'is-ativo' : ''} aria-pressed={grupo === g.chave} onClick={() => setGrupo(g.chave)}>
                  {g.nome}
                </button>
              ))}
            </div>
            <div className="pi-periodos" role="group" aria-label="Período">
              {PERIODOS.map((p) => (
                <button key={p.dias} type="button" className={periodo === p.dias ? 'is-ativo' : ''} aria-pressed={periodo === p.dias} onClick={() => setPeriodo(p.dias)}>
                  {p.nome}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Estado carregando={r.carregando} erro={r.erro}>
          <EChart opcao={opEvolucao} altura={340} rotulo={`Volume útil dos reservatórios do Paraíba do Sul nos últimos ${PERIODOS.find((p) => p.dias === periodo)?.nome}`} />
        </Estado>
        <p className="pi-nota">
          ONS, base diária (dados consistidos, publicados com um dia de atraso)
          {ate && `: até ${ate}`}. Reservatório equivalente: Paraibuna, Santa Branca, Jaguari e Funil, média do volume útil ponderada pela capacidade de cada um (Resolução Conjunta ANA/DAEE/IGAM/INEA
          nº 1.382/2015).
          {grupo === 'rj' && ' Santa Cecília, Santana, Tocos e Anta são reservatórios pequenos: o volume útil oscila muito de um dia para o outro.'}
          {tardios.map((x) => aviso(x.nome, x.ons))}
          {v?.desatualizado && ' O ONS não respondeu agora: valores da última cópia guardada.'}
        </p>
      </section>

      <section className="pi-card" aria-label="Volume útil: ano atual e anos anteriores">
        <div className="pi-card-topo">
          <h3>
            <i className="bi bi-calendar3" /> Volume útil — {nomeLocal}: ano atual × anos anteriores
          </h3>
          <label className="pv-local">
            <span>Reservatório</span>
            <select value={local} onChange={(e) => setLocal(e.target.value)}>
              <option value={EQUIVALENTE}>{NOME_EQUIVALENTE}</option>
              {v?.reservatorios.map((x) => (
                <option key={x.ons} value={x.ons}>
                  {x.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Estado carregando={r.carregando} erro={r.erro}>
          <EChart opcao={opAnos} altura={340} rotulo={`Volume útil de ${nomeLocal} no ano atual e nos 4 anteriores, por dia do ano`} />
        </Estado>
        <p className="pi-nota">
          Cada linha é um ano, alinhado por dia e mês
          {ate && `; o atual vai até ${ate}`}. Clique no ano, na legenda, para esconder ou mostrar a linha.
          {local === EQUIVALENTE && ' Tracejada: o limite do equivalente na Resolução 1.382 (art. 1º, III e IV, c).'}
          {desde.has(local) && aviso(nomeLocal, local)}
        </p>
      </section>
    </div>
  );
}
