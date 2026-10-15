'use client';

import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import type { EstadoAdmin } from '@/lib/admin/estado';
import { tituloFixo } from '@/lib/formato';
import { criarBoletimAcao, editarBoletimAcao, type ValoresBoletim } from './actions';

const inicial = { erros: [], versao: 0 };
const LIMITE = '30 MB';

function Erros({ erros }: { erros: string[] }) {
  if (!erros.length) return null;
  return (
    <div className="alert alert-danger d-flex gap-2 align-items-start" role="alert">
      <i className="bi bi-exclamation-octagon flex-shrink-0" />
      <div>
        {erros.map((e) => (
          <div key={e}>{e}</div>
        ))}
      </div>
    </div>
  );
}

/** Botão de envio que pede confirmação antes (o data-confirmar do PHP). */
export function BotaoConfirmar({ pergunta, className, rotulo, disabled, children }: { pergunta: string; className: string; rotulo?: string; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      className={className}
      aria-label={rotulo}
      title={rotulo}
      disabled={disabled}
      onClick={(e) => {
        if (!window.confirm(pergunta)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/**
 * Título, data de referência e, nos tipos mensais, a competência. Em tipo com
 * título fixo, o título não é digitado: acompanha a data de referência.
 */
function Campos({ v, mensal, rotuloCompetencia, fixo }: { v: ValoresBoletim; mensal: boolean; rotuloCompetencia: string; fixo: string | null }) {
  const [data, setData] = useState(v.dataReferencia);
  return (
    <>
      <div className="col-12">
        <label className="form-label" htmlFor="titulo">
          Título
        </label>
        {fixo ? (
          <>
            <input className="form-control" id="titulo" name="titulo" value={tituloFixo(fixo, data)} readOnly aria-describedby="titulo-ajuda" />
            <div className="form-text" id="titulo-ajuda">
              <i className="bi bi-lock" /> Título fixo deste tipo de boletim: muda só a data, que acompanha a data de referência.
            </div>
          </>
        ) : (
          <input className="form-control" id="titulo" name="titulo" defaultValue={v.titulo} maxLength={255} required />
        )}
      </div>
      <div className="col-md-6">
        <label className="form-label" htmlFor="data_referencia">
          Data de referência
        </label>
        <input className="form-control" type="date" id="data_referencia" name="data_referencia" defaultValue={v.dataReferencia} onChange={(e) => setData(e.target.value)} required />
      </div>
      {mensal && (
        <div className="col-md-6">
          <label className="form-label" htmlFor="competencia">
            {rotuloCompetencia}
          </label>
          <input className="form-control" type="month" id="competencia" name="competencia" defaultValue={v.competencia} />
          <div className="form-text">Em branco: o mês da data de referência.</div>
        </div>
      )}
    </>
  );
}

/** Cadastro de um boletim do tipo escolhido: metadados + o PDF pronto. */
export function FormNovoBoletim({
  tipo,
  cancelar,
  inicialValores,
}: {
  tipo: { id: number; nome: string; periodicidade: string; exige_revisao: boolean; titulo_fixo: string | null };
  cancelar: string;
  inicialValores: ValoresBoletim;
}) {
  const [estado, acao, pendente] = useActionState(criarBoletimAcao, inicial as EstadoAdmin<ValoresBoletim>);
  const v = estado.valores ?? inicialValores;
  return (
    <form key={estado.versao} action={acao} noValidate>
      <Erros erros={estado.erros} />
      <input type="hidden" name="tipo_id" value={tipo.id} />
      <h2 className="acesso-card__titulo">
        <i className="bi bi-file-earmark-arrow-up" /> {tipo.nome}
      </h2>
      <div className="row g-3">
        <Campos v={v} mensal={tipo.periodicidade === 'mensal'} rotuloCompetencia="Competência (mês)" fixo={tipo.titulo_fixo} />
        <div className="col-12">
          <label className="form-label" htmlFor="pdf">
            Arquivo PDF
          </label>
          <input className="form-control" type="file" id="pdf" name="pdf" accept="application/pdf,.pdf" required />
          <div className="form-text">O PDF gerado na página do boletim. Somente PDF, até {LIMITE}.</div>
        </div>
      </div>
      <p className="small text-secondary mt-3 mb-0">
        <i className="bi bi-info-circle" /> O boletim é cadastrado como <strong>rascunho</strong>
        {tipo.exige_revisao ? ' e precisa passar por revisão antes da publicação' : '; depois é só publicar no site'}.
      </p>
      <div className="d-flex justify-content-end gap-2 mt-3">
        <Link className="btn btn-outline-secondary" href={cancelar}>
          Cancelar
        </Link>
        <button className="btn btn-primary" type="submit" disabled={pendente}>
          <i className="bi bi-check2 me-1" /> {pendente ? 'Enviando…' : 'Cadastrar boletim'}
        </button>
      </div>
    </form>
  );
}

/** Edição dos metadados e, se quiser, troca do PDF (o anterior fica no histórico de versões). */
export function FormEditarBoletim({
  id,
  mensal,
  tituloFixo: fixo,
  pdfAtual,
  inicialValores,
}: {
  id: string;
  mensal: boolean;
  tituloFixo: string | null;
  pdfAtual: string | null;
  inicialValores: ValoresBoletim;
}) {
  const [estado, acao, pendente] = useActionState(editarBoletimAcao, inicial as EstadoAdmin<ValoresBoletim>);
  const v = estado.valores ?? inicialValores;
  return (
    <form key={estado.versao} action={acao} noValidate>
      <Erros erros={estado.erros} />
      <input type="hidden" name="id" value={id} />
      <div className="row g-3">
        <Campos v={v} mensal={mensal} rotuloCompetencia="Competência" fixo={fixo} />
        <div className="col-12">
          <label className="form-label" htmlFor="pdf">
            Substituir PDF <small className="text-secondary">(opcional)</small>
          </label>
          <input className="form-control" type="file" id="pdf" name="pdf" accept="application/pdf,.pdf" />
          <div className="form-text">Atual: {pdfAtual ?? 'nenhum'}. O PDF anterior continua disponível no histórico de versões.</div>
        </div>
      </div>
      <div className="d-flex justify-content-end mt-3">
        <button className="btn btn-primary" type="submit" disabled={pendente}>
          <i className="bi bi-check2 me-1" /> {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
