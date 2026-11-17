import Link from 'next/link';
import {
  atalhosGeracao,
  atividades,
  boletinsPorStatus,
  documentosRecentes,
  ultimosBoletins,
  type AtalhoTipo,
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

/** Dados do bloco de indicadores, já filtrados pelas permissões de cada sala. */
export async function dadosIndicadores(a: Acl, salas: number[], salaId: number | null) {
  const salasBoletim = dentro(salas, a, 'visualizar_boletins');
  const salasDocs = dentro(salas, a, 'visualizar_documentos');
  const [contagem, ultimos, documentos, atalhos, recentes] = await Promise.all([
    boletinsPorStatus(salasBoletim),
    ultimosBoletins(salasBoletim),
    documentosRecentes(salasDocs),
    atalhosGeracao(dentro(salas, a, 'criar_boletim')),
    atividades(a, salaId),
  ]);
  return { veBoletins: salasBoletim.length > 0, veDocumentos: salasDocs.length > 0, contagem, ultimos, documentos, atalhos, recentes };
}

export type DadosIndicadores = Awaited<ReturnType<typeof dadosIndicadores>>;

/** Os quatro números de boletins por situação. */
export function ContagemBoletins({ d }: { d: DadosIndicadores }) {
  if (!d.veBoletins) return null;
  return (
    <div className="row g-3 mb-4">
      {CARDS.map(([status, rotulo, icone, classe]) => (
        <div key={status} className="col-6 col-xl-3">
          <div className={`acesso-kpi acesso-kpi--${classe}`}>
            <i className={`bi ${icone}`} />
            <div>
              <span className="acesso-kpi__valor">{d.contagem[status]}</span>
              <span className="acesso-kpi__rotulo">{rotulo}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tipos de boletim que o usuário pode cadastrar (PDF). `comSala`: mostra a sala de cada tipo (no painel geral). */
export function AtalhosGeracao({ atalhos, comSala = true }: { atalhos: AtalhoTipo[]; comSala?: boolean }) {
  return (
    <div className="acesso-atalhos">
      {atalhos.map((t) => (
        <Link key={t.id} className="acesso-atalho" href={`/acesso/boletins/novo?tipo=${t.id}`}>
          <i className="bi bi-file-earmark-arrow-up" />
          <span>
            <strong>{t.nome}</strong>
            <small>{comSala ? `${t.sala} · cadastrar PDF` : 'cadastrar PDF'}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function UltimosBoletins({ d }: { d: DadosIndicadores }) {
  if (!d.veBoletins) return null;
  return (
    <section className="acesso-card mb-3">
      <h2 className="acesso-card__titulo">
        <i className="bi bi-journal-text" /> Últimos boletins
      </h2>
      {d.ultimos.length === 0 ? (
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
              {d.ultimos.map((b) => (
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
  );
}

export function UltimasAtividades({ d }: { d: DadosIndicadores }) {
  return (
    <section className="acesso-card mb-3">
      <h2 className="acesso-card__titulo">
        <i className="bi bi-clock-history" /> Últimas atividades
      </h2>
      {d.recentes.length === 0 ? (
        <p className="text-secondary small mb-0">Nenhuma atividade registrada.</p>
      ) : (
        <ul className="acesso-linha-tempo">
          {d.recentes.map((r) => (
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
  );
}

export function DocumentosRecentes({ d }: { d: DadosIndicadores }) {
  if (!d.veDocumentos) return null;
  return (
    <section className="acesso-card mb-3">
      <h2 className="acesso-card__titulo">
        <i className="bi bi-folder2-open" /> Documentos recentes
      </h2>
      {d.documentos.length === 0 ? (
        <p className="text-secondary small mb-0">Nenhum documento enviado ainda.</p>
      ) : (
        <ul className="list-unstyled small mb-0">
          {d.documentos.map((doc) => (
            <li key={doc.id} className="py-1 border-bottom">
              <Link href={`/acesso/documentos/${doc.id}`}>{doc.titulo}</Link>{' '}
              <span className="text-secondary">
                · {doc.sala} · {dataHora(doc.criado_em).slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Bloco de indicadores do painel geral (partials/dashboard.php). A visão geral
 * de uma sala monta as mesmas peças em outra ordem (salas/sala/page.tsx).
 */
export async function Indicadores({ a, salas, salaId }: { a: Acl; salas: number[]; salaId: number | null }) {
  const d = await dadosIndicadores(a, salas, salaId);
  return (
    <>
      <ContagemBoletins d={d} />

      <div className="row g-3">
        <div className="col-xl-8">
          {d.atalhos.length > 0 && (
            <section className="acesso-card mb-3">
              <h2 className="acesso-card__titulo">
                <i className="bi bi-lightning-charge" /> Gerar boletim
              </h2>
              <AtalhosGeracao atalhos={d.atalhos} />
            </section>
          )}
          <UltimosBoletins d={d} />
        </div>

        <div className="col-xl-4">
          <UltimasAtividades d={d} />
          <DocumentosRecentes d={d} />
        </div>
      </div>
    </>
  );
}
