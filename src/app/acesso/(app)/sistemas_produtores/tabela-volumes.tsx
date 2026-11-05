'use client';

import { useRef, useState } from 'react';
import type { LinhaVolumes, TabelaVolumes } from '@/lib/hidrologia/volumes-mensais';

const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const num = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const dataBr = (ymd: string) => `${ymd.slice(8)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const nomeLinha = (l: LinhaVolumes) => (l.nome === 'SIM' ? 'Sistema Integrado Metropolitano (SIM)' : l.nome);

/** Cabeçalhos e células da tabela, na ordem do boletim (a mesma para HTML, PNG e cópia). */
function conteudo(t: TabelaVolumes) {
  const r = t.rotulos;
  const cab = [
    'SISTEMA',
    `Vol. Atual ${r.atual} (%)`,
    `Vol. Mês Anterior ${r.mesAnterior} (%)`,
    `Vol. Ano Anterior ${r.anoAnterior} (%)`,
    `Dif. entre o Vol. Atual e Vol. Mês Anterior (${r.atual}) (p.p.)`,
    `Dif. entre o Vol. Atual e Vol. Ano Anterior (${r.anoAnteriorAno}) (p.p.)`,
    `Acumulado chuva no Mês ${r.atual} (mm)`,
    'Média Histórica (mm)',
  ];
  const celulas = (l: LinhaVolumes) => [nomeLinha(l), num(l.atual), num(l.mesAnterior), num(l.anoAnterior), num(l.difMes), num(l.difAno), num(l.chuvaMes), num(l.mediaHistorica)];
  const titulo = `Dados referentes ao último dia do mês de ${MESES_LONGOS[Number(t.mes.slice(5)) - 1]} (${dataBr(t.datas.atual)})`;
  return { titulo, cab, linhas: t.sistemas.map(celulas), sim: celulas(t.sim) };
}

/** Quebra o texto em linhas que cabem na largura. */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const p of texto.split(' ')) {
    const t = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(t).width > largura && atual) {
      linhas.push(atual);
      atual = p;
    } else atual = t;
  }
  return atual ? [...linhas, atual] : linhas;
}

/** Desenha a tabela no formato do boletim e baixa em PNG. */
function baixarPng(t: TabelaVolumes, fonte: string) {
  const { titulo, cab, linhas, sim } = conteudo(t);
  const escala = 2;
  const larguras = [220, 118, 134, 134, 172, 172, 144, 144];
  const W = larguras.reduce((s, w) => s + w, 0) + 40;
  const altCab = 110;
  const altLinha = 50;
  const H = 40 + 40 + 54 + altCab + altLinha * (linhas.length + 1) + 40;
  const c = document.createElement('canvas');
  c.width = W * escala;
  c.height = H * escala;
  const ctx = c.getContext('2d')!;
  ctx.scale(escala, escala);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 22px ${fonte}`;
  ctx.fillText(titulo, W / 2, 50);

  const x0 = 20;
  let y = 80;
  const largura = W - 40;
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000';
  ctx.strokeRect(x0, y, largura, 54);
  ctx.font = `700 20px ${fonte}`;
  ctx.fillText('VOLUMES SISTEMAS PRODUTORES (SABESP e ANA)', W / 2, y + 27);
  y += 54;

  const linha = (cels: string[], alt: number, negrito: boolean, fundo: string | null, tamanho: number) => {
    let x = x0;
    cels.forEach((cel, i) => {
      const w = larguras[i]!;
      if (fundo) {
        ctx.fillStyle = fundo;
        ctx.fillRect(x, y, w, alt);
      }
      ctx.strokeRect(x, y, w, alt);
      ctx.fillStyle = '#000';
      ctx.font = `${negrito || i === 0 ? 700 : 400} ${tamanho}px ${fonte}`;
      const ls = quebrar(ctx, cel, w - 16);
      const alturaTexto = ls.length * (tamanho + 4);
      ls.forEach((l, k) => ctx.fillText(l, x + w / 2, y + (alt - alturaTexto) / 2 + (tamanho + 4) * k + (tamanho + 4) / 2));
      x += w;
    });
    y += alt;
  };
  linha(cab, altCab, true, '#eeeeee', 15);
  for (const l of linhas) linha(l, altLinha, false, null, 16);
  linha(sim, altLinha + 8, true, null, 16);

  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `volumes_sistemas_produtores_${t.datas.atual}.png`;
  a.click();
}

/** Tabela "Volumes Sistemas Produtores (SABESP e ANA)" do boletim mensal, com PNG e cópia. */
export function TabelaVolumesSistemas({ t }: { t: TabelaVolumes }) {
  const ref = useRef<HTMLTableElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { titulo, cab, linhas, sim } = conteudo(t);

  async function copiar() {
    const tabela = ref.current;
    if (!tabela) return;
    // HTML com estilo embutido (cola formatado no Slides/Word) e texto com tabulação (Excel).
    const css = 'border:1px solid #000;padding:4px 8px;text-align:center;font-family:Arial,sans-serif;font-size:11pt';
    const tr = (cels: string[], th: boolean, negrito = false) =>
      `<tr>${cels.map((c, i) => `<${th ? 'th' : 'td'} style="${css};${th ? 'background:#eeeeee;' : ''}${th || negrito || i === 0 ? 'font-weight:bold' : ''}">${c}</${th ? 'th' : 'td'}>`).join('')}</tr>`;
    const html = `<table style="border-collapse:collapse"><tr><th colspan="8" style="${css};font-weight:bold">VOLUMES SISTEMAS PRODUTORES (SABESP e ANA)</th></tr>${tr(cab, true)}${linhas.map((l) => tr(l, false)).join('')}${tr(sim, false, true)}</table>`;
    const texto = [cab, ...linhas, sim].map((l) => l.join('\t')).join('\n');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' }) })]);
      setAviso('Tabela copiada. Cole no Slides, PowerPoint, Word ou Excel.');
    } catch {
      setAviso('O navegador não permitiu copiar. Selecione a tabela e use Ctrl+C.');
    }
  }

  return (
    <section className="acesso-card mb-3">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
        <div>
          <h2 className="h6 mb-0">Volumes dos sistemas produtores (SABESP e ANA)</h2>
          <small className="text-secondary">{titulo}</small>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => baixarPng(t, getComputedStyle(document.body).fontFamily)}>
            <i className="bi bi-table" /> Tabela (PNG)
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={copiar}>
            <i className="bi bi-clipboard" /> Copiar tabela
          </button>
        </div>
      </div>
      {aviso && <div className="small text-success mb-2">{aviso}</div>}
      <div className="table-responsive">
        <table ref={ref} className="table table-bordered table-sm align-middle text-center mb-1 acesso-tabela-volumes">
          <thead>
            <tr>
              {cab.map((c) => (
                <th key={c} className="bg-light">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...linhas, sim].map((l, i) => (
              <tr key={l[0]} className={i === linhas.length ? 'fw-bold' : undefined}>
                {l.map((c, j) => (j === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small className="text-secondary">
        Volume útil no último dia de cada mês: SABESP (Mananciais){t.sistemas.some((s) => s.fonte === 'ana') ? '; Cantareira pela ANA (SAR)' : ''}. Diferenças em pontos percentuais. Chuva acumulada no mês e média histórica do mês: SABESP; no SIM, média simples dos demais sistemas.
      </small>
    </section>
  );
}
