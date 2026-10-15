'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Alertas } from '@/components/alertas';
import type { EstadoAdmin } from '@/lib/admin/estado';
import { excluirDocumentoAcao, salvarDocumentoAcao, type ValoresDocumento } from './actions';

const inicial = { erros: [], versao: 0 };
const ACCEPT = '.pdf,.docx,.xlsx,.pptx,.csv,.txt,.png,.jpg,.jpeg,.zip';

export function FormDocumento({
  id,
  inicialValores,
  salas,
  categorias,
  formatos,
}: {
  id: string | null;
  inicialValores: ValoresDocumento;
  salas: { id: number; nome: string }[];
  categorias: { id: number; sala_id: number | null; nome: string }[];
  formatos: string;
}) {
  const [estado, acao, pendente] = useActionState(salvarDocumentoAcao, inicial as EstadoAdmin<ValoresDocumento>);
  const v = estado.valores ?? inicialValores;
  const comuns = categorias.filter((c) => c.sala_id === null);
  const porSala = salas
    .map((s) => ({ sala: s, cats: categorias.filter((c) => c.sala_id === s.id) }))
    .filter((g) => g.cats.length > 0);

  return (
    <section className="cartao">
      {id && <h2>Editar</h2>}
      <Alertas erros={estado.erros} mensagem={estado.mensagem} />
      <form key={estado.versao} action={acao} className="formulario" noValidate>
        {id && <input type="hidden" name="id" value={id} />}
        <div className="colunas">
          <label>
            Sala
            <select name="sala_id" defaultValue={v.salaId || ''} disabled={!!id} required>
              <option value="">Selecione…</option>
              {salas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
            {id && <small className="suave">A sala não muda depois do envio.</small>}
          </label>
          <label>
            Categoria
            <select name="categoria_id" defaultValue={v.categoriaId || ''}>
              <option value="">Sem categoria</option>
              {comuns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
              {porSala.map((g) => (
                <optgroup key={g.sala.id} label={`Só em ${g.sala.nome}`}>
                  {g.cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            Data do documento
            <input name="data_documento" type="date" defaultValue={v.dataDocumento} />
          </label>
        </div>
        <label>
          Título
          <input name="titulo" defaultValue={v.titulo} maxLength={255} required />
        </label>
        <label>
          Descrição
          <textarea name="descricao" defaultValue={v.descricao} maxLength={2000} rows={3} />
        </label>
        <label>
          {id ? 'Substituir o arquivo (opcional)' : 'Arquivo'}
          <input name="arquivo" type="file" accept={ACCEPT} required={!id} />
          <small className="suave">Aceitos: {formatos}. Até 30 MB.</small>
        </label>
        <label className="check">
          <input type="checkbox" name="publico" value="1" defaultChecked={v.publico} />
          <span>
            Público <small className="suave">— aparece na página de documentos do site</small>
          </span>
        </label>
        <div className="acoes">
          <Link href="/acesso/documentos" className="botao botao-secundario">
            Voltar
          </Link>
          <button type="submit" className="botao" disabled={pendente}>
            {pendente ? 'Enviando…' : id ? 'Salvar alterações' : 'Enviar documento'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function ExcluirDocumento({ id }: { id: string }) {
  const [estado, acao, pendente] = useActionState(excluirDocumentoAcao, inicial as EstadoAdmin);
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!window.confirm('Excluir este documento? Ele some das listas; o histórico é preservado.')) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Alertas erros={estado.erros} />
      <button type="submit" className="botao botao-perigo" disabled={pendente}>
        Excluir documento
      </button>
    </form>
  );
}
