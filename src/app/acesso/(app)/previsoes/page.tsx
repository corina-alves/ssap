import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Cabecalho } from '@/components/acesso/pecas';
import { salasPainel } from '@/lib/acesso/painel';
import { acl } from '@/lib/auth/acl';

export const metadata: Metadata = { title: 'Previsões' };

// Atalhos de config/atalhos.php ('previsoes'). No PHP as páginas ficavam dentro
// da área restrita; aqui são as páginas públicas, com os mesmos dados.
const LINKS = [
  {
    titulo: 'Previsão por município',
    descricao: 'Chuva prevista (Open-Meteo) para qualquer município de SP, com mapa, gráfico e tabela de 7 dias.',
    href: '/previsao',
    icone: 'bi-cloud-sun',
  },
  {
    titulo: 'Previsão dos sistemas',
    descricao: 'Chuva prevista nos sete sistemas produtores, por horizonte de tempo (hoje, 48 h, 72 h, 7 dias).',
    href: '/previsao-reservatorios',
    icone: 'bi-droplet-half',
  },
];

/** Páginas de previsão da sala (previsoes/index.php). */
export default async function PaginaPrevisoes({ searchParams }: { searchParams: Promise<{ sala?: string }> }) {
  const a = await acl();
  const salas = await salasPainel(a);
  const { sala: salaId } = await searchParams;
  const sala = salas.find((s) => String(s.id) === salaId);
  if (!sala) notFound();
  if (!a.pode('visualizar_previsoes', sala.id)) redirect('/acesso/sem-acesso');
  if (!sala.modulos.some((m) => m.slug === 'previsoes')) notFound();

  return (
    <>
      <Cabecalho
        titulo="Previsões"
        subtitulo="Páginas de previsão do tempo e dos sistemas produtores."
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, `/acesso/salas/sala?s=${sala.slug}`],
          ['Previsões', null],
        ]}
      />
      <div className="row g-3">
        {LINKS.map((l) => (
          <div key={l.href} className="col-md-6 col-xl-4">
            <a className="acesso-link-card" href={l.href} target="_blank" rel="noopener">
              <i className={`bi ${l.icone}`} />
              <span>
                <strong>{l.titulo}</strong>
                <small>{l.descricao}</small>
                <small className="mt-1">
                  <i className="bi bi-box-arrow-up-right" /> abre em nova aba
                </small>
              </span>
            </a>
          </div>
        ))}
      </div>
    </>
  );
}
