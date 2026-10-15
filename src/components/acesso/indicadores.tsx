import Link from 'next/link';
import {
  atalhosGeracao,
  atividades,
  boletinsPorStatus,
  documentosRecentes,
  ultimosBoletins,
  type Contagem,
} from '@/lib/acesso/painel';
import type { Acl } from '@/lib/auth/acl';
import { ROTULO_STATUS, type Status } from '@/lib/boletins';
import { dataHora } from '@/lib/formato';

const CARDS: [keyof Contagem, string, string, string][] = [
  ['rascunho', 'Rascunhos', 'bi-pencil-square', 'rascunho'],
  ['em_revisao', 'Aguardando revisão', 'bi-hourglass-split', 'revisao'],
  ['aprovado', 'Aprovados', 'bi-check2-circle', 'aprovado'],
  ['publicado', 'Publicados', 'bi-globe2', 'publicado'],
];

const dentro = (salas: number[], a: Acl, permissao: string) => salas.filter((id) => a.pode(permissao, id));

/**
 * Bloco de indicadores do painel geral (salaId null) ou de uma sala
 * (partials/dashboard.php).
 */
export async function Indicadores({ a, salas, salaId }: { a: Acl; salas: number[]; salaId: number | null }) {
  const salasBoletim = dentro(salas, a, 'visualizar_boletins');
  const salasDocs = dentro(salas, a, 'visualizar_documentos');
  const [contagem, ultimos, documentos, atalhos, recentes] = await Promise.all([
    boletinsPorStatus(salasBoletim),
    ultimosBoletins(salasBoletim),
    documentosRecentes(salasDocs),
    atalhosGeracao(dentro(salas, a, 'criar_boletim')),
    atividades(a, salaId),
  ]);

  return (
    <>
      {salasBoletim.length > 0 && (
        <div className="row g-3 mb-4">
          {CARDS.map(([status, rotulo, icone, classe]) => (
            <div key={status} className="col-6 col-xl-3">
              <div className={`acesso-kpi acesso-kpi--${classe}`}>
                <i className={`bi ${icone}`} />
                <div>
                  <span className="acesso-kpi__valor">{contagem[status]}</span>
                  <span className="acesso-kpi__rotulo">{rotulo}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="row g-3">
        <div className="col-xl-8">
          {atalhos.length > 0 && (
            <section className="acesso-card mb-3">
              <h2 className="acesso-card__titulo">
                <i className="bi bi-lightning-charge" /> Gerar boletim
              </h2>
              <div className="acesso-atalhos">
                {atalhos.map((t) => (
                  <Link key={t.id} className="acesso-atalho" href={`/acesso/boletins/novo?tipo=${t.id}`}>
                    <i className="bi bi-file-earmark-arrow-up" />
                    <span>
                      <strong>{t.nome}</strong>
                      <small>{t.sala} · cadastrar PDF</small>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {salasBoletim.length > 0 && (
            <section className="acesso-card mb-3">
              <h2 className="acesso-card__titulo">
                <i className="bi bi-journal-text" /> Últimos boletins
              </h2>
              {ultimos.length === 0 ? (
                <p className="text-secondary small mb-0">Nenhum boletim cadastrado ainda.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Boletim</th>
                        <th>Sala</th>
                        <th>Referência</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ultimos.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <Link href={`/acesso/boletins/${b.id}`}>{b.titulo}</Link>
                            <small className="d-block text-secondary">{b.tipo}</small>
                          </td>
                          <td>{b.sala}</td>
                          <td>{b.data_referencia}</td>
                          <td>
                            <span className={`acesso-status acesso-status--${b.status}`}>{ROTULO_STATUS[b.status as Status] ?? b.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="col-xl-4">
          <section className="acesso-card mb-3">
            <h2 className="acesso-card__titulo">
              <i className="bi bi-clock-history" /> Últimas atividades
            </h2>
            {recentes.length === 0 ? (
              <p className="text-secondary small mb-0">Nenhuma atividade registrada.</p>
            ) : (
              <ul className="acesso-linha-tempo">
                {recentes.map((r) => (
                  <li key={r.id}>
                    <span className="acesso-linha-tempo__quando">
                      {dataHora(r.criado_em)}
                      {r.sala ? ` · ${r.sala}` : ''}
                    </span>
                    <span>{r.descricao || `${r.modulo} / ${r.acao}`}</span>
                    <small className="text-secondary">{r.usuario_nome || 'sistema'}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {salasDocs.length > 0 && (
            <section className="acesso-card mb-3">
              <h2 className="acesso-card__titulo">
                <i className="bi bi-folder2-open" /> Documentos recentes
              </h2>
              {documentos.length === 0 ? (
                <p className="text-secondary small mb-0">Nenhum documento enviado ainda.</p>
              ) : (
                <ul className="list-unstyled small mb-0">
                  {documentos.map((d) => (
                    <li key={d.id} className="py-1 border-bottom">
                      <Link href={`/acesso/documentos/${d.id}`}>{d.titulo}</Link>{' '}
                      <span className="text-secondary">
                        · {d.sala} · {dataHora(d.criado_em).slice(0, 10)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
