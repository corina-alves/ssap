'use client';

import { useActionState, useState } from 'react';
import { enviarImagemAcao, removerImagemAcao } from '@/app/acesso/(app)/boletim_mensal/actions';
import { ESTADO_INICIAL } from '@/lib/admin/estado';

export const FORM_TEXTOS = 'bm-textos';

/**
 * Texto do boletim. Editando: caixa de texto (do formulário único "Salvar
 * textos") e, na impressão, o parágrafo com o que está na caixa. Só leitura:
 * o parágrafo.
 */
export function TextoEditavel({ chave, inicial, editavel, herdado, linhas = 6 }: { chave: string; inicial: string; editavel: boolean; herdado: boolean; linhas?: number }) {
  const [texto, setTexto] = useState(inicial);
  const paragrafos = texto.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <>
      {editavel && (
        <div className="bm-so-tela">
          {herdado && <div className="bm-herdado">Texto do mês anterior — revise antes de gerar o PDF.</div>}
          <textarea name={`texto:${chave}`} form={FORM_TEXTOS} className="form-control form-control-sm bm-textarea" rows={linhas} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva o texto deste slide." />
        </div>
      )}
      <div className={editavel ? 'bm-so-impressao bm-texto' : 'bm-texto'}>
        {paragrafos.length ? paragrafos.map((p, i) => <p key={i}>{p}</p>) : <p className="bm-vazio">Texto não preenchido.</p>}
      </div>
    </>
  );
}

/** Imagem anexada pela equipe: mostra a imagem; editando, troca (envia ao escolher o arquivo) ou remove. */
export function ImagemEditavel({ salaId, mes, chave, legenda, arquivoId, editavel }: { salaId: number; mes: string; chave: string; legenda: string; arquivoId: number | null; editavel: boolean }) {
  const [envio, enviar, enviando] = useActionState(enviarImagemAcao, ESTADO_INICIAL);
  const [remocao, remover, removendo] = useActionState(removerImagemAcao, ESTADO_INICIAL);
  const erros = [...envio.erros, ...remocao.erros];
  return (
    <figure className="bm-figura">
      {arquivoId ? <img src={`/acesso/boletim_mensal/imagem/${arquivoId}`} alt={legenda} className="bm-imagem" /> : <div className="bm-sem-imagem">Imagem não anexada</div>}
      <figcaption>{legenda}</figcaption>
      {editavel && (
        <div className="bm-so-tela bm-imagem-acoes">
          <form action={enviar}>
            <input type="hidden" name="sala_id" value={salaId} />
            <input type="hidden" name="mes" value={mes} />
            <input type="hidden" name="chave" value={chave} />
            <label className="btn btn-sm btn-outline-primary mb-0">
              <i className="bi bi-upload" /> {enviando ? 'Enviando…' : arquivoId ? 'Trocar imagem' : 'Anexar imagem'}
              <input type="file" name="imagem" accept="image/png,image/jpeg" hidden onChange={(e) => e.currentTarget.form?.requestSubmit()} />
            </label>
          </form>
          {arquivoId && (
            <form action={remover}>
              <input type="hidden" name="sala_id" value={salaId} />
              <input type="hidden" name="mes" value={mes} />
              <input type="hidden" name="chave" value={chave} />
              <button type="submit" className="btn btn-sm btn-outline-danger" disabled={removendo}>
                <i className="bi bi-trash" /> Remover
              </button>
            </form>
          )}
          {erros.length > 0 && <div className="text-danger small w-100">{erros.join(' ')}</div>}
        </div>
      )}
    </figure>
  );
}
