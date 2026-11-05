'use client';

import { useState } from 'react';

export type LinhaTabelaMes = {
  chave: number;
  nome: string;
  /** Para o filtro (ex.: UGRHI do município). */
  grupo?: number | null;
  acumulado: number | null;
  maxima: number | null;
  /** Posto da chuva máxima (dica ao passar o mouse). */
  postoMaxima: string | null;
  historica: number | null;
  percentual: number | null;
  postos: number;
  anos: number;
  /** Anos usados na média histórica (dica). */
  rotuloAnos: string;
};

type Coluna = 'nome' | 'acumulado' | 'maxima' | 'historica' | 'percentual' | 'postos' | 'anos';

const dec = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

type Props = {
  linhas: LinhaTabelaMes[];
  rotuloNome: string;
  rotuloAcumulado: string;
  rotuloHistorica: string;
  /** Filtro por grupo (ex.: UGRHI): rótulo e opções [valor, texto]. */
  grupos?: { rotulo: string; opcoes: [number, string][] };
  /** Ordem inicial: pela chave (código da UGRHI) ou pelo nome. */
  ordemInicial?: 'chave' | 'nome';
  alturaMaxima?: boolean;
};

/** Tabela da aba "Chuva do mês": ordenável por qualquer coluna (sem dado vai sempre para o fim), com filtro por nome e por grupo. */
export function TabelaMes({ linhas, rotuloNome, rotuloAcumulado, rotuloHistorica, grupos, ordemInicial = 'chave', alturaMaxima }: Props) {
  const [ordem, setOrdem] = useState<{ coluna: Coluna | 'chave'; asc: boolean }>({ coluna: ordemInicial, asc: true });
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('');
  const colunas: [Coluna, string][] = [
    ['nome', rotuloNome],
    ['acumulado', rotuloAcumulado],
    ['maxima', 'Chuva máxima (mm)'],
    ['historica', rotuloHistorica],
    ['percentual', '% da média'],
    ['postos', 'Postos'],
    ['anos', 'Anos na média'],
  ];
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const ordenadas = linhas
    .filter((l) => !grupo || String(l.grupo ?? '') === grupo)
    .filter((l) => !termo || l.nome.toLocaleLowerCase('pt-BR').includes(termo))
    .sort((a, b) => {
      if (ordem.coluna === 'chave') return a.chave - b.chave;
      if (ordem.coluna === 'nome') return (ordem.asc ? 1 : -1) * a.nome.localeCompare(b.nome, 'pt-BR');
      const va = a[ordem.coluna];
      const vb = b[ordem.coluna];
      if (va === null) return vb === null ? a.nome.localeCompare(b.nome, 'pt-BR') : 1;
      if (vb === null) return -1;
      return (ordem.asc ? 1 : -1) * (va - vb);
    });
  return (
    <>
      {(linhas.length > 25 || grupos) && (
        <div className="d-flex flex-wrap gap-2 mb-2">
          <input type="search" className="form-control form-control-sm clima-busca" placeholder="Filtrar pelo nome…" aria-label={`Filtrar ${rotuloNome.toLowerCase()} pelo nome`} value={busca} onChange={(e) => setBusca(e.target.value)} />
          {grupos && (
            <select className="form-select form-select-sm clima-busca" aria-label={`Filtrar por ${grupos.rotulo}`} value={grupo} onChange={(e) => setGrupo(e.target.value)}>
              <option value="">{`Todas as ${grupos.rotulo}s`}</option>
              {grupos.opcoes.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <small className="text-secondary align-self-center">
            {ordenadas.length} de {linhas.length}
          </small>
        </div>
      )}
      <div className={`table-responsive ${alturaMaxima ? 'clima-tabela-local' : ''}`}>
        <table className="table table-sm align-middle clima-tabela clima-resumo mb-0">
          <thead>
            <tr>
              {colunas.map(([c, rotulo]) => (
                <th key={c} scope="col" aria-sort={ordem.coluna === c ? (ordem.asc ? 'ascending' : 'descending') : 'none'} className={c === 'nome' ? '' : 'text-end'}>
                  <button type="button" className="clima-ordenar" onClick={() => setOrdem((o) => ({ coluna: c, asc: o.coluna === c ? !o.asc : c === 'nome' }))}>
                    {rotulo} <i className={`bi ${ordem.coluna !== c ? 'bi-arrow-down-up' : ordem.asc ? 'bi-sort-down-alt' : 'bi-sort-down'}`} aria-hidden="true" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((l) => (
              <tr key={l.chave}>
                <td>{l.nome}</td>
                <td className="text-end fw-semibold">{dec(l.acumulado)}</td>
                <td className="text-end" title={l.postoMaxima ?? undefined}>
                  {dec(l.maxima)}
                </td>
                <td className="text-end" title={l.rotuloAnos}>
                  {dec(l.historica)}
                </td>
                <td className={`text-end ${l.percentual === null ? '' : l.percentual < 100 ? 'clima-seco' : 'clima-chuvoso'}`}>{l.percentual === null ? '—' : `${dec(l.percentual)}%`}</td>
                <td className="text-end text-secondary">{l.postos || '—'}</td>
                <td className="text-end text-secondary" title={l.rotuloAnos}>
                  {l.anos || '—'}
                </td>
              </tr>
            ))}
            {!ordenadas.length && (
              <tr>
                <td colSpan={colunas.length} className="text-secondary small">
                  Nenhum resultado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
