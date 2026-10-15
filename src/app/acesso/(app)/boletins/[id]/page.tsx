import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Cabecalho, Mensagem } from '@/components/acesso/pecas';
import { obterArquivo, situacaoArquivo } from '@/lib/arquivos';
import { acl } from '@/lib/auth/acl';
import { acoesDisponiveis, EDITAVEIS, historico, obter, podeEditar, podeExcluir, ROTULO_STATUS, salasComPermissao, TRANSICOES, versoes, type Acao } from '@/lib/boletins';
import { dataBr, dataHora } from '@/lib/formato';
import { acaoBoletimAcao } from '../actions';
import { BotaoConfirmar } from '../componentes';

export const metadata: Metadata = { title: 'Boletim' };

const ICONE: Record<Acao, string> = {
  enviar_revisao: 'bi-send', aprovar: 'bi-check2-circle', devolver: 'bi-arrow-return-left', publicar: 'bi-globe2',
  despublicar: 'bi-eye-slash', arquivar: 'bi-archive', reabrir: 'bi-arrow-counterclockwise',
};
const CONFIRMAR: Acao[] = ['publicar', 'despublicar', 'arquivar'];
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const kb = (bytes: string | null) => Math.round(Number(bytes ?? 0) / 1024).toLocaleString('pt-BR');

