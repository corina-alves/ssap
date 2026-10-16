import { GraficoSistemas } from '@/components/graficos-php';
import { EsqueletoGrafico, EsqueletoTabela } from '@/components/carregamento';
import { anosDeReferencia, type Resumo } from '@/lib/hidrologia/sistemas';

const num = (v: number | null, casas = 1) =>
  v === null ? '--' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/**
 * Gráfico da seção "… por sistema" (Precipitação e Vazões), igual ao do PHP:
 * dia, 7 dias, mês, anos de referência e média histórica em barras, e a MLT
 * em linha no eixo da direita.
 */
export function GraficosSistemas({ d, tipo }: { d: Resumo; tipo: 'chuva' | 'vazao' }) {
  const linhas = [...d.produtores, ...(d.sim ? [d.sim] : [])];
  return (
    <div className={tipo === 'chuva' ? 'pcp-grafico-wrap' : 'vzo-grafico-wrap'}>
      <GraficoSistemas
        tipo={tipo}
        anosReferencia={d.anosReferencia}
        linhas={linhas.map((l) => ({
          sistema: l.nome,
          dia: l.dia,
          seteDias: l.seteDias,
          mes: l.mes,
          refs: d.anosReferencia.map((a) => l.refs[a] ?? null),
          mediaHistorica: l.mediaHistorica,
          mlt: l.mlt,
        }))}
      />
    </div>
  );
}

/** Tabela "Acompanhamento …" com as mesmas colunas do PHP. */
export function TabelaSistemas({ d, classe, rotuloDia }: { d: Resumo; classe: string; rotuloDia: string }) {
  const linhas = [...d.produtores, ...(d.sim ? [d.sim] : [])];
  return (
    <div className="table-responsive">
      <table className={`table table-striped ${classe}`}>
        <thead>
          <tr>
            <th>Sistema</th>
            <th>{rotuloDia}</th>
            <th>Últimos 7 dias</th>
            <th>Mês {d.dataUsada.slice(0, 4)}</th>
            {d.anosReferencia.map((a) => (
              <th key={a}>Mês {a}</th>
            ))}
            <th>Média histórica</th>
            <th>MLT (%)</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id}>
              <td>{l.id === d.sim?.id ? <strong>{l.nome}</strong> : l.nome}</td>
              <td>{num(l.dia)}</td>
              <td>{num(l.seteDias)}</td>
              <td>{num(l.mes)}</td>
              {d.anosReferencia.map((a) => (
                <td key={a}>{num(l.refs[a] ?? null)}</td>
              ))}
              <td>{num(l.mediaHistorica)}</td>
              <td>{num(l.mlt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Colunas da tabela "Acompanhamento …" para um ano (as mesmas de TabelaSistemas). */
function colunas(ano: number, rotuloDia: string): string[] {
  return ['Sistema', rotuloDia, 'Últimos 7 dias', `Mês ${ano}`, ...anosDeReferencia(ano).map((a) => `Mês ${a}`), 'Média histórica', 'MLT (%)'];
}

/** Lugar do gráfico enquanto a SABESP responde (mesma altura do gráfico). */
export function EsqueletoGraficosSistemas({ tipo }: { tipo: 'chuva' | 'vazao' }) {
  return <EsqueletoGrafico className={tipo === 'chuva' ? 'pcp-grafico-wrap' : 'vzo-grafico-wrap'} altura="auto" rotulo="Carregando gráfico por sistema…" />;
}

/** Tabela com os cabeçalhos do ano pedido e as 8 linhas (7 sistemas + SIM) em esqueleto. */
export function EsqueletoTabelaSistemas({ ano, classe, rotuloDia }: { ano: number; classe: string; rotuloDia: string }) {
  return <EsqueletoTabela colunas={colunas(ano, rotuloDia)} linhas={8} className={`table table-striped ${classe}`} />;
}
