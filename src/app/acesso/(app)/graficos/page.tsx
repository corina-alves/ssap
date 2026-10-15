import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecalho, Mensagem } from '@/components/acesso/pecas';
import { ScriptsLegado } from '@/components/acesso/scripts-legado';
import { atalhosDaSala } from '@/lib/acesso/atalhos';
import { exigirSalaModulo } from '@/lib/acesso/painel';
import { acl } from '@/lib/auth/acl';
import { dataHora } from '@/lib/formato';
import { listar } from '@/lib/graficos';
import { paraChart, TIPOS, type Tipo } from '@/lib/graficos-tabela';
import { acaoGraficoAcao } from './actions';
import { BotaoConfirmar } from './componentes';

export const metadata: Metadata = { title: 'Gráficos' };

const AVISOS: Record<string, ['sucesso' | 'erro', string]> = {
  criado: ['sucesso', 'Gráfico criado como rascunho.'],
  atualizado: ['sucesso', 'Gráfico atualizado.'],
  publicado: ['sucesso', 'Gráfico publicado.'],
  despublicado: ['sucesso', 'Gráfico despublicado.'],
  excluido: ['sucesso', 'Gráfico excluído.'],
  'publicado-nao-exclui': ['erro', 'Gráfico publicado não pode ser excluído. Despublique-o antes.'],
  invalido: ['erro', 'Ação inválida.'],
};

/** Gráficos da sala: prévia de cada um, publicar/despublicar, editar e excluir (graficos/index.php). */
export default async function Graficos({ searchParams }: { searchParams: Promise<{ sala?: string; aviso?: string }> }) {
  const sp = await searchParams;
  const a = await acl();
  const sala = await exigirSalaModulo(a, Number(sp.sala) || 0, 'graficos', 'visualizar_graficos');
  const graficos = await listar(sala.id);
  const podeCriar = a.pode('criar_graficos', sala.id);
  const podeEditar = a.pode('editar_graficos', sala.id);
  const podePublicar = a.pode('publicar_graficos', sala.id);
  const atalhos = atalhosDaSala(sala.slug).filter((t) => t.modulo === 'graficos' && a.pode(t.permissao, sala.id));
  const aviso = AVISOS[sp.aviso ?? ''];

  return (
    <>
      {aviso && <Mensagem tipo={aviso[0]}>{aviso[1]}</Mensagem>}
      <Cabecalho
        titulo="Gráficos"
        subtitulo={sala.nome}
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, `/acesso/salas/sala?s=${sala.slug}`],
          ['Gráficos', null],
        ]}
        acoes={
          podeCriar && (
            <Link className="btn btn-primary" href={`/acesso/graficos/editar?sala=${sala.id}`}>
              <i className="bi bi-plus-lg me-1" /> Novo gráfico
            </Link>
          )
        }
      />

      {atalhos.length > 0 && (
        <section className="acesso-card mb-3">
          <h2 className="acesso-card__titulo">
            <i className="bi bi-graph-up-arrow" /> Análises prontas
          </h2>
          <div className="row g-3">
            {atalhos.map((t) => (
              <div key={t.href} className="col-md-6 col-xl-4">
                <Link className="acesso-link-card" href={t.href}>
                  <i className={`bi ${t.icone}`} />
                  <span>
                    <strong>{t.titulo}</strong>
                    <small>{t.descricao}</small>
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {graficos.length === 0 ? (
        <div className="acesso-card">
          <p className="text-secondary mb-0">Nenhum gráfico cadastrado.</p>
        </div>
      ) : (
        <div className="row g-3">
          {graficos.map((g) => {
            const publicado = g.status === 'publicado';
            return (
              <div key={g.id} className="col-xl-6">
                <section className="acesso-card h-100">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <div>
                      <h2 className="h6 mb-0">{g.titulo}</h2>
                      <small className="text-secondary">
                        {TIPOS[g.tipo as Tipo] ?? g.tipo}
                        {g.fonte ? ` · Fonte: ${g.fonte}` : ''}
                      </small>
                    </div>
                    <span className={`acesso-status acesso-status--${publicado ? 'publicado' : 'rascunho'}`}>{publicado ? 'Publicado' : 'Rascunho'}</span>
                  </div>
                  <div className="acesso-grafico">
                    <canvas data-grafico={JSON.stringify(paraChart(g))} aria-label={g.titulo} role="img" />
                  </div>
                  {(podeEditar || podePublicar) && (
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      {podeEditar && (
                        <Link className="btn btn-sm btn-outline-secondary" href={`/acesso/graficos/editar?sala=${sala.id}&id=${g.id}`}>
                          <i className="bi bi-pencil" /> Editar
                        </Link>
                      )}
                      {podePublicar && (
                        <form action={acaoGraficoAcao}>
                          <input type="hidden" name="id" value={g.id} />
                          <input type="hidden" name="acao" value={publicado ? 'despublicar' : 'publicar'} />
                          <BotaoConfirmar
                            className={`btn btn-sm ${publicado ? 'btn-outline-warning' : 'btn-outline-success'}`}
                            pergunta={publicado ? 'Tirar este gráfico do site?' : 'Publicar este gráfico no site?'}
                          >
                            <i className={`bi ${publicado ? 'bi-eye-slash' : 'bi-globe2'}`} /> {publicado ? 'Despublicar' : 'Publicar'}
                          </BotaoConfirmar>
                        </form>
                      )}
                      {podeEditar && !publicado && (
                        <form action={acaoGraficoAcao} className="ms-auto">
                          <input type="hidden" name="id" value={g.id} />
                          <input type="hidden" name="acao" value="excluir" />
                          <BotaoConfirmar className="btn btn-sm btn-outline-danger" rotulo="Excluir" pergunta={`Excluir o gráfico ${g.titulo}?`}>
                            <i className="bi bi-trash" />
                          </BotaoConfirmar>
                        </form>
                      )}
                    </div>
                  )}
                  <small className="d-block text-secondary mt-2">
                    Atualizado em {dataHora(g.atualizado_em ?? g.criado_em)}
                    {g.atualizado_por_nome ? ` · ${g.atualizado_por_nome}` : ''}
                  </small>
                </section>
              </div>
            );
          })}
        </div>
      )}

      <ScriptsLegado scripts={['/acesso/vendor/chartjs/chart.umd.min.js', '/acesso/js/graficos.js']} />
    </>
  );
}
