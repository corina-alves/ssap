import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecalho, Mensagem } from '@/components/acesso/pecas';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { exigirSala } from '@/lib/auth/acl';
import { dataBr } from '@/lib/formato';
import { PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { MESES, periodoDoMes, ROTULO_PERIODO, SISTEMAS, volumesEspera, type Faixa, type Periodo } from '@/lib/hidrologia/volumes-espera';
import { hojeSp } from '@/lib/integracoes/comum';
import { GraficoVolumesEspera } from '../graficos';
import { LinhaClicavel } from '../linha-clicavel';
import '@/styles/acesso/acompanhamento.css';

export const metadata: Metadata = { title: 'Volumes de espera e operacional' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const num = (v: number | null | undefined, casas = 1) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
/** Um valor, ou "mín.–máx." quando muda de mês a mês no período. */
const fx = (f: Faixa) => (!f ? '—' : f.min === f.max ? num(f.min) : `${num(f.min)}–${num(f.max)}`);
const espera = (f: Faixa): Faixa => (f ? { min: Math.round((100 - f.max) * 10) / 10, max: Math.round((100 - f.min) * 10) / 10 } : null);

/** Situação do volume atual × operacional do mês. */
function Situacao({ atual, limite }: { atual: number | null; limite: number | null }) {
  if (atual === null || limite === null) return <>—</>;
  return atual > limite ? (
    <span className="acp-situacao acp-situacao--acima" title={`Acima do operacional do mês (${num(limite)}%): ocupa o volume de espera.`}>
      <i className="bi bi-exclamation-triangle-fill" /> Acima do operacional
    </span>
  ) : (
    <span className="acp-situacao" title={`Operacional do mês: ${num(limite)}%.`}>
      <i className="bi bi-check-circle-fill" /> Dentro do operacional
    </span>
  );
}

/**
 * Acompanhamento — volumes de espera e operacional dos sistemas produtores.
 * Só o Cantareira tem os períodos chuvoso (dez–mai) e seco (jun–nov); nos
 * outros, cartões e tabela mostram o mês atual. Clicar num reservatório da
 * tabela troca o gráfico pelo dele (?reservatorio=). Mesmo acesso do Painel
 * interativo: visualizar_dashboard na Sala Alfredo Pisani.
 */
export default async function VolumesEspera({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSala(SALA_PAINEL, PERMISSAO_PAINEL);
  const sp = await searchParams;
  const sistema = SISTEMAS[um(sp.sistema)] ? um(sp.sistema) : 'cantareira';
  const def = SISTEMAS[sistema]!;
  const hoje = hojeSp();
  const mesAtual = Number(hoje.slice(5, 7));
  const atual = periodoDoMes(mesAtual);
  const { linhas, meses, totais, totaisMes, mensal, capacidadeHm3 } = await volumesEspera(sistema, hoje);
  const leitura = linhas.map((l) => l.dataAtual).filter(Boolean).sort().at(-1);
  const falhas = linhas.filter((l) => l.erro);
  const varia = linhas.some((l) => l.periodo.chuvoso?.min !== l.periodo.chuvoso?.max || l.periodo.seco?.min !== l.periodo.seco?.max);
  /** operacional que muda de mês a mês (Guarapiranga): os rótulos citam o mês */
  const mensalVaria = linhas.some((l) => l.operacional.some((v) => v !== l.operacional[0]));
  const doMes = mensalVaria ? ` • ${MESES[mesAtual - 1]}` : '';
  const selecionado = linhas.find((l) => l.nome === um(sp.reservatorio)) ?? null;
  const href = (r?: string) => `?sistema=${sistema}${r ? `&reservatorio=${encodeURIComponent(r)}` : ''}`;

  const cartao = (rotulo: string, p: Periodo, tipo: 'espera' | 'operacional') => {
    const t = totais?.[p][tipo];
    return (
      <div className={`acp-cartao acp-cartao--${tipo}${p === atual ? ' acp-cartao--atual' : ''}`}>
        <span className="acp-cartao__rotulo">
          {rotulo} • {ROTULO_PERIODO[p]}
          {p === atual && <em>período atual</em>}
        </span>
        <strong>{fx(t?.hm3 ?? null)} hm³</strong>
        <span className="acp-cartao__pct">{fx(t?.pct ?? null)}%</span>
      </div>
    );
  };
  const cartaoMes = (rotulo: string, tipo: 'espera' | 'operacional') => (
    <div className={`acp-cartao acp-cartao--${tipo}`}>
      <span className="acp-cartao__rotulo">
        {rotulo}
        {doMes}
      </span>
      <strong>{num(tipo === 'espera' ? totaisMes?.esperaHm3 : totaisMes?.operacionalHm3)} hm³</strong>
      <span className="acp-cartao__pct">{num(tipo === 'espera' ? totaisMes?.esperaPct : totaisMes?.operacionalPct)}%</span>
    </div>
  );

  // gráficos: o do reservatório clicado na tabela e, abaixo dele, o do sistema (sempre)
  const graficos = [
    selecionado && { chave: 'reservatorio', titulo: selecionado.nome, volume: selecionado.mensal.volume, anterior: selecionado.mensal.volumeAnterior, operacional: selecionado.operacional },
    mensal && { chave: 'sistema', titulo: `Sistema ${def.nome}`, volume: mensal.volume, anterior: mensal.volumeAnterior, operacional: mensal.operacional },
  ].filter((g) => !!g);

  return (
    <>
      <Cabecalho
        titulo={`Sistema ${def.nome} — volumes de espera e operacional`}
        subtitulo={`${def.periodos ? 'Os volumes de espera e operacionais variam conforme o período do ano.' : 'Volumes de espera e operacionais do mês atual.'}${leitura ? ` Volume atual: leitura do SSD de ${dataBr(leitura)}.` : ''}`}
        trilha={[
          ['Início', '/acesso'],
          ['Acompanhamento', null],
          ['Volumes de espera e operacional', null],
        ]}
      />

      <form className="acesso-card mb-3 row g-2 align-items-end mx-0" method="get">
        <div className="col-md-4">
          <label className="form-label small" htmlFor="sistema">
            Sistema
          </label>
          <SelectAutoEnvio className="form-select" id="sistema" name="sistema" defaultValue={sistema}>
            {Object.entries(SISTEMAS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.nome}
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
      </form>

      {falhas.length > 0 && (
        <Mensagem tipo="aviso">
          O SSD não respondeu para {falhas.map((l) => l.nome).join(', ')}: os totais e o gráfico do sistema ficam sem valor até a próxima leitura.
        </Mensagem>
      )}

      {/* Cartões: volume útil total e volume de espera. Os do operacional estão ocultos; para voltar,
          {cartao('Operacional', 'chuvoso' | 'seco', 'operacional')} ou {cartaoMes('Operacional', 'operacional')}. */}
      <div className={`acp-cartoes${def.periodos ? '' : ' acp-cartoes--mes'}`}>
        <div className="acp-cartao acp-cartao--sistema">
          <span className="acp-cartao__rotulo">Volume útil total</span>
          <strong>{num(capacidadeHm3)} hm³</strong>
        </div>
        {def.periodos ? (
          <>
            {cartao('Volume de espera', 'chuvoso', 'espera')}
            {cartao('Volume de espera', 'seco', 'espera')}
          </>
        ) : (
          cartaoMes('Volume de espera', 'espera')
        )}
      </div>

      <div className="acesso-card acp-tabela mb-3">
        <p className="acp-nota mt-0 mb-2">
          <i className="bi bi-hand-index" /> Clique num reservatório para ver o gráfico dele, acima do gráfico do sistema.
        </p>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr className="acp-titulos">
                <th rowSpan={2}>Reservatório</th>
                <th className="text-end">Volume total</th>
                {def.periodos ? (
                  <>
                    <th className="text-end">Espera dez–mai</th>
                    <th className="text-end">Oper. dez–mai</th>
                    <th className="text-end">Espera jun–nov</th>
                    <th className="text-end">Oper. jun–nov</th>
                    <th className="text-end">Oper. do mês</th>
                  </>
                ) : (
                  <>
                    <th className="text-end">Espera{doMes}</th>
                    <th className="text-end">Operacional{doMes}</th>
                  </>
                )}
                {/* Oculta: <th className="text-end">Volume atual</th> */}
                <th rowSpan={2}>Situação no mês</th>
              </tr>
              {/* unidade de cada coluna (hm³, %, m³/s...) */}
              <tr className="acp-unidades">
                <th className="text-center">hm³</th>
                {Array.from({ length: def.periodos ? 5 : 2 }, (_, i) => (
                  <th key={i} className="text-center">
                    %
                  </th>
                ))}
                {/* Oculta: <th className="text-center">%</th> (volume atual) */}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const operMes = l.operacional[mesAtual - 1] ?? null;
                return (
                  <LinhaClicavel key={l.nome} href={href(l.nome)} ativa={selecionado?.nome === l.nome}>
                    <th scope="row">
                      <Link href={href(l.nome)} scroll={false}>
                        {l.nome}
                      </Link>
                    </th>
                    <td className="text-end">{num(l.utilHm3)}</td>
                    {def.periodos ? (
                      <>
                        <td className="text-end">{fx(espera(l.periodo.chuvoso))}</td>
                        <td className="text-end">{fx(l.periodo.chuvoso)}</td>
                        <td className="text-end">{fx(espera(l.periodo.seco))}</td>
                        <td className="text-end">{fx(l.periodo.seco)}</td>
                        <td className="text-end">{num(l.limiteMes)}</td>
                      </>
                    ) : (
                      <>
                        <td className="text-end">{num(operMes === null ? null : 100 - operMes)}</td>
                        <td className="text-end">{num(operMes)}</td>
                      </>
                    )}
                    {/* Oculta (a situação no mês continua usando o volume atual):
                    <td className="text-end fw-semibold">{num(l.atualPct)}</td> */}
                    <td>
                      <Situacao atual={l.atualPct} limite={l.limiteMes} />
                    </td>
                  </LinhaClicavel>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="acp-nota">
          Operacional (%): planilha de volumes operacionais mensais. Espera (%) = 100 − operacional.
          {def.periodos && varia && ' Faixas (mín.–máx.) quando o operacional muda de mês a mês no período.'} Volume total e volume atual (usado na
          situação do mês): SSD SP Águas.
        </p>
        <dl className="acp-legenda">
          <dt>Volume útil total</dt>
          <dd>Volume de água disponível para utilização no reservatório.</dd>
          <dt>Volume de espera</dt>
          <dd>Volume do reservatório mantido vazio para armazenar água durante períodos de cheias.</dd>
          <dt>Volume operacional</dt>
          <dd>Volume de água utilizado na operação do reservatório.</dd>
        </dl>
      </div>

      {graficos.map((g) => (
        <div key={g.chave} className="acesso-card acp-grafico-cartao mb-3" id={`grafico-${g.chave}`}>
          <div className="acp-grafico-cabeca">
            <h2>Volume útil × operacional, mês a mês — {g.titulo}</h2>
            {g.chave === 'reservatorio' && (
              <Link href={href()} scroll={false} className="btn btn-sm btn-outline-primary">
                <i className="bi bi-x-lg" /> Fechar
              </Link>
            )}
          </div>
          <p className="acp-nota mt-0 mb-2">
            Barras: volume útil nos últimos 12 meses, no último dia com leitura de cada mês (SSD), em laranja quando acima do operacional. Linhas: volume operacional da planilha e o
            volume do mesmo mês um ano antes.
          </p>
          <GraficoVolumesEspera meses={meses} volume={g.volume} anterior={g.anterior} operacional={g.operacional} periodos={def.periodos} />
        </div>
      ))}
    </>
  );
}

