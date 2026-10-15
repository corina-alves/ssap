'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Alertas } from '@/components/alertas';
import type { EstadoAdmin } from '@/lib/admin/estado';
import type { DadosTipo } from '@/lib/admin/tipos-boletim';
import { salvarTipoAcao } from './actions';

const PERIODICIDADES = { diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal', eventual: 'Eventual' };

export function FormTipo({
  id,
  inicial,
  salas,
}: {
  id: number | null;
  inicial: DadosTipo;
  salas: { id: number; nome: string }[];
}) {
  const [estado, acao, pendente] = useActionState(salvarTipoAcao, { erros: [], versao: 0 } as EstadoAdmin<DadosTipo>);
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
              Sala
              <select name="sala_id" defaultValue={v.salaId || ''} disabled={!!id} required>
                <option value="">Selecione…</option>
                {salas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
              {id && <small className="suave">A sala não pode ser alterada depois de criado.</small>}
            </label>
            <label>
              Nome
              <input name="nome" defaultValue={v.nome} maxLength={150} required />
            </label>
            <label>
              Identificador
              <input name="slug" defaultValue={v.slug} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={!!id} required />
              <small className="suave">
                {id ? 'Não pode ser alterado depois de criado.' : 'Letras minúsculas sem acento, números e hífen (ex.: boletim-diario).'}
              </small>
            </label>
            <label>
              Descrição
              <textarea name="descricao" defaultValue={v.descricao} maxLength={500} rows={3} />
            </label>
          </section>

          <section className="cartao">
            <h2>Publicação</h2>
            <label>
              Periodicidade
              <select name="periodicidade" defaultValue={v.periodicidade}>
                {Object.entries(PERIODICIDADES).map(([k, r]) => (
                  <option key={k} value={k}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ordem na lista
              <input name="ordem" type="number" min={0} max={9999} defaultValue={v.ordem} />
            </label>
            <label className="check">
              <input type="checkbox" name="exige_revisao" value="1" defaultChecked={v.exigeRevisao} />
              <span>
                Exige revisão <small className="suave">— o boletim passa por aprovação antes de publicar</small>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" name="publico" value="1" defaultChecked={v.publico} />
              <span>
                Público <small className="suave">— desmarcado, o boletim é interno e nunca vai ao site</small>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" name="ativo" value="1" defaultChecked={v.ativo} />
              <span>
                Ativo <small className="suave">— desmarcado, não aceita boletins novos</small>
              </span>
            </label>
          </section>
        </div>
        <div className="acoes">
          <Link href="/acesso/tipos-boletim" className="botao botao-secundario">
            Voltar
          </Link>
          <button type="submit" className="botao" disabled={pendente}>
            {pendente ? 'Salvando…' : id ? 'Salvar alterações' : 'Cadastrar tipo'}
          </button>
        </div>
      </form>
    </>
  );
}
