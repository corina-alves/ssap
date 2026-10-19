'use client';

import { useActionState } from 'react';
import { enviarRodadaAcao, type EstadoProjecao } from './actions';

/** "Enviar nova rodada": uma planilha com todas as simulações (QN × retirada na ESI) gera os gráficos. */
export function FormEnvio({ sala, sistema, nomeSistema, aberto }: { sala: string; sistema: string; nomeSistema: string; aberto: boolean }) {
  const [estado, acao, pendente] = useActionState(enviarRodadaAcao, { erros: [] } as EstadoProjecao);

  return (
    <details className="acesso-card mb-3" open={aberto || estado.erros.length > 0}>
      <summary className="fw-semibold">
        <i className="bi bi-upload me-1" /> Enviar nova rodada — {nomeSistema}
      </summary>
      {estado.erros.length > 0 && (
        <div className="alert alert-danger mt-3 mb-0" role="alert">
          {estado.erros.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      <form className="mt-3" action={acao}>
        <input type="hidden" name="s" value={sala} />
        <input type="hidden" name="sistema" value={sistema} />
        <div className="row g-2 align-items-end">
          <div className="col-md-5">
            <label className="form-label small" htmlFor="planilha">
              Planilha das simulações (.xlsx)
            </label>
            <input className="form-control" type="file" id="planilha" name="planilha" required accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" />
          </div>
          <div className="col-md-4">
            <label className="form-label small" htmlFor="referencia">
              Referência da rodada <span className="text-secondary">(opcional)</span>
            </label>
            <input className="form-control" id="referencia" name="referencia" maxLength={120} placeholder="Vazio: usa o nome do arquivo" />
          </div>
          <div className="col-md-3">
            <button className="btn btn-primary w-100" type="submit" disabled={pendente}>
              <i className="bi bi-graph-up me-1" /> {pendente ? 'Lendo a planilha…' : 'Gravar rodada e gerar gráficos'}
            </button>
          </div>
        </div>
        <p className="small text-secondary mt-2 mb-0">
          Uma planilha com todas as simulações, no formato de “Simulações Cantareira 16-10-2026.xlsx”: uma linha com a retirada de cada
          grupo de colunas (<code>ESI 29</code>, <code>ESI 30</code>…), embaixo o cabeçalho <code>data</code> e as colunas <code>QN100</code>,{' '}
          <code>QN70</code>, <code>QN50</code>, e uma linha por data com o volume útil (%). Dados diários viram o fechamento de cada mês. A
          rodada nova substitui a anterior, que é apagada.
        </p>
      </form>
    </details>
  );
}
