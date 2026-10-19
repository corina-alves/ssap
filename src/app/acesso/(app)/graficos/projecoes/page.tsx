import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cabecalho, Mensagem } from '@/components/acesso/pecas';
import { ScriptsLegado } from '@/components/acesso/scripts-legado';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { salasPainel } from '@/lib/acesso/painel';
import { acl, exigirSala } from '@/lib/auth/acl';
import {
  chaveSimulacao,
  CONFIG,
  filtrarPeriodo,
  filtrarSimulacoes,
  simulacoesDa,
  graficos as montarGraficos,
  mesesDa,
  resumo as montarResumo,
  rotuloMes,
  SISTEMAS,
  type GraficoProjecao,
} from '@/lib/hidrologia/projecoes';
import { carregarRodada, rodadas as listarRodadas } from '@/lib/hidrologia/projecoes-rodadas';
import { FormEnvio } from './form-envio';

export const metadata: Metadata = { title: 'Projeções × GDN' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const varios = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
/** "2026-09-28 14:07:54" → "28/09/2026 14:07" */
const dataBr = (d: string) => d.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}).*$/, '$3/$2/$1 $4');

/**
 * Projeções do volume útil × GDN (graficos/projecoes.php) — adaptação do
 * Kit_Atualizar_Graficos: a planilha das simulações do SSD Sabesp (QN × retirada
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
  // Só a rodada mais recente fica gravada (cada envio substitui a anterior).
  const info = rodadas[0] ?? null;

  let graficos: GraficoProjecao[] = [];
  let avisos: string[] = [];
  let resumo = '';
  // Período (AAAA-MM): só meses que existem na rodada; vazio = rodada inteira.
  let meses: string[] = [];
  let de = '';
  let ate = '';
  // Retiradas com os seus QNs; `escolhidas` vazio = todas as simulações.
  let simulacoes: [string, number[]][] = [];
  let escolhidas = new Set<string>();
  if (info) {
    const todos = await carregarRodada(sistema, info.arquivo);
    meses = mesesDa(todos);
    de = meses.includes(um(sp.de)) ? um(sp.de) : '';
    ate = meses.includes(um(sp.ate)) ? um(sp.ate) : '';
    if (de && ate && de > ate) [de, ate] = [ate, de];
    simulacoes = simulacoesDa(todos);
    const existentes = new Set(simulacoes.flatMap(([esi, qns]) => qns.map((qn) => chaveSimulacao(esi, qn))));
    escolhidas = new Set(varios(sp.c).filter((c) => existentes.has(c)));
    if (escolhidas.size === existentes.size) escolhidas = new Set(); // todas marcadas = sem filtro
    const registros = filtrarSimulacoes(filtrarPeriodo(todos, de, ate), escolhidas);
    ({ graficos, avisos } = montarGraficos(sistema, registros));
    resumo = montarResumo(sistema, registros);
  }
  const filtrado = Boolean(de || ate || escolhidas.size);
  const filtro = new URLSearchParams({ s: sala.slug, sistema, rodada: info?.arquivo ?? '' });
  if (de) filtro.set('de', de);
  if (ate) filtro.set('ate', ate);
  for (const c of escolhidas) filtro.append('c', c);
  const limpar = `/acesso/graficos/projecoes?${new URLSearchParams({ s: sala.slug, sistema, rodada: info?.arquivo ?? '' })}`;
  const baixar = (tipo: string) => `/acesso/graficos/projecoes/baixar?${filtro}&tipo=${tipo}`;
  const gravada = /^\d+$/.test(um(sp.simulacoes)) && /^\d+$/.test(um(sp.valores));

  return (
    <>
      {gravada && (
        <Mensagem tipo="sucesso">
          Rodada gravada: {um(sp.simulacoes)} simulação(ões), {um(sp.valores)} valores mensais
          {varios(sp.aba).length > 0 && `, lidos das abas ${varios(sp.aba).map((x) => `"${x.slice(0, 60)}"`).join(', ')}`}.
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
        </div>
      </form>

      {podeEnviar && (
        <FormEnvio
          key={sistema}
          sala={sala.slug}
          sistema={sistema}
          nomeSistema={nomeSistema}
          aberto={rodadas.length === 0}
        />
      )}

      {!info ? (
        <div className="acesso-card">
          <p className="text-secondary mb-0">
            Nenhuma rodada de projeções para {nomeSistema} ainda.{podeEnviar ? ' Envie a planilha das simulações acima.' : ''}
          </p>
        </div>
      ) : (
        <>
          {avisos.map((t) => (
            <div key={t} className="alert alert-warning py-2 small">
              <i className="bi bi-exclamation-triangle" /> {t}
            </div>
          ))}
          <form className="acesso-card mb-3" method="get">
            <input type="hidden" name="s" value={sala.slug} />
            <input type="hidden" name="sistema" value={sistema} />
            <input type="hidden" name="rodada" value={info.arquivo} />
            <div className="row g-2 align-items-end">
              <div className="col-6 col-md-3">
                <label className="form-label small" htmlFor="de">
                  Período: de
                </label>
                <select className="form-select" id="de" name="de" defaultValue={de || meses[0]}>
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {rotuloMes(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small" htmlFor="ate">
                  até
                </label>
                <select className="form-select" id="ate" name="ate" defaultValue={ate || meses.at(-1)}>
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {rotuloMes(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="d-flex flex-wrap gap-2 mt-3">
              {simulacoes.map(([esi, qns]) => (
                <fieldset key={esi} className="border rounded px-3 py-2">
                  <legend className="float-none w-auto small fw-semibold px-1 mb-1">
                    ESI {esi.replace('.', ',')} {CONFIG.cenario_unidade}
                  </legend>
                  {qns.map((qn) => {
                    const c = chaveSimulacao(esi, qn);
                    const id = `c-${c.replace(/[.:]/g, '-')}`;
                    return (
                      <div key={qn} className="form-check form-check-inline">
                        <input className="form-check-input" type="checkbox" id={id} name="c" value={c} defaultChecked={!escolhidas.size || escolhidas.has(c)} />
                        <label className="form-check-label small" htmlFor={id}>
                          QN {qn}%
                        </label>
                      </div>
                    );
                  })}
                </fieldset>
              ))}
            </div>

            <div className="row g-2 align-items-center mt-1">
              <div className="col-md-auto d-flex gap-2">
                <button className="btn btn-primary" type="submit">
                  <i className="bi bi-funnel me-1" /> Aplicar
                </button>
                <a className={`btn btn-outline-secondary${filtrado ? '' : ' disabled'}`} href={limpar} aria-disabled={!filtrado}>
                  <i className="bi bi-x-circle me-1" /> Limpar
                </a>
              </div>
              <div className="col-md small text-secondary">
                {de || ate ? `Mostrando ${rotuloMes(de || meses[0]!)} a ${rotuloMes(ate || meses.at(-1)!)}` : `Rodada inteira: ${rotuloMes(meses[0]!)} a ${rotuloMes(meses.at(-1)!)}`}
                {escolhidas.size ? `, ${escolhidas.size} de ${simulacoes.reduce((t, [, q]) => t + q.length, 0)} simulações` : ', todas as simulações'}.
                {filtrado && ' A marcação da GDN considera só o que está selecionado.'} Retirada sem nenhum QN marcado fica sem gráfico.
              </div>
            </div>
          </form>

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

      <ScriptsLegado key={filtro.toString()} scripts={['/acesso/vendor/chartjs/chart.umd.min.js', '/acesso/js/projecoes.js']} />
    </>
  );
}
