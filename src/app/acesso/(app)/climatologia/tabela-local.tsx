'use client';

import Link from 'next/link';
import { useState } from 'react';

export type LinhaLocal = {
  chave: number;
  nome: string;
  href: string;
  /** Texto curto embaixo do nome (rede, município, tipo da média…). */
  detalhe: string | null;
  /** Para o filtro (ex.: UGRHI do município). */
  grupo?: number | null;
  postos: number | null;
  observado: number | null;
  climatologia: number | null;
  percentual: number | null;
  desvio: number | null;
};

type Coluna = 'nome' | 'postos' | 'observado' | 'climatologia' | 'percentual' | 'desvio';

const num = (v: number | null, sinal = false) => (v === null ? '—' : `${sinal && v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`);

type Props = {
  linhas: LinhaLocal[];
  selecionada: number | null;
  rotuloNome: string;
  rotuloPostos: string | null;
  rotuloObservado?: string;
  rotuloMedia?: string;
  /** Filtro por grupo (ex.: UGRHI): rótulo e opções [valor, texto]. */
  grupos?: { rotulo: string; opcoes: [number, string][] };
  ordemInicial?: Coluna;
};

/** Tabela de municípios ou de estações, ordenável por qualquer coluna (sem dado vai sempre para o fim), com filtro por nome e por grupo. */
export function TabelaLocal({ linhas, selecionada, rotuloNome, rotuloPostos, rotuloObservado = 'Observado (mm)', rotuloMedia = 'Média histórica (mm)', grupos, ordemInicial = 'desvio' }: Props) {
  const [ordem, setOrdem] = useState<{ coluna: Coluna; asc: boolean }>({ coluna: ordemInicial, asc: true });
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('');
  const colunas: [Coluna, string][] = [
    ['nome', rotuloNome],
    ...(rotuloPostos ? ([['postos', rotuloPostos]] as [Coluna, string][]) : []),
    ['observado', rotuloObservado],
    ['climatologia', rotuloMedia],
    ['percentual', '% da média'],
    ['desvio', 'Desvio (%)'],
  ];
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const ordenadas = linhas
    .filter((l) => !grupo || String(l.grupo ?? '') === grupo)
    .filter((l) => !termo || `${l.nome} ${l.detalhe ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo))
    .sort((a, b) => {
      if (ordem.coluna === 'nome') return (ordem.asc ? 1 : -1) * a.nome.localeCompare(b.nome, 'pt-BR');
      const va = a[ordem.coluna];
      const vb = b[ordem.coluna];
      if (va === null) return vb === null ? a.nome.localeCompare(b.nome, 'pt-BR') : 1;
      if (vb === null) return -1;
      return (ordem.asc ? 1 : -1) * (va - vb);
    });
  return (
    <>
      {(linhas.length > 12 || grupos) && (
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
          <small className="text-secondary align-self-center">{ordenadas.length} de {linhas.length}</small>
        </div>
      )}
      <div className="table-responsive clima-tabela-local">
        <table className="table table-sm align-middle clima-tabela mb-0">
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
              <tr key={l.chave} className={l.chave === selecionada ? 'clima-linha-sel' : ''}>
                <td>
                  <Link href={l.href} scroll={false}>
                    {l.nome}
                  </Link>
                  {l.detalhe && <small className="d-block text-secondary">{l.detalhe}</small>}
                </td>
                {rotuloPostos && <td className="text-end">{l.postos ?? '—'}</td>}
                <td className="text-end">{num(l.observado)}</td>
                <td className="text-end">{num(l.climatologia)}</td>
                <td className="text-end">{l.percentual === null ? '—' : `${num(l.percentual)}%`}</td>
                <td className={`text-end fw-semibold ${l.desvio === null ? '' : l.desvio < 0 ? 'clima-seco' : 'clima-chuvoso'}`}>{l.desvio === null ? '—' : `${num(l.desvio, true)}%`}</td>
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
