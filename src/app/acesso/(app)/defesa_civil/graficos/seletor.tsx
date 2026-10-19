'use client';

import Form from 'next/form';
import { useMemo, useState } from 'react';

export type OpcaoPosto = { id: number; rotulo: string };

const MAX_POSTOS = 8;
const diaMes = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/** Dias AAAA-MM-DD de `de` a `ate` (no máximo `max`). */
function dias(de: string, ate: string, max: number): string[] {
  const r: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || de > ate) return r;
  for (let t = Date.parse(`${de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`) && r.length < max; t += 86_400_000) r.push(new Date(t).toISOString().slice(0, 10));
  return r;
}

/**
 * Escolha dos postos (qualquer posto fluviométrico do SIBH), do período e do
 * dia com cuja média a última leitura é comparada. Envia por GET (?p=&de=&ate=&ref=).
 */
export function Seletor({
  postos,
  escolhidos,
  de,
  ate,
  diaRef,
  hoje,
  maxDias,
}: {
  postos: OpcaoPosto[];
  escolhidos: number[];
  de: string;
  ate: string;
  diaRef: string;
  hoje: string;
  maxDias: number;
}) {
  const porRotulo = useMemo(() => new Map(postos.map((p) => [p.rotulo, p.id])), [postos]);
  const porId = useMemo(() => new Map(postos.map((p) => [p.id, p.rotulo])), [postos]);
  const [lista, setLista] = useState(escolhidos.filter((id) => porId.has(id)));
  const [busca, setBusca] = useState('');
  const [inicio, setInicio] = useState(de);
  const [fim, setFim] = useState(ate);
  const [comparar, setComparar] = useState(diaRef);
  const opcoesDia = dias(inicio, fim, maxDias);
  const erroPeriodo = !opcoesDia.length ? 'A data inicial deve ser anterior ou igual à final.' : dias(inicio, fim, maxDias + 1).length > maxDias ? `Período de no máximo ${maxDias} dias.` : '';

  const adicionar = () => {
    const id = porRotulo.get(busca.trim());
    if (id && !lista.includes(id) && lista.length < MAX_POSTOS) setLista([...lista, id]);
    if (id) setBusca('');
  };

  return (
    <Form action="/acesso/defesa_civil/graficos" className="acesso-card mb-3">
      <div className="row g-2 align-items-end">
        <div className="col-lg-6">
          <label className="form-label small" htmlFor="pgBusca">
            Posto fluviométrico (prefixo, nome ou município)
          </label>
          <div className="input-group">
            <input
              id="pgBusca"
              className="form-control"
              list="pgPostos"
              value={busca}
              placeholder="Ex.: 64278080 ou Ourinhos"
              autoComplete="off"
              onChange={(e) => {
                setBusca(e.target.value);
                // escolher na lista de sugestões já adiciona
                const id = porRotulo.get(e.target.value);
                if (id && !lista.includes(id) && lista.length < MAX_POSTOS) {
                  setLista([...lista, id]);
                  setBusca('');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  adicionar();
                }
              }}
            />
            <button type="button" className="btn btn-outline-primary" onClick={adicionar} disabled={lista.length >= MAX_POSTOS}>
              <i className="bi bi-plus-lg" /> Adicionar
            </button>
          </div>
          <datalist id="pgPostos">
            {postos.map((p) => (
              <option key={p.id} value={p.rotulo} />
            ))}
          </datalist>
        </div>
        <div className="col-6 col-lg-2">
          <label className="form-label small" htmlFor="pgDe">
            De
          </label>
          <input id="pgDe" className="form-control" type="date" name="de" value={inicio} max={hoje} min="2010-01-01" onChange={(e) => {
              setInicio(e.target.value);
              setComparar(e.target.value);
            }} required />
        </div>
        <div className="col-6 col-lg-2">
          <label className="form-label small" htmlFor="pgAte">
            Até
          </label>
          <input id="pgAte" className="form-control" type="date" name="ate" value={fim} max={hoje} min="2010-01-01" onChange={(e) => setFim(e.target.value)} required />
        </div>
        <div className="col-lg-2">
          <label className="form-label small" htmlFor="pgRef">
            Comparar com a média de
          </label>
          <select id="pgRef" className="form-select" name="ref" value={opcoesDia.includes(comparar) ? comparar : (opcoesDia[0] ?? '')} onChange={(e) => setComparar(e.target.value)}>
            {opcoesDia.map((d) => (
              <option key={d} value={d}>
                {diaMes(d)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
        {lista.length === 0 && <span className="small text-secondary">Nenhum posto escolhido. Busque e adicione até {MAX_POSTOS} postos.</span>}
        {lista.map((id) => (
          <span key={id} className="badge rounded-pill text-bg-light border d-inline-flex align-items-center gap-1 fw-normal">
            <input type="hidden" name="p" value={id} />
            {porId.get(id)}
            <button type="button" className="btn-close btn-close-sm ms-1" style={{ fontSize: '.6rem' }} aria-label={`Remover ${porId.get(id)}`} onClick={() => setLista(lista.filter((x) => x !== id))} />
          </span>
        ))}
        <button type="submit" className="btn btn-primary ms-auto" disabled={!lista.length || Boolean(erroPeriodo)}>
          <i className="bi bi-graph-up me-1" /> Gerar gráficos
        </button>
      </div>
      {erroPeriodo && <div className="small text-danger mt-2">{erroPeriodo}</div>}
    </Form>
  );
}
