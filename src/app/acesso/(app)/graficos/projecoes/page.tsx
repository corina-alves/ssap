import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cabecalho, Mensagem } from '@/components/acesso/pecas';
import { ScriptsLegado } from '@/components/acesso/scripts-legado';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { salasPainel } from '@/lib/acesso/painel';
import { acl, exigirSala } from '@/lib/auth/acl';
import { CONFIG, graficos as montarGraficos, listaNumeros, resumo as montarResumo, SISTEMAS, type GraficoProjecao } from '@/lib/hidrologia/projecoes';
import { carregarRodada, rodadas as listarRodadas } from '@/lib/hidrologia/projecoes-rodadas';
import { FormEnvio } from './form-envio';

export const metadata: Metadata = { title: 'Projeções × GDN' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
/** "2026-09-28 14:07:54" → "28/09/2026 14:07" */
const dataBr = (d: string) => d.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}).*$/, '$3/$2/$1 $4');

/**
 * Projeções do volume útil × GDN (graficos/projecoes.php) — adaptação do
 * Kit_Atualizar_Graficos: os CSVs das simulações do SSD Sabesp (QN × retirada
 * na ESI) viram um gráfico por ESI, com a linha do limite da Faixa 2, a
 * marcação da retomada da GDN e o resumo da marcação.
 */
export default async function Projecoes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const a = await acl();
  const sala = await exigirSala(um(sp.s) || 'alfredo-pisani', 'visualizar_graficos');
  const modulos = (await salasPainel(a)).find((s) => s.id === sala.id)?.modulos ?? [];
  if (!modulos.some((m) => m.slug === 'graficos')) notFound();
  const podeEnviar = a.pode('criar_graficos', sala.id);

  const sistema = SISTEMAS[um(sp.sistema)] ? um(sp.sistema) : 'cantareira';
  const nomeSistema = SISTEMAS[sistema]!.nome;
  const rodadas = await listarRodadas(sistema);
  const info = rodadas.find((r) => r.arquivo === um(sp.rodada)) ?? rodadas[0] ?? null;

  const esis = listaNumeros(um(sp.esis), false);
  const qns = listaNumeros(um(sp.qns), true);

  let graficos: GraficoProjecao[] = [];
  let avisos: string[] = [];
  let resumo = '';
  if (info) {
    const registros = await carregarRodada(sistema, info.arquivo);
    ({ graficos, avisos } = montarGraficos(sistema, registros));
    resumo = montarResumo(sistema, registros);
  }
  const base = { s: sala.slug, sistema, rodada: info?.arquivo ?? '' };
  const baixar = (tipo: string) => `/acesso/graficos/projecoes/baixar?${new URLSearchParams({ ...base, tipo })}`;
  const gravada = /^\d+$/.test(um(sp.arquivos)) && /^\d+$/.test(um(sp.valores));

  return (
    <>
      {gravada && (
        <Mensagem tipo="sucesso">
          Rodada gravada: {um(sp.arquivos)} arquivo(s), {um(sp.valores)} valores mensais.
        </Mensagem>
      )}
      <Cabecalho
        titulo="Projeções do volume útil × GDN"
        subtitulo={`Simulações do SSD Sabesp (QN × retirada na ESI) com o limite da Faixa ${CONFIG.faixa_gdn} e a marcação da retomada da GDN.`}
        trilha={[
          ['Painel', '/acesso'],
          ['Gráficos', `/acesso/graficos?sala=${sala.id}`],
          ['Projeções × GDN', null],
        ]}
      />

      <form className="acesso-card mb-3" method="get">
        <input type="hidden" name="s" value={sala.slug} />
        <div className="row g-2 align-items-end">
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
          <div className="col-md-6">
            <label className="form-label small" htmlFor="rodada">
              Rodada
            </label>
            {rodadas.length === 0 ? (
              <select className="form-select" id="rodada" disabled>
                <option>Nenhuma rodada enviada para este sistema</option>
              </select>
            ) : (
              <SelectAutoEnvio key={sistema} className="form-select" id="rodada" name="rodada" defaultValue={info!.arquivo}>
                {rodadas.map((r) => (
                  <option key={r.arquivo} value={r.arquivo}>
                    {dataBr(r.enviado_em)}
                    {r.referencia ? ` — ${r.referencia}` : ''} · {r.enviado_por}
                  </option>
                ))}
              </SelectAutoEnvio>
            )}
          </div>
        </div>
      </form>

      {podeEnviar && (
        <FormEnvio
          key={`${sistema}|${esis.join()}|${qns.join()}`}
          sala={sala.slug}
          sistema={sistema}
          nomeSistema={nomeSistema}
          esis={esis.length ? esis : CONFIG.esi_padrao.map(String)}
          qns={qns.length ? qns : CONFIG.qn_padrao.map(String)}
          aberto={rodadas.length === 0 || um(sp.grade) !== ''}
        />
      )}

      {!info ? (
        <div className="acesso-card">
          <p className="text-secondary mb-0">
            Nenhuma rodada de projeções para {nomeSistema} ainda.{podeEnviar ? ' Envie os CSVs do SSD acima.' : ''}
          </p>
        </div>
      ) : (
        <>
          {avisos.map((t) => (
            <div key={t} className="alert alert-warning py-2 small">
              <i className="bi bi-exclamation-triangle" /> {t}
            </div>
          ))}
          <div className="d-flex flex-wrap gap-2 mb-3">
            <a className="btn btn-outline-secondary btn-sm" href={baixar('csv')}>
              <i className="bi bi-filetype-csv me-1" /> Dados consolidados (CSV)
            </a>
            <a className="btn btn-outline-secondary btn-sm" href={baixar('txt')}>
              <i className="bi bi-file-text me-1" /> Resumo da marcação da GDN (TXT)
            </a>
            <span className="small text-secondary align-self-center">
              Rodada de {dataBr(info.enviado_em)}
              {info.referencia ? ` — ${info.referencia}` : ''}, enviada por {info.enviado_por}.
            </span>
          </div>

          {graficos.map((g, i) => (
            <section key={g.esi} className="acesso-card mb-3">
              <div className="d-flex justify-content-end mb-1">
                <button className="btn btn-sm btn-outline-primary" type="button" data-baixar-png={`proj-${i}`}>
                  <i className="bi bi-download me-1" /> Baixar PNG
                </button>
              </div>
              <canvas id={`proj-${i}`} data-projecao={JSON.stringify(g)} data-logo="/acesso/img/spaguas-logo.png" role="img" aria-label={`${g.titulo} — ${g.subtitulo}`} />
            </section>
          ))}

          <section className="acesso-card">
            <h2 className="acesso-card__titulo">
              <i className="bi bi-flag" /> Marcação da GDN
            </h2>
            <div className="small font-monospace mb-0" style={{ whiteSpace: 'pre-wrap' }}>
              {resumo}
            </div>
          </section>
        </>
      )}

      <ScriptsLegado key={info?.arquivo ?? ''} scripts={['/acesso/vendor/chartjs/chart.umd.min.js', '/acesso/js/projecoes.js']} />
    </>
  );
}
