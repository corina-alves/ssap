import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cabecalho } from '@/components/acesso/pecas';
import { ScriptsLegado } from '@/components/acesso/scripts-legado';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { salasPainel } from '@/lib/acesso/painel';
import { acl, exigirSala } from '@/lib/auth/acl';
import { graficosSistemas, opcoesFim, SISTEMAS, VARIAVEIS, type Variavel } from '@/lib/hidrologia/sistemas-ssd';

export const metadata: Metadata = { title: 'Sistemas produtores' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const num = (v: number | null | undefined, casas: number) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/**
 * Sistemas produtores — volume útil (barras), chuva e vazões afluente e
 * defluente (linhas), mês a mês. O gráfico e a tabela de cada sistema saem em
 * PNG (a tabela no formato do boletim mensal) e a tabela também pode ser
 * copiada. Séries mensais do SSD.
 */
export default async function SistemasProdutores({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const a = await acl();
  const sala = await exigirSala(um(sp.s) || 'alfredo-pisani', 'visualizar_graficos');
  const modulos = (await salasPainel(a)).find((s) => s.id === sala.id)?.modulos ?? [];
  if (!modulos.some((m) => m.slug === 'graficos')) notFound();

  const opcoes = opcoesFim();
  const fim = opcoes.find((o) => o.valor === um(sp.fim))?.valor ?? opcoes[0]!.valor;
  const sistemaSel = SISTEMAS[um(sp.sistema)] ? um(sp.sistema) : '';
  const d = await graficosSistemas(fim, sistemaSel);
  const periodo = d.periodoTexto;
  const variaveis = Object.keys(VARIAVEIS) as Variavel[];

  return (
    <>
      <Cabecalho
        titulo="Sistemas produtores — volume, chuva e vazões"
        subtitulo={`Médias e totais mensais de ${periodo}. Fonte: SSD SP Águas.`}
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, `/acesso/salas/sala?s=${sala.slug}`],
          ['Sistemas produtores', null],
        ]}
      />

      <form className="acesso-card mb-3 row g-2 align-items-end mx-0" method="get">
        <input type="hidden" name="s" value={sala.slug} />
        <div className="col-md-4">
          <label className="form-label small" htmlFor="sistema">
            Sistema
          </label>
          <SelectAutoEnvio className="form-select" id="sistema" name="sistema" defaultValue={sistemaSel}>
            <option value="">Todos os sistemas</option>
            {Object.entries(SISTEMAS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.nome}
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
        <div className="col-md-3">
          <label className="form-label small" htmlFor="fim">
            Último mês do gráfico
          </label>
          <SelectAutoEnvio className="form-select" id="fim" name="fim" defaultValue={fim}>
            {opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
        <div className="col-md-5 small text-secondary">
          Período: <strong>{periodo}</strong> ({d.meses.length} meses).
        </div>
      </form>

      {d.falhas.length > 0 && (
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle" /> Não foi possível obter os dados do SSD para: {d.falhas.join(', ')}. Tente novamente em
          instantes.
        </div>
      )}

      <div className="row g-3">
        {d.graficos.map((g) => {
          const cfg = {
            sistema: g.nome,
            rotulos: d.rotulos,
            ...g.valores,
            rotulo_chuva: g.rotuloChuva,
            arquivo: `sistema_${g.chave.replace(/-/g, '_')}_${d.inicio.replace('-', '')}_${d.fim.replace('-', '')}`,
          };
          return (
            <div key={g.chave} className="col-12">
              <section className="acesso-card h-100">
                <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                  <div>
                    <h2 className="h6 mb-0">Sistema {g.nome}</h2>
                    <small className="text-secondary">{periodo.charAt(0).toUpperCase() + periodo.slice(1)}</small>
                  </div>
                  <div className="d-flex flex-wrap justify-content-end gap-2">
                    <button type="button" className="btn btn-sm btn-outline-secondary" data-sp-baixar={`sp-${g.chave}`}>
                      <i className="bi bi-download" /> Gráfico (PNG)
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" data-sp-tabela={`sp-${g.chave}`}>
                      <i className="bi bi-table" /> Tabela (PNG)
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" data-sp-copiar={`sp-${g.chave}`}>
                      <i className="bi bi-clipboard" /> Copiar tabela
                    </button>
                  </div>
                </div>
                <div className="row g-3 align-items-center">
                  <div className="col-xl-8">
                    <div className="acesso-grafico acesso-grafico--sistema">
                      <canvas id={`sp-${g.chave}`} data-sp-grafico={JSON.stringify(cfg)} role="img" aria-label={`Volume, chuva e vazões do Sistema ${g.nome}`} />
                    </div>
                  </div>
                  <div className="col-xl-4">
                    <div className="table-responsive">
                      <table className="table table-sm table-striped align-middle mb-0 acesso-tabela-sistema">
                        <thead>
                          <tr>
                            <th>Mês</th>
                            {variaveis.map((v) => (
                              <th key={v} className="text-end">
                                <span className={`acesso-tabela-sistema__cor acesso-tabela-sistema__cor--${v}`} />
                                {v === 'chuva' && g.chave === 'sim' ? 'Chuva média' : VARIAVEIS[v].curto}
                                <br />
                                <small className="text-secondary fw-normal">({VARIAVEIS[v].unidade})</small>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {d.rotulos.map((mes, i) => (
                            <tr key={mes}>
                              <td>{mes}</td>
                              {variaveis.map((v) => (
                                <td key={v} className="text-end">
                                  {num(g.valores[v][i], v === 'chuva' ? 1 : 2)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          );
        })}
      </div>

      <p className="small text-secondary mt-3 mb-0">
        Séries mensais do SSD SP Águas: volume útil (%), chuva acumulada no mês (mm) e vazões afluente e defluente médias do mês (m³/s). No
        SIM, a chuva é a média simples da chuva mensal dos demais sistemas da lista. O mês corrente não entra no gráfico porque ainda está
        incompleto. Para o boletim mensal: &quot;Gráfico (PNG)&quot; e &quot;Tabela (PNG)&quot; baixam as imagens de cada sistema; &quot;Copiar tabela&quot;
        leva a tabela para colar no Word, PowerPoint ou Excel.
      </p>

      <ScriptsLegado scripts={['/acesso/vendor/chartjs/chart.umd.min.js', '/acesso/js/sistemas-produtores.js']} />
    </>
  );
}
