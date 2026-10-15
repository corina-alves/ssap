import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cabecalho } from '@/components/acesso/pecas';
import { ScriptsLegado } from '@/components/acesso/scripts-legado';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { salasPainel } from '@/lib/acesso/painel';
import { acl, exigirSala } from '@/lib/auth/acl';
import { MESES, mltMensal, PRIMEIRO_ANO, serieMensal, SISTEMAS, type SerieMensal } from '@/lib/hidrologia/analise-mlt';
import { hojeSp } from '@/lib/integracoes/comum';

export const metadata: Metadata = { title: 'Afluência × MLT' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const num = (v: number | null | undefined, casas = 2) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const arred2 = (v: number) => Math.round(v * 100) / 100;
const soma = (l: number[]) => l.reduce((t, x) => t + x, 0);

/**
 * Afluência (vazão natural) × MLT dos sistemas produtores: uma série mensal do
 * SSD por sistema, desde 1930; a MLT sai da mesma série (graficos/afluencia-mlt.php).
 */
export default async function AfluenciaMlt({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const a = await acl();
  const sala = await exigirSala(um(sp.s) || 'alfredo-pisani', 'visualizar_graficos');
  const dados = (await salasPainel(a)).find((s) => s.id === sala.id);
  if (!dados?.modulos.some((m) => m.slug === 'graficos')) notFound();

  const anoAtual = Number(hojeSp().slice(0, 4));
  const sistema = SISTEMAS[um(sp.sistema)] ? um(sp.sistema) : 'cantareira';
  // Até 4 anos para comparar (padrão: ano atual, anterior e as crises de 2021 e 2014).
  const pedidos = [1, 2, 3, 4].map((i) => um(sp[`ano${i}`]));
  let anos = pedidos.filter((v) => /^\d{4}$/.test(v) && Number(v) >= PRIMEIRO_ANO && Number(v) <= anoAtual).map(Number);
  if (sp.ano1 === undefined && !anos.length) anos = [anoAtual, anoAtual - 1, 2021, 2014];
  anos = [...new Set(anos)];

  let s: SerieMensal | null = null;
  try {
    s = await serieMensal(sistema, 'vazao-natural');
  } catch {
    s = null;
  }

  const m = s ? mltMensal(s.porAno) : null;
  const mlt = (m?.mlt ?? new Array<number | null>(12).fill(null)).map((v) => (v === null ? null : arred2(v)));
  const valor = (ano: number, i: number) => (s?.porAno[ano]?.[i + 1] === undefined ? null : arred2(s.porAno[ano]![i + 1]!));
  /** Média do ano e % da MLT considerando só os meses com dado. */
  const resumoAno = (ano: number) => {
    const meses = MESES.map((_, i) => i).filter((i) => valor(ano, i) !== null);
    const vals = meses.map((i) => valor(ano, i)!);
    const ref = soma(meses.map((i) => mlt[i] ?? 0));
    return { media: vals.length ? soma(vals) / vals.length : null, pct: vals.length && ref > 0 ? (soma(vals) / ref) * 100 : null };
  };

  // Indicadores: último mês disponível e média do ano corrente até ele, ambos em % da MLT.
  const mltValidos = mlt.filter((v): v is number => !!v);
  const mesUltimo = s ? Number(s.ultimo.data.slice(5, 7)) - 1 : 0;
  const anoUltimo = s ? Number(s.ultimo.data.slice(0, 4)) : anoAtual;
  const kpi = s && {
    mes: `${MESES[mesUltimo]}/${anoUltimo}`,
    valor: s.ultimo.valor,
    pctMes: mlt[mesUltimo] ? (s.ultimo.valor / mlt[mesUltimo]!) * 100 : null,
    mediaAno: resumoAno(anoUltimo).media,
    pctAno: resumoAno(anoUltimo).pct,
    mltAnual: mltValidos.length ? soma(mltValidos) / mltValidos.length : null,
  };

  const grafico = {
    tipo: 'linha', titulo: 'Afluência × MLT', unidade: 'm³/s', eixo_y: 'Vazão natural', empilhado: false,
    rotulos: MESES,
    series: [{ nome: `MLT (${m?.de ?? ''}–${m?.ate ?? ''})`, valores: mlt }, ...anos.map((ano) => ({ nome: String(ano), valores: MESES.map((_, i) => valor(ano, i)) }))],
  };
  const classePct = (p: number | null | undefined) => ((p ?? 100) < 100 ? 'acesso-kpi--revisao' : 'acesso-kpi--publicado');
  const Pct = ({ p }: { p: number | null }) => (p === null ? null : <small className={p < 100 ? 'text-danger' : 'text-success'}> ({num(p, 0)}%)</small>);

  return (
    <>
      <Cabecalho
        titulo={`Afluência × MLT — ${SISTEMAS[sistema]!.nome}`}
        subtitulo="Vazão natural mensal (m³/s) comparada à média de longo termo. Fonte: SSD SP-Águas."
        trilha={[
          ['Painel', '/acesso'],
          ['Gráficos', `/acesso/graficos?sala=${sala.id}`],
          ['Afluência × MLT', null],
        ]}
      />

      <form className="acesso-card mb-3 row g-2 align-items-end mx-0" method="get">
        <input type="hidden" name="s" value={sala.slug} />
        <div className="col-md-4">
          <label className="form-label small" htmlFor="sistema">
            Sistema
          </label>
          <SelectAutoEnvio className="form-select" id="sistema" name="sistema" defaultValue={sistema}>
            {Object.entries(SISTEMAS).map(([k, x]) => (
              <option key={k} value={k}>
                {x.nome}
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="col-6 col-md-2">
            <label className="form-label small" htmlFor={`ano${i}`}>
              Ano {i}
            </label>
            <SelectAutoEnvio className="form-select" id={`ano${i}`} name={`ano${i}`} defaultValue={String(anos[i - 1] ?? '')}>
              <option value="">—</option>
              {Array.from({ length: anoAtual - PRIMEIRO_ANO + 1 }, (_, k) => anoAtual - k).map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </SelectAutoEnvio>
          </div>
        ))}
      </form>

      {!s || !kpi ? (
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle" /> Não foi possível obter os dados do SSD agora. Tente novamente em instantes.
        </div>
      ) : (
        <>
          <div className="row g-3 mb-3">
            <div className="col-6 col-xl-3">
              <div className="acesso-kpi acesso-kpi--aprovado">
                <i className="bi bi-water" />
                <div>
                  <span className="acesso-kpi__valor">{num(kpi.valor, 1)}</span>
                  <span className="acesso-kpi__rotulo">m³/s em {kpi.mes}</span>
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className={`acesso-kpi ${classePct(kpi.pctMes)}`}>
                <i className="bi bi-percent" />
                <div>
                  <span className="acesso-kpi__valor">{num(kpi.pctMes, 0)}%</span>
                  <span className="acesso-kpi__rotulo">da MLT no mês</span>
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className={`acesso-kpi ${classePct(kpi.pctAno)}`}>
                <i className="bi bi-calendar3" />
                <div>
                  <span className="acesso-kpi__valor">{num(kpi.pctAno, 0)}%</span>
                  <span className="acesso-kpi__rotulo">da MLT no ano (média {num(kpi.mediaAno, 1)} m³/s)</span>
                </div>
              </div>
            </div>
            <div className="col-6 col-xl-3">
              <div className="acesso-kpi acesso-kpi--rascunho">
                <i className="bi bi-graph-up" />
                <div>
                  <span className="acesso-kpi__valor">{num(kpi.mltAnual, 1)}</span>
                  <span className="acesso-kpi__rotulo">m³/s — MLT anual</span>
                </div>
              </div>
            </div>
          </div>

          <section className="acesso-card mb-3">
            <div className="acesso-grafico acesso-grafico--grande">
              <canvas data-grafico={JSON.stringify(grafico)} role="img" aria-label="Gráfico de afluência e MLT" />
            </div>
          </section>

          <section className="acesso-card">
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="text-end">MLT</th>
                    {anos.map((ano) => (
                      <th key={ano} className="text-end">
                        {ano} <small className="text-secondary fw-normal">(% MLT)</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MESES.map((mes, i) => (
                    <tr key={mes}>
                      <td>{mes}</td>
                      <td className="text-end">{num(mlt[i])}</td>
                      {anos.map((ano) => {
                        const v = valor(ano, i);
                        return (
                          <td key={ano} className="text-end">
                            {num(v)}
                            <Pct p={v !== null && mlt[i] ? (v / mlt[i]!) * 100 : null} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="fw-bold">
                    <td>Média</td>
                    <td className="text-end">{num(kpi.mltAnual)}</td>
                    {anos.map((ano) => {
                      const r = resumoAno(ano);
                      return (
                        <td key={ano} className="text-end">
                          {num(r.media)}
                          <Pct p={r.pct} />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="small text-secondary mt-2 mb-0">
              Vazão natural mensal (m³/s) do SSD SP-Águas. MLT = média de cada mês de {m?.de ?? ''} a {m?.ate ?? ''}. Na média anual, a % da MLT
              considera só os meses com dado.
            </p>
          </section>
        </>
      )}

      <ScriptsLegado scripts={['/acesso/vendor/chartjs/chart.umd.min.js', '/acesso/js/graficos.js']} />
    </>
  );
}
