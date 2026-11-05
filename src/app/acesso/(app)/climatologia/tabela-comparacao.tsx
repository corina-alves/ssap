'use client';

import Link from 'next/link';
import { useState } from 'react';

export type LinhaComparacao = {
  ugrhi: number;
  nome: string;
  href: string;
  observado: number | null;
  climatologia: number | null;
  percentual: number | null;
  desvio: number | null;
  tipo: string;
  destaque: 'deficit' | 'excedente' | null;
  /** Ex.: "cobertura baixa: 3 postos" */
  aviso: string | null;
};

type Coluna = 'ugrhi' | 'observado' | 'climatologia' | 'percentual' | 'desvio';

const num = (v: number | null, sinal = false) => (v === null ? '—' : `${sinal && v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`);

/** Tabela das 22 UGRHIs, ordenável por qualquer coluna (sem dado vai sempre para o fim). */
export function TabelaComparacao({ linhas, selecionada, rotuloObservado = 'Observado (mm)', rotuloMedia = 'Média histórica (mm)' }: { linhas: LinhaComparacao[]; selecionada: number; rotuloObservado?: string; rotuloMedia?: string }) {
  const COLUNAS: [Coluna, string][] = [
    ['ugrhi', 'UGRHI'],
    ['observado', rotuloObservado],
    ['climatologia', rotuloMedia],
    ['percentual', '% da média'],
    ['desvio', 'Desvio (%)'],
  ];
  const [ordem, setOrdem] = useState<{ coluna: Coluna; asc: boolean }>({ coluna: 'desvio', asc: true });
  const ordenadas = [...linhas].sort((a, b) => {
    const va = a[ordem.coluna];
    const vb = b[ordem.coluna];
    if (va === null) return vb === null ? a.ugrhi - b.ugrhi : 1;
    if (vb === null) return -1;
    return (ordem.asc ? 1 : -1) * ((va as number) - (vb as number));
  });
  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle clima-tabela">
        <thead>
          <tr>
            {COLUNAS.map(([c, rotulo]) => (
              <th key={c} scope="col" aria-sort={ordem.coluna === c ? (ordem.asc ? 'ascending' : 'descending') : 'none'} className={c === 'ugrhi' ? '' : 'text-end'}>
                <button type="button" className="clima-ordenar" onClick={() => setOrdem((o) => ({ coluna: c, asc: o.coluna === c ? !o.asc : c === 'ugrhi' }))}>
                  {rotulo} <i className={`bi ${ordem.coluna !== c ? 'bi-arrow-down-up' : ordem.asc ? 'bi-sort-down-alt' : 'bi-sort-down'}`} aria-hidden="true" />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l) => (
            <tr key={l.ugrhi} className={`${l.ugrhi === selecionada ? 'clima-linha-sel' : ''} ${l.destaque ? `clima-linha-${l.destaque}` : ''}`}>
              <td>
                <Link href={l.href} scroll={false}>
                  {l.ugrhi} — {l.nome}
                </Link>
                {l.destaque && <span className={`badge ms-2 clima-badge-${l.destaque}`}>{l.destaque === 'deficit' ? 'maior déficit' : 'maior excedente'}</span>}
                {l.tipo !== 'normal' && <small className="d-block text-secondary">{l.tipo}</small>}
                {l.aviso && <small className="d-block text-warning-emphasis">{l.aviso}</small>}
              </td>
              <td className="text-end">{num(l.observado)}</td>
              <td className="text-end">{num(l.climatologia)}</td>
              <td className="text-end">{l.percentual === null ? '—' : `${num(l.percentual)}%`}</td>
              <td className={`text-end fw-semibold ${l.desvio === null ? '' : l.desvio < 0 ? 'clima-seco' : 'clima-chuvoso'}`}>{l.desvio === null ? '—' : `${num(l.desvio, true)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
