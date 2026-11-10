'use client';

import { useEffect, useMemo, useState } from 'react';
import { paresDoDiagrama, VD, type Diagrama, type No } from '@/conteudo/diagramas-unifilares';
import { BASES, type NomeBase } from './bases-mapa';
import { DesenhoNoMapa } from './desenho-mapa';
import { MapaUnifilar } from './mapa-unifilar';
import { COR, ESTILO_LINHA, Ponto, Reservatorio, Rotulo, setas, TextoValor } from './simbolos-unifilar';
import { COR_FAIXA, duracaoFluxo, texto, valorDe, type Modo, type ValoresSsd } from './valores-ssd';

/**
 * Diagrama unifilar de um sistema produtor no tema escuro do painel: rios e
 * túneis tracejados com o sentido do escoamento, reservatórios com o nível de
 * água pelo volume útil, e os valores do SSD na data escolhida. Os modos
 * mostram vazões, volume (hm³), nível (m) ou chuva sobre o mesmo desenho.
 * Com mapa de fundo (desenho-mapa.tsx), os mesmos símbolos e valores
 * (simbolos-unifilar.tsx) vão para o lugar real e os rios seguem o traçado
 * deles; "Sem mapa" mostra o esquema.
 */

export type { Modo, ValoresSsd };

export const MODOS: { modo: Modo; rotulo: string; icone: string }[] = [
  { modo: 'vazao', rotulo: 'Vazão', icone: 'bi-water' },
  { modo: 'volume', rotulo: 'Volume', icone: 'bi-database' },
  { modo: 'nivel', rotulo: 'Nível', icone: 'bi-rulers' },
  { modo: 'chuva', rotulo: 'Chuva', icone: 'bi-cloud-rain' },
];

