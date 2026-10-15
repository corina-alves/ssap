'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { enviarRodadaAcao, type EstadoProjecao } from './actions';

/**
 * "Enviar nova rodada": grade QN × ESI com um CSV por célula, ou o CSV
 * consolidado do kit. "Atualizar grade" refaz a grade com as ESIs e QNs digitadas.
 */
export function FormEnvio({
  sala,
  sistema,
  nomeSistema,
  esis,
  qns,
  aberto,
}: {
  sala: string;
  sistema: string;
  nomeSistema: string;
  esis: string[];
  qns: string[];
  aberto: boolean;
}) {
  const router = useRouter();
  const [estado, acao, pendente] = useActionState(enviarRodadaAcao, { erros: [] } as EstadoProjecao);
  const [esiTexto, setEsiTexto] = useState(esis.map((e) => e.replace('.', ',')).join('; '));
  const [qnTexto, setQnTexto] = useState(qns.join(', '));
  const hoje = new Date().toLocaleDateString('pt-BR');

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
        <div className="row g-2 align-items-end mb-2">
          <div className="col-md-5">
            <label className="form-label small" htmlFor="referencia">
              Referência da rodada
            </label>
            <input className="form-control" id="referencia" name="referencia" maxLength={120} placeholder={`Ex.: Simulações ${hoje}`} suppressHydrationWarning />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small" htmlFor="esis">
              Retiradas na ESI (m³/s)
            </label>
            <input className="form-control" id="esis" value={esiTexto} onChange={(e) => setEsiTexto(e.target.value)} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small" htmlFor="qns">
              QN (%)
            </label>
            <input className="form-control" id="qns" value={qnTexto} onChange={(e) => setQnTexto(e.target.value)} />
          </div>
          <div className="col-md-2">
            <button
              className="btn btn-outline-secondary w-100"
              type="button"
              title="Refaz a grade abaixo com estes valores"
              onClick={() => router.push(`/acesso/graficos/projecoes?${new URLSearchParams({ s: sala, sistema, esis: esiTexto, qns: qnTexto, grade: '1' })}`)}
            >
              Atualizar grade
            </button>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-2">
            <thead>
              <tr>
                <th />
                {esis.map((esi) => (
                  <th key={esi}>ESI {esi.replace('.', ',')} m³/s</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {qns.map((qn) => (
                <tr key={qn}>
                  <th className="text-nowrap">QN {qn}%</th>
                  {esis.map((esi) => {
                    const id = `arq-${qn}-${esi.replace('.', '_')}`;
                    return (
                      <td key={esi}>
                        <label className="visually-hidden" htmlFor={id}>
                          QN {qn}% ESI {esi}
                        </label>
                        <input className="form-control form-control-sm" type="file" id={id} name={`arq:${qn}:${esi.replace('.', '_')}`} accept=".csv,.txt,text/csv" />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row g-2 align-items-end">
          <div className="col-md-6">
            <label className="form-label small" htmlFor="consolidado">
              Ou: CSV consolidado (data, esi, qn, volume — o <code>dados_consolidados.csv</code> do kit)
            </label>
            <input className="form-control form-control-sm" type="file" id="consolidado" name="consolidado" accept=".csv,.txt,text/csv" />
          </div>
          <div className="col-md-auto ms-auto">
            <button className="btn btn-primary" type="submit" disabled={pendente}>
              <i className="bi bi-graph-up me-1" /> {pendente ? 'Lendo os arquivos…' : 'Gravar rodada e gerar gráficos'}
            </button>
          </div>
        </div>
        <p className="small text-secondary mt-2 mb-0">
          Cada célula recebe o CSV de uma simulação baixado do SSD Sabesp (data e volume útil final; dados diários viram o fechamento de
          cada mês). Separador ; , ou tab e vírgula decimal são aceitos. Não precisa preencher todas as células; a rodada nova substitui a
          anterior na exibição e a anterior fica no histórico.
        </p>
      </form>
    </details>
  );
}
