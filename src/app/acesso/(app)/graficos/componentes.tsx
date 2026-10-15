'use client';

import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';
import { TIPOS, MAX_SERIES } from '@/lib/graficos-tabela';
import { salvarGraficoAcao, type EstadoGrafico, type EstadoSalvarAnalise, type ValoresGrafico } from './actions';

/** Botão de envio que pede confirmação antes (o data-confirmar do PHP). */
export function BotaoConfirmar({ pergunta, className, rotulo, children }: { pergunta: string; className: string; rotulo?: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      className={className}
      aria-label={rotulo}
      onClick={(e) => {
        if (!window.confirm(pergunta)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/**
 * Formulário de gráfico com prévia. A prévia é desenhada pelo script original
 * do PHP (public/acesso/js/graficos.js), que lê os campos data-grafico-*.
 */
export function FormGrafico({ id, salaId, inicial }: { id: number | null; salaId: number; inicial: ValoresGrafico }) {
  const [estado, acao, pendente] = useActionState(salvarGraficoAcao, { erros: [] } as EstadoGrafico);
  const v = estado.valores ?? inicial;
  return (
    <form action={acao} noValidate>
      {estado.erros.map((e) => (
        <div key={e} className="alert alert-danger d-flex gap-2 align-items-start" role="alert">
          <i className="bi bi-exclamation-octagon flex-shrink-0" />
          <div>{e}</div>
        </div>
      ))}
      <input type="hidden" name="sala" value={salaId} />
      {id && <input type="hidden" name="id" value={id} />}
      <div className="row g-3">
        <div className="col-xl-5">
          <section className="acesso-card h-100">
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label" htmlFor="titulo">
                  Título
                </label>
                <input className="form-control" id="titulo" name="titulo" defaultValue={v.titulo} maxLength={255} required />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="tipo">
                  Tipo
                </label>
                <select className="form-select" id="tipo" name="tipo" defaultValue={v.tipo} data-grafico-campo="tipo">
                  {Object.entries(TIPOS).map(([k, r]) => (
                    <option key={k} value={k}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="fonte">
                  Fonte dos dados
                </label>
                <input className="form-control" id="fonte" name="fonte" defaultValue={v.fonte} maxLength={60} placeholder="SIBH, ANA..." />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="eixo_y">
                  Título do eixo
                </label>
                <input className="form-control" id="eixo_y" name="eixo_y" defaultValue={v.eixo_y} maxLength={60} data-grafico-campo="eixo_y" />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="unidade">
                  Unidade
                </label>
                <input className="form-control" id="unidade" name="unidade" defaultValue={v.unidade} maxLength={20} data-grafico-campo="unidade" />
              </div>
              <div className="col-12">
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="empilhado" name="empilhado" value="1" defaultChecked={v.empilhado} data-grafico-campo="empilhado" />
                  <label className="form-check-label" htmlFor="empilhado">
                    Séries empilhadas
                  </label>
                </div>
              </div>
              <div className="col-12">
                <label className="form-label" htmlFor="dados">
                  Dados
                </label>
                <textarea className="form-control font-monospace small" id="dados" name="dados" rows={12} required defaultValue={v.dados} data-grafico-dados="" />
                <div className="form-text">
                  Cole direto da planilha. 1ª linha: rótulo e nome de cada série (até {MAX_SERIES}). Separador: tabulação, ponto e vírgula ou
                  vírgula. Números com vírgula decimal; célula vazia = sem dado.
                </div>
              </div>
            </div>
          </section>
        </div>
        <div className="col-xl-7">
          <section className="acesso-card h-100">
            <h2 className="acesso-card__titulo">
              <i className="bi bi-eye" /> Prévia
            </h2>
            <div className="acesso-grafico acesso-grafico--grande">
              <canvas data-grafico-previa="" role="img" aria-label="Prévia do gráfico" />
            </div>
          </section>
        </div>
      </div>
      <div className="d-flex justify-content-end gap-2 mt-3">
        <Link className="btn btn-outline-secondary" href={`/acesso/graficos?sala=${salaId}`}>
          Cancelar
        </Link>
        <button className="btn btn-primary" type="submit" disabled={pendente}>
          <i className="bi bi-check2 me-1" /> {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

/** "Salvar na lista de gráficos" das análises: título editável + os parâmetros em campos ocultos. */
export function FormSalvarAnalise({
  acao,
  ocultos,
  titulo,
  listas = {},
  nota = '',
}: {
  acao: (estado: EstadoSalvarAnalise, form: FormData) => Promise<EstadoSalvarAnalise>;
  ocultos: Record<string, string>;
  titulo: string;
  /** Campos repetidos (ex.: locais marcados). */
  listas?: Record<string, string[]>;
  nota?: string;
}) {
  const [estado, enviar, pendente] = useActionState(acao, { erros: [] });
  return (
    <form className="acesso-card mb-3" action={enviar}>
      {Object.entries(ocultos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {Object.entries(listas).flatMap(([k, valores]) => valores.map((v) => <input key={`${k}-${v}`} type="hidden" name={k} value={v} />))}
      {estado.erros.length > 0 && <div className="alert alert-danger py-2">{estado.erros.join(' ')}</div>}
      <div className="row g-2 align-items-end">
        <div className="col-md">
          <label className="form-label small" htmlFor="titulo">
            Título do gráfico
          </label>
          <input className="form-control" id="titulo" name="titulo" maxLength={255} defaultValue={titulo} />
        </div>
        <div className="col-md-auto">
          <button className="btn btn-success" type="submit" disabled={pendente}>
            <i className="bi bi-save me-1" /> {pendente ? 'Salvando…' : 'Salvar na lista de gráficos'}
          </button>
        </div>
      </div>
      <p className="small text-secondary mt-2 mb-0">Fica como rascunho em Gráficos; de lá dá para ajustar e publicar no site.{nota && ` ${nota}`}</p>
    </form>
  );
}
