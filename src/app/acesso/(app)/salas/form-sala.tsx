'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Alertas } from '@/components/alertas';
import type { EstadoAdmin } from '@/lib/admin/estado';
import type { DadosSala, Modulo } from '@/lib/admin/salas';
import { salvarSalaAcao } from './actions';

export function FormSala({ id, inicial, modulos }: { id: number | null; inicial: DadosSala; modulos: Modulo[] }) {
  const [estado, acao, pendente] = useActionState(salvarSalaAcao, { erros: [], versao: 0 } as EstadoAdmin<DadosSala>);
  const v = estado.valores ?? inicial;

  return (
    <>
      <Alertas erros={estado.erros} mensagem={estado.mensagem} />
      <form key={estado.versao} action={acao} className="formulario" noValidate>
        {id && <input type="hidden" name="id" value={id} />}
        <div className="colunas">
          <section className="cartao">
            <h2>Dados</h2>
            <label>
              Nome
              <input name="nome" defaultValue={v.nome} maxLength={150} required />
            </label>
            <label>
              Identificador (usado nos endereços)
              <input
                name="slug"
                defaultValue={v.slug}
                maxLength={60}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                readOnly={!!id}
                required
              />
              <small className="suave">
                {id
                  ? 'Não pode ser alterado depois de criado.'
                  : 'Letras minúsculas sem acento, números e hífen (ex.: baixada-santista). Não poderá ser alterado.'}
              </small>
            </label>
            <label>
              Sigla
              <input name="sigla" defaultValue={v.sigla} maxLength={30} />
            </label>
            <label>
              Descrição
              <textarea name="descricao" defaultValue={v.descricao} maxLength={500} rows={3} />
            </label>
          </section>

          <section className="cartao">
            <h2>Exibição e módulos</h2>
            <label>
              Cor de destaque
              <span className="linha">
                <input name="cor" defaultValue={v.cor} maxLength={7} placeholder="#0B4F8A" pattern="#[0-9a-fA-F]{6}" />
                {/^#[0-9a-fA-F]{6}$/.test(v.cor) && <span className="amostra" style={{ background: v.cor }} aria-hidden />}
              </span>
            </label>
            <label>
              Ordem na lista
              <input name="ordem" type="number" min={0} max={9999} defaultValue={v.ordem} />
            </label>
            <label>
              Situação
              <select name="status" defaultValue={v.status}>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa (some das telas; dados preservados)</option>
              </select>
            </label>
            <fieldset>
              <legend>Módulos habilitados</legend>
              {modulos.map((m) => (
                <label key={m.id} className="check">
                  <input type="checkbox" name="modulos" value={m.id} defaultChecked={v.modulos.includes(m.id)} />
                  {m.nome}
                </label>
              ))}
            </fieldset>
          </section>
        </div>
        <div className="acoes">
          <Link href="/acesso/salas" className="botao botao-secundario">
            Voltar
          </Link>
          <button type="submit" className="botao" disabled={pendente}>
            {pendente ? 'Salvando…' : id ? 'Salvar alterações' : 'Cadastrar sala'}
          </button>
        </div>
      </form>
    </>
  );
}
