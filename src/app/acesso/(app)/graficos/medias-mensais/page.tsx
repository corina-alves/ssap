import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Cabecalho } from '@/components/acesso/pecas';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { salasPainel } from '@/lib/acesso/painel';
import { acl, exigirSala } from '@/lib/auth/acl';
import { mediasMensais, PERIODOS, SISTEMAS, type LinhaMes } from '@/lib/hidrologia/medias-mensais';
import { GraficoDoisEixos } from './grafico';

export const metadata: Metadata = { title: 'Médias mensais dos sistemas produtores' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const num = (v: number | null, sufixo = '') =>
  v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + sufixo;
const AZUL = '#0a4677';
const CINZA = '#5b6b7b';
const LARANJA = '#e08600';

type Coluna = { titulo: string; campo: keyof LinhaMes; pct?: boolean };

function Tabela({ linhas, colunas }: { linhas: LinhaMes[]; colunas: Coluna[] }) {
  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th>Mês</th>
            {colunas.map((c) => (
              <th key={c.campo} className="text-end">
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.mes}>
              <td>{l.mes}</td>
              {colunas.map((c) => {
                const v = l[c.campo] as number | null;
                return (
                  <td key={c.campo} className={`text-end ${c.pct && v !== null ? (v < 100 ? 'text-danger' : 'text-success') : ''}`}>
                    {num(v, c.pct ? '%' : '')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Médias mensais dos sistemas produtores: vazão natural × MLT e chuva × média
 * climatológica nos últimos meses, do resumo diário da SABESP (mlt-melhorada.php).
 */
export default async function MediasMensais({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const a = await acl();
  const sala = await exigirSala(um(sp.s) || 'alfredo-pisani', 'visualizar_graficos');
  if (!(await salasPainel(a)).find((s) => s.id === sala.id)?.modulos.some((m) => m.slug === 'graficos')) notFound();

  const sistema = SISTEMAS[Number(um(sp.sistema))] ? Number(um(sp.sistema)) : 64;
  const meses = PERIODOS.includes(Number(um(sp.meses))) ? Number(um(sp.meses)) : 12;
  const nome = SISTEMAS[sistema]!;

  return (
    <>
      <Cabecalho
        titulo={`Médias mensais — ${nome}`}
        subtitulo="Vazão natural mensal × média de longo termo (MLT) e chuva mensal × média climatológica. Fonte: SABESP — Mananciais."
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, `/acesso/salas/sala?s=${sala.slug}`],
          ['Gráficos', `/acesso/graficos?sala=${sala.id}`],
          ['Médias mensais', null],
        ]}
      />

      <form className="acesso-card mb-3 row g-2 align-items-end mx-0" method="get">
        <input type="hidden" name="s" value={sala.slug} />
        <div className="col-md-4">
          <label className="form-label small" htmlFor="sistema">
            Sistema produtor
          </label>
          <SelectAutoEnvio className="form-select" id="sistema" name="sistema" defaultValue={String(sistema)}>
            {Object.entries(SISTEMAS).map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
        <div className="col-md-3">
          <label className="form-label small" htmlFor="meses">
            Período
          </label>
          <SelectAutoEnvio className="form-select" id="meses" name="meses" defaultValue={String(meses)}>
            {PERIODOS.map((m) => (
              <option key={m} value={m}>
                Últimos {m} meses
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
      </form>

      {/* Título e filtros aparecem na hora; tabelas e gráficos chegam quando a SABESP responder. */}
      <Suspense
        key={`${sistema}-${meses}`}
        fallback={
          <div className="acesso-card text-secondary py-4 text-center">
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
            Carregando os dados da SABESP…
          </div>
        }
      >
        <Dados sistema={sistema} meses={meses} nome={nome} />
      </Suspense>
    </>
  );
}

async function Dados({ sistema, meses, nome }: { sistema: number; meses: number; nome: string }) {
  const linhas = await mediasMensais(sistema, meses);
  const semDados = linhas.every((l) => l.data === null);
  const faltando = linhas.filter((l) => l.data === null).map((l) => l.mes);
  const rotulos = linhas.map((l) => l.mes);
  const coluna = (campo: keyof LinhaMes) => linhas.map((l) => l[campo] as number | null);

  return (
    <>
      {semDados ? (
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle" /> Não foi possível obter os dados da SABESP agora. Tente novamente em instantes.
        </div>
      ) : (
        <>
          {faltando.length > 0 && (
            <div className="alert alert-warning">
              <i className="bi bi-exclamation-triangle" /> Sem dados da SABESP para: {faltando.join(', ')}.
            </div>
          )}

          <section className="acesso-card mb-3">
            <h2 className="h6 mb-2">Vazão natural — {nome}</h2>
            <Tabela
              linhas={linhas}
              colunas={[
                { titulo: 'Vazão mensal (m³/s)', campo: 'vazaoMensal' },
                { titulo: 'Média histórica / MLT (m³/s)', campo: 'vazaoHistorica' },
                { titulo: 'MLT (%)', campo: 'mlt', pct: true },
              ]}
            />
            <div className="mt-3">
              <GraficoDoisEixos
                rotulos={rotulos}
                unidade="m³/s"
                rotuloPct="MLT %"
                descricao={`Vazão natural mensal e MLT do sistema ${nome}`}
                series={[
                  { nome: 'Vazão mensal (m³/s)', valores: coluna('vazaoMensal'), cor: AZUL },
                  { nome: 'Média histórica / MLT (m³/s)', valores: coluna('vazaoHistorica'), cor: CINZA, tracejada: true },
                  { nome: 'MLT (%)', valores: coluna('mlt'), cor: LARANJA, percentual: true },
                ]}
              />
            </div>
          </section>

          <section className="acesso-card">
            <h2 className="h6 mb-2">Precipitação — {nome}</h2>
            <Tabela
              linhas={linhas}
              colunas={[
                { titulo: 'Chuva mensal (mm)', campo: 'chuvaMensal' },
                { titulo: 'Média histórica (mm)', campo: 'chuvaHistorica' },
                { titulo: 'Média climatológica (%)', campo: 'mc', pct: true },
              ]}
            />
            <div className="mt-3">
              <GraficoDoisEixos
                rotulos={rotulos}
                unidade="mm"
                rotuloPct="%"
                descricao={`Chuva mensal e média climatológica do sistema ${nome}`}
                series={[
                  { nome: 'Chuva mensal (mm)', valores: coluna('chuvaMensal'), cor: AZUL },
                  { nome: 'Média histórica (mm)', valores: coluna('chuvaHistorica'), cor: CINZA, tracejada: true },
                  { nome: 'Média climatológica (%)', valores: coluna('mc'), cor: LARANJA, percentual: true },
                ]}
              />
            </div>
            <p className="small text-secondary mt-2 mb-0">
              Resumo diário da SABESP no último dia de cada mês (no mês corrente, o dia mais recente publicado, com valores parciais). No SIM, a
              chuva é a média simples dos demais sistemas. Elaboração: Sala de Situação Alfredo Pisani.
            </p>
          </section>
        </>
      )}
    </>
  );
}
