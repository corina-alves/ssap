import { GraficoSerieAnual, GraficoTransposicaoGauge, GraficoTransposicaoMensal } from '@/components/graficos-php';
import { Secao } from '@/components/site/layout';
import { dataBr } from '@/lib/formato';
import { serieAnual } from '@/lib/hidrologia/reservatorios';
import { ID_CANTAREIRA, ID_SIM } from '@/lib/integracoes/sabesp';
import { transposicaoAno } from '@/lib/integracoes/ssd';

const num = (v: number | null, casas = 2) =>
  v === null ? '--' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Operação da transposição no ano (série diária 331 do SSD) — 3 colunas, como no PHP. */
export async function TransposicaoNoAno({ ate }: { ate: string }) {
  const r = await transposicaoAno(ate);
  if (!r.ok) return <p className="sssp-status is-error">{r.mensagem}</p>;
  const t = r.dados;
  return (
    <div className="row g-3 rsv-transp">
      <div className="col-lg-4">
        <h3 className="h6 mb-2">
          <i className="bi bi-bar-chart-line text-primary" /> Operação no ano atual — {t.ano}
        </h3>
        <div className="table-responsive">
          <table className="table table-sm table-striped rsv-tabela mb-0">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="text-end">Vazão média bombeada (m³/s)</th>
              </tr>
            </thead>
            <tbody>
              {t.meses.length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-center text-secondary">
                    Sem operação registrada no ano.
                  </td>
                </tr>
              ) : (
                t.meses.map((m) => (
                  <tr key={m.mes}>
                    <td className="text-capitalize">{m.nome}</td>
                    <td className="text-end">{num(m.mediaM3s)}</td>
                  </tr>
                ))
              )}
              {t.mediaAnoM3s !== null && (
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td className="text-end">
                    <strong>{num(t.mediaAnoM3s)}</strong>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="col-lg-4">
        <h3 className="h6 mb-2">
          <i className="bi bi-graph-up text-primary" /> Volume mensal transferido
        </h3>
        <div className="rsv-grafico-wrap">
          <GraficoTransposicaoMensal meses={t.meses.map((m) => ({ mes: m.mes, volumeHm3: m.volumeHm3 }))} />
        </div>
      </div>
      <div className="col-lg-4">
        <h3 className="h6 mb-2">
          <i className="bi bi-speedometer2 text-primary" /> Volume transferido (hm³)
        </h3>
        <p className="text-secondary small mb-2">Volume acumulado da transposição no ano atual.</p>
        <div className="rsv-transp-gauge">
          <GraficoTransposicaoGauge acumulado={t.acumuladoHm3} vigente={t.limite?.vigente ?? null} anterior={t.limite?.anterior ?? null} />
          <div className="rsv-transp-gauge-num">
            <strong>{num(t.acumuladoHm3, 1)}</strong>
          </div>
        </div>
        <div className="small text-secondary mt-2">
          {t.limite ? (
            <>
              {t.limite.anterior !== null && (
                <>
                  Limite anterior: <strong>{num(t.limite.anterior, 1)} hm³</strong> ·{' '}
                </>
              )}
              Limite vigente {t.ano}: <strong>{num(t.limite.vigente, 1)} hm³</strong>
              <br />
              {t.limite.doc}
              {t.atualizadoEm && <> · Atualizado em {dataBr(t.atualizadoEm)}</>}
            </>
          ) : (
            t.atualizadoEm && <>Atualizado em {dataBr(t.atualizadoEm)}</>
          )}
        </div>
        {t.limite ? (
          <div className={`rsv-transp-situacao mt-2 ${t.limite.dentro ? 'is-ok' : 'is-alerta'}`}>
            {t.limite.dentro ? (
              <>
                <i className="bi bi-check-circle" /> Dentro do limite vigente de {t.ano}. Restam <strong>{num(t.limite.restanteHm3, 1)} hm³</strong> para o limite.
              </>
            ) : (
              <>
                <i className="bi bi-exclamation-triangle" /> Limite anual de {t.ano} atingido.
              </>
            )}
          </div>
        ) : (
          <div className="rsv-transp-situacao mt-2" />
        )}
      </div>
    </div>
  );
}

/** Série anual (mesma data desde 2010) do Cantareira e do SIM, lado a lado. */
export async function SeriesAnuais({ dataBase }: { dataBase: string }) {
  const [cant, sim] = await Promise.all([serieAnual(dataBase, ID_CANTAREIRA), serieAnual(dataBase, ID_SIM)]);
  return (
    <div className="row g-3">
      {[
        { nome: 'Cantareira', pontos: cant, id: 'graficoCantareira', label: 'Sistema Cantareira (%)', cor: '#0b4f8a' },
        { nome: 'SIM', pontos: sim, id: 'graficoSIM', label: 'Sistema SIM (%)', cor: '#198754' },
      ].map((s) => (
        <div className="col-lg-6" key={s.nome}>
          <Secao titulo={`Acompanhamento do ${s.nome}`} subtitulo="Série anual desde 2010 para a mesma data de referência." icone="bi-clock-history">
            <div className="rsv-grafico-wrap">
              <GraficoSerieAnual
                id={s.id}
                label={s.label}
                anos={s.pontos.map((p) => p.ano)}
                valores={s.pontos.map((p) => p.volume)}
                cor={s.cor}
              />
            </div>
          </Secao>
        </div>
      ))}
    </div>
  );
}