/** Página de um boletim (boletins/ver.php do PHP): situação, PDF, histórico e próximos passos. */
export default async function VerBoletim({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await acl();
  const { id } = await params;
  const b = /^\d{1,15}$/.test(id) ? await obter(Number(id)) : null;
  if (!b) notFound();
  if (!(await salasComPermissao(a, 'visualizar_boletins')).some((s) => s.id === b.sala_id)) redirect('/acesso/sem-acesso');

  const sp = await searchParams;
  const [vs, hs, arquivo] = await Promise.all([versoes(Number(b.id)), historico(Number(b.id)), obterArquivo(b.pdf_arquivo_id)]);
  const guardado = arquivo ? await situacaoArquivo(arquivo) : null;
  const acoes = acoesDisponiveis(b, a);
  const editar = podeEditar(b, a);
  const podeSalvarVersao = EDITAVEIS.includes(b.status) && a.pode('editar_boletim', b.sala_id);
  const base = `/acesso/boletins/${b.id}`;

  const acaoFeita = um(sp.acao) as Acao;
  const aviso: string | undefined = {
    criado: 'Boletim cadastrado como rascunho.',
    salvo: 'Dados salvos.',
    'salvo-pdf': 'Dados salvos e PDF substituído.',
    'sem-mudanca': 'Nenhuma alteração para salvar.',
    versao: `Versão v${um(sp.v).replace(/\D/g, '')} salva.`,
    acao: Object.hasOwn(TRANSICOES, acaoFeita) ? `${TRANSICOES[acaoFeita].rotulo}: feito.` : undefined,
  }[um(sp.aviso)];
  const naoEditavel = um(sp.aviso) === 'nao-editavel';

  return (
    <>
      {aviso && <Mensagem tipo="sucesso">{aviso}</Mensagem>}
      {naoEditavel && (
        <Mensagem tipo="aviso">
          Boletim &ldquo;{ROTULO_STATUS[b.status]}&rdquo; não pode ser editado. {b.status === 'publicado' ? 'Despublique-o antes.' : 'Devolva-o para ajustes antes.'}
        </Mensagem>
      )}
      {um(sp.erro) && <Mensagem tipo="erro">{um(sp.erro).slice(0, 500)}</Mensagem>}
      <Cabecalho
        titulo={b.titulo}
        subtitulo={`${b.tipo_nome} · referência ${dataBr(b.data_referencia)}${b.competencia ? ` · competência ${b.competencia}` : ''}`}
        trilha={[
          ['Painel', '/acesso'],
          ['Boletins', `/acesso/boletins?sala=${b.sala_id}`],
          ['Boletim', null],
        ]}
        acoes={
          <>
            {editar && (
              <Link className="btn btn-outline-primary" href={`${base}/editar`}>
                <i className="bi bi-pencil me-1" /> Editar
              </Link>
            )}
            {b.pdf_arquivo_id && (
              <a className="btn btn-primary" href={`${base}/pdf`} target="_blank" rel="noopener">
                <i className="bi bi-file-earmark-pdf me-1" /> Abrir PDF
              </a>
            )}
          </>
        }
      />

      <div className="row g-3">
        <div className="col-xl-8">
          <section className="acesso-card mb-3">
            <div className="d-flex flex-wrap gap-4">
              <div>
                <small className="text-secondary d-block">Situação</small>
                <span className={`acesso-status acesso-status--${b.status}`}>{ROTULO_STATUS[b.status]}</span>
              </div>
              <div>
                <small className="text-secondary d-block">Versão</small>
                <strong>v{b.versao_atual}</strong>
              </div>
              <div>
                <small className="text-secondary d-block">Inserido por</small>
                {dataHora(b.criado_em)} · {b.criado_por_nome ?? '—'}
              </div>
              <div>
                <small className="text-secondary d-block">Última alteração</small>
                {dataHora(b.atualizado_em ?? b.criado_em)} · {b.atualizado_por_nome ?? '—'}
              </div>
              {b.publicado_em && (
                <div>
                  <small className="text-secondary d-block">{b.status === 'publicado' ? 'Publicado' : 'Última publicação'}</small>
                  {dataHora(b.publicado_em)} · {b.publicado_por_nome ?? '—'}
                </div>
              )}
            </div>
            <hr />
            {arquivo && guardado ? (
              <>
                <p className="mb-0">
                  <i className="bi bi-file-earmark-pdf text-danger" /> {b.pdf_nome}{' '}
                  <small className="text-secondary">
                    · {kb(b.pdf_tamanho)} KB · {dataHora(b.pdf_em)}
                  </small>
                </p>
                <p className="small mb-0 mt-1">
                  <i className="bi bi-folder2" /> Pasta: <code>{arquivo.caminho.replace(/[^/]+$/, '')}</code>{' '}
                  {guardado.naPasta ? (
                    <span className="text-success">
                      <i className="bi bi-check-circle" /> na pasta
                    </span>
                  ) : (
                    <span className="text-warning">
                      <i className="bi bi-exclamation-circle" /> fora da pasta{guardado.noBanco ? ' (será regravado do banco ao abrir)' : ''}
                    </span>
                  )}{' '}
                  ·{' '}
                  {guardado.noBanco ? (
                    <span className="text-success">
                      <i className="bi bi-database-check" /> cópia no banco
                    </span>
                  ) : (
                    <span className="text-warning">
                      <i className="bi bi-database-exclamation" /> sem cópia no banco
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="mb-0 text-warning">
                <i className="bi bi-exclamation-triangle" /> Este boletim ainda não tem PDF.
              </p>
            )}
            {b.status === 'publicado' && b.tipo_publico ? (
              <p className="small text-success mb-0 mt-2">
                <i className="bi bi-globe2" /> Visível no site público.
              </p>
            ) : (
              !b.tipo_publico && (
                <p className="small text-secondary mb-0 mt-2">
                  <i className="bi bi-lock" /> Boletim interno: não é publicado no site.
                </p>
              )
            )}
          </section>

          <section className="acesso-card mb-3">
            <h2 className="acesso-card__titulo">
              <i className="bi bi-clock-history" /> Histórico
            </h2>
            <ul className="nav nav-tabs mb-3" role="tablist">
              <li className="nav-item" role="presentation">
                <button className="nav-link active" data-bs-toggle="tab" data-bs-target="#h-status" type="button" role="tab">
                  Situação ({hs.length})
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button className="nav-link" data-bs-toggle="tab" data-bs-target="#h-versoes" type="button" role="tab">
                  Versões ({vs.length})
                </button>
              </li>
            </ul>
            <div className="tab-content">
              <div className="tab-pane fade show active" id="h-status" role="tabpanel">
                <ul className="acesso-linha-tempo">
                  {hs.map((h, i) => (
                    <li key={i}>
                      <span className="acesso-linha-tempo__quando">
                        {dataHora(h.criado_em)} · {h.autor ?? 'sistema'}
                      </span>
                      <span>
                        {h.status_de ? `${ROTULO_STATUS[h.status_de]} → ` : ''}
                        <strong>{ROTULO_STATUS[h.status_para]}</strong>
                      </span>
                      {h.comentario && <small className="text-secondary">&ldquo;{h.comentario}&rdquo;</small>}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="tab-pane fade" id="h-versoes" role="tabpanel">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Versão</th>
                      <th>Quando</th>
                      <th>Quem</th>
                      <th>Situação</th>
                      <th>Motivo</th>
                      <th>PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vs.map((v) => (
                      <tr key={v.versao}>
                        <td>v{v.versao}</td>
                        <td className="small text-nowrap">{dataHora(v.criado_em)}</td>
                        <td className="small">{v.autor ?? '—'}</td>
                        <td className="small">{ROTULO_STATUS[v.status]}</td>
                        <td className="small">{v.comentario ?? ''}</td>
                        <td>
                          {v.tem_pdf && (
                            <a href={`${base}/pdf?v=${v.versao}`} target="_blank" rel="noopener" title="PDF desta versão" aria-label={`PDF da versão ${v.versao}`}>
                              <i className="bi bi-file-earmark-pdf" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        <div className="col-xl-4">
          <section className="acesso-card mb-3">
            <h2 className="acesso-card__titulo">
              <i className="bi bi-signpost-split" /> Próximos passos
            </h2>
            {acoes.length === 0 && <p className="small text-secondary mb-0">Nenhuma ação disponível para o seu perfil nesta situação.</p>}
            {acoes.map((x) => {
              const classe = `btn ${x.acao === 'publicar' || x.acao === 'aprovar' ? 'btn-success' : 'btn-outline-primary'} w-100`;
              const conteudo = (
                <>
                  <i className={`bi ${ICONE[x.acao]} me-1`} /> {x.rotulo}
                </>
              );
              return (
                <form key={x.acao} action={acaoBoletimAcao} className="mb-2">
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="acao" value={x.acao} />
                  {x.acao === 'devolver' && (
                    <>
                      <label className="visually-hidden" htmlFor="motivo-devolver">
                        Motivo da devolução
                      </label>
                      <textarea className="form-control form-control-sm mb-1" id="motivo-devolver" name="comentario" rows={2} maxLength={500} placeholder="Motivo da devolução (obrigatório)" required />
                    </>
                  )}
                  {CONFIRMAR.includes(x.acao) ? (
                    <BotaoConfirmar className={classe} pergunta={`${x.rotulo}: ${b.titulo}?`} disabled={!!x.bloqueio}>
                      {conteudo}
                    </BotaoConfirmar>
                  ) : (
                    <button className={classe} type="submit" disabled={!!x.bloqueio}>
                      {conteudo}
                    </button>
                  )}
                  {x.bloqueio && <small className="d-block text-warning mt-1">{x.bloqueio}</small>}
                </form>
              );
            })}
            {podeSalvarVersao && (
              <form action={acaoBoletimAcao} className="mt-3">
                <input type="hidden" name="id" value={b.id} />
                <input type="hidden" name="acao" value="salvar_versao" />
                <label className="form-label small mb-1" htmlFor="comentario-versao">
                  Salvar uma versão agora
                </label>
                <div className="input-group input-group-sm">
                  <input className="form-control" id="comentario-versao" name="comentario" maxLength={500} placeholder="Comentário (opcional)" />
                  <button className="btn btn-outline-secondary" type="submit" aria-label="Salvar versão" title="Salvar versão">
                    <i className="bi bi-save" />
                  </button>
                </div>
              </form>
            )}
          </section>

          {podeExcluir(b, a) && (
            <section className="acesso-card">
              <form action={acaoBoletimAcao}>
                <input type="hidden" name="id" value={b.id} />
                <input type="hidden" name="acao" value="excluir" />
                <BotaoConfirmar
                  className="btn btn-outline-danger w-100"
                  pergunta={
                    b.status === 'publicado'
                      ? 'Este boletim está PUBLICADO. Excluir e retirar do site agora? O histórico é preservado.'
                      : 'Excluir este boletim? Ele sai das listas; o histórico é preservado.'
                  }
                >
                  <i className="bi bi-trash me-1" /> Excluir boletim
                </BotaoConfirmar>
              </form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