/** O desenho em si (sem busca de dados): serve também para testes e exportação. */
export function DesenhoUnifilar({
  d,
  valores,
  data,
  modo,
  destaque,
  aoEscolher,
  classe = 'un-svg',
}: {
  d: Diagrama;
  valores: ValoresSsd;
  data: string;
  modo: Modo;
  destaque?: number | null;
  aoEscolher?: (space: number) => void;
  classe?: string;
}) {
  const vazoes = modo === 'vazao';
  // vazão de um ponto (EEAB, UHE): a dele ou a da ligação que começa ou termina nele
  const vazaoNo = (n: Exclude<No, { tipo: 'reservatorio' }>) =>
    n.valor
      ? valorDe(valores, n.valor)
      : valorDe(valores, d.ligacoes.find((l) => l.valor && [l.pontos[0], l.pontos.at(-1)].some((p) => p && Math.hypot(p[0] - n.x, p[1] - n.y) < 24))?.valor);
  return (
    <svg className={classe} viewBox={`0 0 ${d.largura} ${d.altura}`} role="img" aria-label={`Diagrama unifilar — ${d.titulo}`}>
      <defs>
        <linearGradient id="un-agua" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fc3f7" />
          <stop offset="1" stopColor="#0b5fbf" />
        </linearGradient>
      </defs>
      {/* água correndo no sentido do escoamento (ordem dos pontos); vazão zero: trecho parado e apagado */}
      <g className="un-linhas">
        {d.ligacoes.map((l, i) => {
          const e = ESTILO_LINHA[l.tipo];
          const q = valorDe(valores, l.valor);
          const parado = q !== null && q <= 0;
          const pontos = l.pontos.map((p) => p.join(',')).join(' ');
          return (
            <g key={i} className={parado ? 'un-parado' : undefined}>
              <polyline points={pontos} fill="none" stroke={e.cor} strokeWidth={e.largura + 5} strokeOpacity={0.13} strokeLinecap="round" strokeLinejoin="round" />
              <polyline
                points={pontos}
                fill="none"
                stroke={e.cor}
                strokeWidth={e.largura}
                strokeDasharray={e.traco}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={parado ? undefined : `un-fluxo un-fluxo--${l.tipo}`}
                style={parado ? undefined : { animationDuration: `${duracaoFluxo(e.passo, q).toFixed(2)}s` }}
              />
              {setas(l, e.cor)}
            </g>
          );
        })}
      </g>
      {d.ligacoes.map((l, i) => (
        <g key={i}>
          {l.rotulo && <Rotulo t={l.rotulo} />}
          {l.valor && <TextoValor v={l.valor} valores={valores} data={data} mostrar={vazoes} />}
        </g>
      ))}
      {(d.valores ?? []).map((v, i) => (
        <TextoValor key={i} v={v} valores={valores} data={data} mostrar={vazoes} />
      ))}
      {(d.textos ?? []).map((t, i) => (
        <Rotulo key={i} t={t} />
      ))}
      {d.nos.map((n, i) =>
        n.tipo === 'reservatorio' ? (
          <Reservatorio key={i} n={n} valores={valores} data={data} modo={modo} ativo={destaque === n.space} aoEscolher={aoEscolher} />
        ) : (
          <Ponto key={i} n={n} valores={valores} data={data} modo={modo} vazao={n.tipo === 'eeab' || n.tipo === 'uhe' ? vazaoNo(n) : null} />
        ),
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- com dados

/** Valores do SSD de todos os campos do diagrama, na data (refeito a cada `tick`). */
function useValoresSsd(d: Diagrama, data: string, tick: number) {
  const [st, setSt] = useState<{ valores: ValoresSsd; carregando: boolean; erro?: string }>({ valores: {}, carregando: true });
  const pares = useMemo(() => paresDoDiagrama(d).join(','), [d]);

  useEffect(() => {
    let vivo = true;
    setSt((s) => ({ valores: s.valores, carregando: true }));
    fetch(`/api/acesso/painel_interativo/valores?data=${data}&p=${pares}&t=${tick}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return ((await r.json()) as { valores: ValoresSsd }).valores;
      })
      .then(
        (valores) => vivo && setSt({ valores, carregando: false }),
        (e: Error) => vivo && setSt({ valores: {}, carregando: false, erro: e.message }),
      );
    return () => {
      vivo = false;
    };
  }, [pares, data, tick]);

  return st;
}

function BotoesModo({ modo, aoMudar }: { modo: Modo; aoMudar: (m: Modo) => void }) {
  return (
    <div className="un-modos" role="group" aria-label="O que mostrar no diagrama">
      {MODOS.map((m) => (
        <button key={m.modo} type="button" className={modo === m.modo ? 'is-ativo' : ''} onClick={() => aoMudar(m.modo)} aria-pressed={modo === m.modo}>
          <i className={`bi ${m.icone}`} /> {m.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Faixas do volume útil (as cores de COR_FAIXA). */
const FAIXAS: [number, string][] = [
  [60, '≥ 60%'],
  [40, '40–60%'],
  [30, '30–40%'],
  [20, '20–30%'],
  [0, '< 20%'],
];

/** Legenda; com mapa, o rio é a linha cheia pelo traçado real (desenho-mapa.tsx). */
function Legenda({ nota, comMapa }: { nota: string; comMapa: boolean }) {
  return (
    <div className="un-legenda" aria-label="Legenda">
      {comMapa ? (
        <span>
          <svg width="34" height="12" aria-hidden>
            <line x1="2" y1="6" x2="32" y2="6" stroke="rgba(6,16,28,.55)" strokeWidth="7.5" strokeLinecap="round" />
            <line x1="2" y1="6" x2="32" y2="6" stroke="#1f8fff" strokeWidth="4" strokeLinecap="round" />
            <polygon points="4,0 -6,-5.5 -3,0 -6,5.5" fill="#fff" transform="translate(19 6)" />
          </svg>
          Rio (traçado real, no sentido da água)
        </span>
      ) : (
        <span>
          <svg width="34" height="10" aria-hidden>
            <line x1="1" y1="5" x2="33" y2="5" stroke={COR.rio} strokeWidth="3" strokeDasharray="9 6" className="un-fluxo un-fluxo--rio" />
          </svg>
          Rio / canal
        </span>
      )}
      <span>
        <svg width="34" height="10" aria-hidden>
          <line x1="1" y1="5" x2="33" y2="5" stroke={COR.tunel} strokeWidth="2.2" strokeDasharray="3 5" className="un-fluxo un-fluxo--tunel" />
        </svg>
        Túnel / transferência
      </span>
      <span>
        <svg width="34" height="10" aria-hidden>
          <line x1="1" y1="5" x2="33" y2="5" stroke={COR.aducao} strokeWidth="2.2" strokeDasharray="12 4 2 4" className="un-fluxo un-fluxo--aducao" />
        </svg>
        Adução para ETA
      </span>
      <span>
        <svg width="34" height="10" aria-hidden className="un-parado">
          <line x1="1" y1="5" x2="33" y2="5" stroke={COR.rio} strokeWidth="3" strokeDasharray="9 6" />
        </svg>
        Sem vazão no dia (parado)
      </span>
      <span>
        <svg width="26" height="16" viewBox="-12 -8 24 16" aria-hidden>
          <circle r="6" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.6" />
        </svg>
        Posto fluviométrico
      </span>
      <span>
        <svg width="34" height="16" viewBox="-74 -24 156 48" aria-hidden>
          <polygon points="-52,-20 78,-20 52,20 -52,20" fill="url(#un-agua)" stroke={COR.contorno} strokeWidth="3" />
        </svg>
        Reservatório (volume útil)
      </span>
      <span>
        <svg width="22" height="22" viewBox="-15 -15 30 30" aria-hidden>
          <circle r="13" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.8" />
          <circle r="4" fill={COR.contorno} />
        </svg>
        EEAB (elevatória de água bruta)
      </span>
      <span>
        <svg width="30" height="22" viewBox="-19 -13 38 26" aria-hidden>
          <rect x="-18" y="-12" width="36" height="24" rx="3" fill={COR.fundoSimbolo} stroke={COR.contorno} strokeWidth="1.8" />
        </svg>
        ETA
      </span>
      <span>
        Nº da represa: volume útil
        {FAIXAS.map(([p, t]) => (
          <span key={p} className="un-legenda-faixa">
            <i style={{ background: COR_FAIXA(p) }} />
            {t}
          </span>
        ))}
      </span>
      <span className="un-legenda-nota">{nota}</span>
    </div>
  );
}

const BASE_PADRAO: NomeBase = 'Satélite';

const NOTA_FONTE = 'Vazões médias diárias (SSD SP Águas)';
const NOTA_ANTIGOS = '* último dado disponível, anterior à data escolhida';

/** Diagrama com os valores do SSD na data, os botões de modo, as barras de volume e a legenda. */
export function DiagramaUnifilar({
  d,
  data,
  tick = 0,
  destaque,
  aoEscolher,
}: {
  d: Diagrama;
  data: string;
  tick?: number;
  destaque?: number | null;
  aoEscolher?: (space: number) => void;
}) {
  const [modo, setModo] = useState<Modo>('vazao');
  const [base, setBase] = useState<NomeBase | null>(BASE_PADRAO);
  const [hidro, setHidro] = useState(true);
  const st = useValoresSsd(d, data, tick);
  const reservatorios = d.nos.filter((n): n is Extract<No, { tipo: 'reservatorio' }> => n.tipo === 'reservatorio');
  const antigos = Object.values(st.valores).some((v) => v && v.data < data);

  return (
    <div className="un">
      <div className="un-topo">
        <BotoesModo modo={modo} aoMudar={setModo} />
        <div className="mu-grupo un-bases" role="group" aria-label="Mapa de fundo">
          <span>Mapa de fundo</span>
          {[null, ...BASES.map((b) => b.nome)].map((nome) => (
            <button key={nome ?? 'nenhum'} type="button" className={base === nome ? 'is-ativo' : ''} aria-pressed={base === nome} onClick={() => setBase(nome)}>
              {nome ?? 'Sem mapa'}
            </button>
          ))}
          {base && (
            <button type="button" className={`un-hidro${hidro ? ' is-ativo' : ''}`} aria-pressed={hidro} onClick={() => setHidro((h) => !h)} title="Rios principais e represas do sistema (IBGE e OpenStreetMap)">
              <i className="bi bi-water" aria-hidden /> Hidrografia
            </button>
          )}
        </div>
        {st.carregando && <span className="un-status">Atualizando valores…</span>}
        {st.erro && <span className="un-status is-erro">Valores indisponíveis ({st.erro}).</span>}
      </div>
      <div className="un-corpo">
        <div className={`un-desenho${st.carregando ? ' is-carregando' : ''}${base ? ` com-mapa com-mapa--${base === 'Escuro' ? 'escuro' : base === 'Satélite' ? 'satelite' : 'claro'}` : ''}`}>
          {base ? (
            <MapaUnifilar d={d} base={base} hidro={hidro}>
              {(v) => <DesenhoNoMapa d={d} {...v} valores={st.valores} data={data} modo={modo} destaque={destaque} aoEscolher={aoEscolher} />}
            </MapaUnifilar>
          ) : (
            <DesenhoUnifilar d={d} valores={st.valores} data={data} modo={modo} destaque={destaque} aoEscolher={aoEscolher} />
          )}
        </div>
        {reservatorios.length > 0 && (
          <aside className="un-volumes" aria-label="Volumes dos reservatórios">
            <h4>Volumes dos reservatórios</h4>
            {reservatorios.map((r) => {
              const p = st.valores[`${r.space}:${VD.volumePct}`]?.valor ?? null;
              return (
                <button key={r.space} type="button" className={`un-barra${destaque === r.space ? ' is-ativo' : ''}`} onClick={() => aoEscolher?.(r.space)}>
                  <span className="un-barra-nome">{r.nome}</span>
                  <span className="un-barra-trilho">
                    <span style={{ width: `${Math.max(0, Math.min(100, p ?? 0))}%`, background: COR_FAIXA(p) }} />
                  </span>
                  <b>{texto(st.valores, r.space, VD.volumePct, data)}</b>
                </button>
              );
            })}
            <p>Clique num reservatório para ver os gráficos dele.</p>
          </aside>
        )}
      </div>
      <Legenda nota={antigos ? `${NOTA_FONTE} · ${NOTA_ANTIGOS}` : NOTA_FONTE} comMapa={!!base} />
      {d.notas?.length ? (
        <ul className="un-notas">
          {d.notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
