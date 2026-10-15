import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cabecalho } from '@/components/acesso/pecas';
import { ScriptsLegado } from '@/components/acesso/scripts-legado';
import { exigirSalaModulo } from '@/lib/acesso/painel';
import { acl } from '@/lib/auth/acl';
import { obter } from '@/lib/graficos';
import { paraChart, tabelaDe } from '@/lib/graficos-tabela';
import { FormGrafico } from '../componentes';

export const metadata: Metadata = { title: 'Gráfico' };

const NOVO = {
  titulo: '', tipo: 'barra', fonte: '', unidade: 'mm', eixo_y: 'Precipitação', empilhado: false,
  dados: 'Mês;2025;2026\nJan;250,4;190,2\nFev;210,0;383,4\nMar;180,7;263,4',
};

/** Novo gráfico (criar_graficos) ou edição (editar_graficos), com prévia (graficos/editar.php). */
export default async function EditarGrafico({ searchParams }: { searchParams: Promise<{ sala?: string; id?: string }> }) {
  const sp = await searchParams;
  const id = /^\d{1,9}$/.test(sp.id ?? '') ? Number(sp.id) : null;
  const a = await acl();
  const sala = await exigirSalaModulo(a, Number(sp.sala) || 0, 'graficos', id ? 'editar_graficos' : 'criar_graficos');

  const g = id ? await obter(id) : null;
  if (id && (!g || g.sala_id !== sala.id)) notFound();
  const cfg = g ? paraChart(g) : null;
  const inicial = g && cfg
    ? { titulo: g.titulo, tipo: g.tipo, fonte: g.fonte ?? '', unidade: cfg.unidade, eixo_y: cfg.eixo_y, empilhado: cfg.empilhado, dados: tabelaDe(cfg) }
    : NOVO;
  const titulo = g ? 'Editar gráfico' : 'Novo gráfico';

  return (
    <>
      <Cabecalho
        titulo={titulo}
        subtitulo={sala.nome}
        trilha={[
          ['Gráficos', `/acesso/graficos?sala=${sala.id}`],
          [titulo, null],
        ]}
      />
      <FormGrafico id={id} salaId={sala.id} inicial={inicial} />
      <ScriptsLegado scripts={['/acesso/vendor/chartjs/chart.umd.min.js', '/acesso/js/graficos.js']} />
    </>
  );
}
