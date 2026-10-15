import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Cabecalho, FerramentasBoletim, Mensagem, PaginacaoAcesso } from '@/components/acesso/pecas';
import { inteiro, texto } from '@/components/paginacao';
import { atalhosDaSala } from '@/lib/acesso/atalhos';
import { acl } from '@/lib/auth/acl';
import { autores as listarAutores, listar, podeEditar, podeExcluir, ROTULO_STATUS, salasComPermissao, STATUS, sugestoesTitulos, tiposAtivos } from '@/lib/boletins';
import { dataBr, dataHora } from '@/lib/formato';
import { acaoBoletimAcao } from './actions';
import { BotaoConfirmar } from './componentes';
import { BuscaAutocompletar } from '@/components/busca-autocompletar';

export const metadata: Metadata = { title: 'Boletins' };

const POR_PAGINA = 20;
const AVISOS: Record<string, string> = { excluido: 'Boletim excluído.', 'excluido-publicado': 'Boletim excluído e retirado do site.' };

/** Boletins de uma sala: filtros, lista e ações (boletins/index.php do PHP). */
export default async function PaginaBoletins({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await acl();
  const salas = await salasComPermissao(a, 'visualizar_boletins');
  if (!salas.length) redirect('/acesso/sem-acesso');
  const sp = await searchParams;
  // A lista é sempre de UMA sala; sem ela na URL, abre a primeira que o usuário vê.
  const sala = salas.find((s) => s.id === inteiro(sp.sala));
  if (!sala) redirect(`/acesso/boletins?sala=${salas[0]!.id}`);

  const f = { tipo: inteiro(sp.tipo), autor: inteiro(sp.autor), status: texto(sp.status, 20), busca: texto(sp.busca), de: texto(sp.de, 10), ate: texto(sp.ate, 10) };
  const pagina = Math.max(1, inteiro(sp.p));
  const [{ itens, total }, tipos, autores, sugestoes] = await Promise.all([
    listar([sala.id], { tipoId: f.tipo, criadoPor: f.autor, status: f.status, busca: f.busca, de: f.de, ate: f.ate }, pagina, POR_PAGINA),
    tiposAtivos([sala.id]),
    listarAutores([sala.id]),
    sugestoesTitulos([sala.id]),
  ]);
  const base = '/acesso/boletins';
  const params = { sala: String(sala.id), tipo: f.tipo ? String(f.tipo) : undefined, autor: f.autor ? String(f.autor) : undefined, status: f.status, busca: f.busca, de: f.de, ate: f.ate };
  const atalhos = atalhosDaSala(sala.slug).filter((t) => t.modulo === 'boletins' && a.pode(t.permissao, sala.id));
  const aviso = AVISOS[texto(sp.aviso, 30)];

  return (
    <>
      {aviso && <Mensagem tipo="sucesso">{aviso}</Mensagem>}
      <Cabecalho
        titulo="Boletins"
        subtitulo={sala.nome}
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, `/acesso/salas/sala?s=${sala.slug}`],
          ['Boletins', null],
        ]}
        acoes={
          a.pode('criar_boletim', sala.id) && (
            <Link className="btn btn-primary" href={`${base}/novo?sala=${sala.id}`}>
              <i className="bi bi-plus-lg me-1" /> Novo boletim
            </Link>
          )
        }
      />
      <FerramentasBoletim atalhos={atalhos} />

      <div className="acesso-card">
        <form className="row g-2 mb-3" method="get" action={base}>
          <input type="hidden" name="sala" value={sala.id} />
          <div className="col-md-3">
            <label className="visually-hidden" htmlFor="busca">
              Buscar
            </label>
            <BuscaAutocompletar sugestoes={sugestoes} className="form-control" id="busca" name="busca" defaultValue={f.busca} placeholder="Buscar pelo título" />
          </div>
          <div className="col-6 col-md-2">
            <label className="visually-hidden" htmlFor="f-tipo">
              Tipo
            </label>
            <select className="form-select" id="f-tipo" name="tipo" defaultValue={f.tipo || ''}>
              <option value="">Todos os tipos</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="visually-hidden" htmlFor="f-autor">
              Inserido por
            </label>
            <select className="form-select" id="f-autor" name="autor" defaultValue={f.autor || ''}>
              <option value="">Inserido por: todos</option>
              {autores.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="visually-hidden" htmlFor="f-status">
              Situação
            </label>
            <select className="form-select" id="f-status" name="status" defaultValue={f.status}>
              <option value="">Todas as situações</option>
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md">
            <label className="visually-hidden" htmlFor="f-de">
              De
            </label>
            <input className="form-control" type="date" id="f-de" name="de" defaultValue={f.de} title="Referência a partir de" />
          </div>
          <div className="col-6 col-md">
            <label className="visually-hidden" htmlFor="f-ate">
              Até
            </label>
            <input className="form-control" type="date" id="f-ate" name="ate" defaultValue={f.ate} title="Referência até" />
          </div>
          <div className="col-md-auto d-grid">
            <button className="btn btn-outline-primary" type="submit" aria-label="Filtrar" title="Filtrar">
              <i className="bi bi-search" />
            </button>
          </div>
        </form>

        {itens.length === 0 ? (
          <p className="text-secondary mb-0">Nenhum boletim encontrado.</p>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Boletim</th>
                    <th>Referência</th>
                    <th>Situação</th>
                    <th>Inserido por</th>
                    <th>Última alteração</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`${base}/${b.id}`}>
                          <strong>{b.titulo}</strong>
                        </Link>
                        <small className="d-block text-secondary">
                          {b.tipo_nome}
                          {b.tem_pdf ? '' : ' · sem PDF'}
                        </small>
                      </td>
                      <td className="text-nowrap">{dataBr(b.data_referencia)}</td>
                      <td>
                        <span className={`acesso-status acesso-status--${b.status}`}>{ROTULO_STATUS[b.status]}</span>
                      </td>
                      <td className="small">
                        {b.criado_por ? (
                          <Link href={`${base}?sala=${sala.id}&autor=${b.criado_por}`} title={`${b.criado_por_email ?? ''} — ver só os boletins inseridos por esta pessoa`}>
                            {b.criado_por_nome ?? '—'}
                          </Link>
                        ) : (
                          '—'
                        )}
                        <small className="d-block text-secondary">{dataHora(b.criado_em)}</small>
                      </td>
                      <td className="small">
                        {dataHora(b.atualizado_em ?? b.criado_em)}
                        <small className="d-block text-secondary">
                          {b.atualizado_por_nome ?? b.criado_por_nome ?? ''} · v{b.versao_atual}
                        </small>
                      </td>
                      <td className="text-end text-nowrap">
                        <Link className="btn btn-sm btn-outline-secondary" href={`${base}/${b.id}`}>
                          Abrir
                        </Link>{' '}
                        {podeEditar(b, a) && (
                          <Link className="btn btn-sm btn-outline-primary" href={`${base}/${b.id}/editar`} title="Editar" aria-label="Editar">
                            <i className="bi bi-pencil" />
                          </Link>
                        )}{' '}
                        {podeExcluir(b, a) && (
                          <form action={acaoBoletimAcao} className="d-inline">
                            <input type="hidden" name="id" value={b.id} />
                            <input type="hidden" name="acao" value="excluir" />
                            <BotaoConfirmar
                              className="btn btn-sm btn-outline-danger"
                              rotulo="Excluir"
                              pergunta={`${b.status === 'publicado' ? 'Este boletim está PUBLICADO. Excluir e retirar do site agora: ' : 'Excluir o boletim: '}${b.titulo}?`}
                            >
                              <i className="bi bi-trash" />
                            </BotaoConfirmar>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginacaoAcesso total={total} pagina={pagina} porPagina={POR_PAGINA} base={base} params={params} />
          </>
        )}
      </div>
    </>
  );
}
