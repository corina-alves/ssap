'use client';

import Chart from 'chart.js/auto';
import type { ChartConfiguration, ChartOptions, ScriptableContext } from 'chart.js';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tela de um boletim mensal: busca o conteúdo montado no servidor
 * (/api/acesso/boletim_integrado/conteudo), desenha os gráficos com o Chart.js
 * a partir do JSON em data-grafico de cada <canvas> e cuida do modo edição
 * (valores ajustados e textos de análise) e do "Gerar PDF" (impressão).
 */

const API = '/api/acesso/boletim_integrado';

// Cores do logo SP Águas e variações; as cores de cota seguem o padrão de alerta.
const SPA = { azul: '#0050FF', azulEscuro: '#0039C4', verde: '#00B154', azulClaro: '#5C8FFF', verdeClaro: '#4FD38A', marinho: '#00268A', verdeEscuro: '#00813D', celeste: '#9DBBFF' };
const ALERTA = { ambar: '#F5B800', laranja: '#F97316', rosa: '#E11DAB', vermelho: '#E02424' };
const PALETA = [SPA.azul, SPA.verdeClaro, SPA.azulClaro, SPA.azulEscuro, SPA.verde, SPA.marinho, SPA.verdeEscuro, SPA.celeste];
// Parâmetros de qualidade: cor fixa por parâmetro.
const COR_PARAMETRO: [RegExp, string][] = [[/ph/i, SPA.azul], [/oxig/i, SPA.verde], [/condut/i, SPA.azulEscuro], [/turb/i, SPA.verdeEscuro], [/temper/i, SPA.azulClaro]];

type Num = number | null;
type Serie = { nome: string; valores: Num[]; cor?: string };
type Spec =
  | { tipo: 'barras'; titulo: string; rotulos: string[]; series: Serie[]; unidade: string; max?: number }
  | { tipo: 'armazenamento'; titulo: string; datas: string[]; barras: Serie; linhas: Serie[]; volume: Serie }
  | { tipo: 'linha'; titulo: string; rotulos: string[]; valores: Num[]; unidade: string; referencia?: Num; nome_referencia?: string; zero?: boolean }
  | { tipo: 'qualidade'; titulo: string; unidade: string; ano: number; mes: number; valores: [string, number][] }
  | { tipo: 'historico_carga'; titulo: string; serie: Record<string, Num>; mes: number }
  | { tipo: 'hidrograma'; titulo: string; nivel: [string, number][]; chuva: Record<string, number>; cotas: Record<string, number>; ano: number; mes: number };

const fmt = (v: unknown, casas = 2) =>
  typeof v !== 'number' || Number.isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const alfa = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
/** Degradê vertical para barras e áreas (cor viva no topo, suave na base). */
const degrade = (cor: string, topo = 1, base = 0.55) => (ctx: ScriptableContext<'bar' | 'line'>) => {
  const area = ctx.chart.chartArea;
  if (!area) return cor;
  const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, alfa(cor, topo));
  g.addColorStop(1, alfa(cor, base));
  return g;
};
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diasNoMes = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();

// As opções do Chart.js são montadas como objeto comum e ajustadas por tipo de gráfico.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Opcoes = any;
type Conjunto = any;

function opcoesBase(titulo: string, unidade: string): Opcoes {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      title: { display: !!titulo, text: titulo, color: '#0F172A', font: { size: 15, weight: 700 }, padding: { bottom: 12 } },
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded', padding: 16, font: { size: 12 } } },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
        callbacks: { label: (c: any) => ` ${c.dataset.label}: ${fmt(c.parsed.y)}${c.dataset.unidade || unidade ? ` ${c.dataset.unidade || unidade}` : ''}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#334155', font: { size: 11 } } },
      y: {
        beginAtZero: true, grid: { color: 'rgba(148,163,184,.25)' }, ticks: { color: '#334155', callback: (v: unknown) => fmt(Number(v), 0) },
        title: { display: !!unidade, text: unidade, color: '#475569', font: { weight: 600 } },
      },
    },
  };
}

/** Desenha o gráfico de um <canvas data-grafico>; devolve os gráficos criados (o hidrograma são dois). */
function desenhar(canvas: HTMLCanvasElement, s: Spec): Chart[] {
  const novo = (alvo: HTMLCanvasElement, tipo: 'bar' | 'line', rotulos: string[], conjuntos: Conjunto[], opcoes: Opcoes) =>
    new Chart(alvo, { type: tipo, data: { labels: rotulos, datasets: conjuntos }, options: opcoes as ChartOptions } as ChartConfiguration);

  switch (s.tipo) {
    // barras agrupadas (chuva por sub-bacia; armazenamento mensal por ano)
    case 'barras': {
      const o = opcoesBase(s.titulo, s.unidade);
      if (s.max) o.scales.y.max = s.max;
      const ds = s.series.map((serie, i) => {
        // a cor vem do boletim (séries com destaque próprio); sem ela, a paleta da casa
        const cor = /^#[0-9a-f]{6}$/i.test(serie.cor ?? '') ? serie.cor! : PALETA[i % PALETA.length]!;
        return { label: serie.nome, data: serie.valores, backgroundColor: degrade(cor), hoverBackgroundColor: cor, borderRadius: 6, borderSkipped: false, maxBarThickness: 38 };
      });
      return [novo(canvas, 'bar', s.rotulos, ds, o)];
    }
    // armazenamento / operação de reservatório: chuva (barras), vazões (linhas), volume (área, eixo direito)
    case 'armazenamento': {
      const o = opcoesBase(s.titulo, '');
      o.scales.y.title = { display: true, text: 'Vazões (m³/s) e chuva (mm)', color: '#475569', font: { weight: 600 } };
      o.scales.y2 = {
        position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { color: SPA.verdeEscuro, callback: (v: unknown) => `${v}%` },
        title: { display: true, text: 'Volume (%)', color: SPA.verdeEscuro, font: { weight: 600 } },
      };
      const cores = [SPA.azulEscuro, SPA.marinho];
      const ds: Conjunto[] = [{ type: 'bar', label: s.barras.nome, data: s.barras.valores, backgroundColor: degrade(SPA.azulClaro), borderRadius: 4, yAxisID: 'y', order: 3, unidade: 'mm' }];
      s.linhas.forEach((l, i) =>
        ds.push({ type: 'line', label: l.nome, data: l.valores, borderColor: cores[i], backgroundColor: cores[i], borderWidth: 3, borderDash: i === 1 ? [7, 4] : [], tension: 0.35, pointRadius: 0, pointHoverRadius: 5, spanGaps: false, yAxisID: 'y', order: 1, unidade: 'm³/s' }),
      );
      ds.push({ type: 'line', label: s.volume.nome, data: s.volume.valores, borderColor: SPA.verde, backgroundColor: degrade(SPA.verde, 0.32, 0.02), fill: true, borderWidth: 3, tension: 0.3, pointRadius: 0, yAxisID: 'y2', order: 2, unidade: '%' });
      return [novo(canvas, 'bar', s.datas.map(dataCurta), ds, o)];
    }
    // linha (produção média mensal; carga do mês ao longo dos anos)
    case 'linha': {
      const o = opcoesBase(s.titulo, s.unidade);
      o.scales.y.beginAtZero = !!s.zero;
      const ds: Conjunto[] = [{
        label: s.titulo.split(' — ')[0], data: s.valores, borderColor: SPA.azul, backgroundColor: degrade(SPA.azul, 0.3, 0.02), fill: true,
        borderWidth: 3, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderColor: SPA.azul, pointBorderWidth: 2, spanGaps: false,
      }];
      if (s.referencia != null) ds.push({ label: s.nome_referencia || 'Média', data: s.rotulos.map(() => s.referencia), borderColor: SPA.verde, borderDash: [8, 6], borderWidth: 2.5, pointRadius: 0, fill: false });
      return [novo(canvas, 'line', s.rotulos, ds, o)];
    }
    // qualidade: médias diárias no mês, com a média do período tracejada
    case 'qualidade': {
      const porDia = new Map(s.valores.map(([data, v]) => [Number(data.slice(8, 10)), v]));
      const dias = Array.from({ length: diasNoMes(s.ano, s.mes) }, (_, i) => i + 1);
      const valores = dias.map((d) => porDia.get(d) ?? null);
      const validos = valores.filter((v): v is number => v !== null);
      const media = validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
      const cor = COR_PARAMETRO.find(([re]) => re.test(s.titulo))?.[1] ?? SPA.azul;
      const o = opcoesBase('', s.unidade);
      o.plugins.legend.display = false;
      o.scales.y.beginAtZero = false;
      o.scales.y.ticks.callback = (v: unknown) => fmt(Number(v), 1);
      return [novo(canvas, 'line', dias.map((d) => String(d).padStart(2, '0')), [
        { label: s.titulo, data: valores, borderColor: cor, backgroundColor: degrade(cor, 0.3, 0.02), fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 2.5, pointBackgroundColor: cor, spanGaps: false, unidade: s.unidade },
        { label: 'Média do mês', data: media === null ? [] : dias.map(() => media), borderColor: SPA.marinho, borderDash: [6, 5], borderWidth: 1.8, pointRadius: 0, fill: false, unidade: s.unidade },
      ], o)];
    }
    // histórico da carga orgânica: barras (mês do boletim destacado) + média móvel de 12 observações
    case 'historico_carga': {
      const chaves = Object.keys(s.serie);
      const valores = chaves.map((k) => s.serie[k] ?? null);
      const janela: number[] = [];
      const movel = valores.map((v) => {
        if (v === null) return null;
        janela.push(v);
        if (janela.length > 12) janela.shift();
        return janela.reduce((a, b) => a + b, 0) / janela.length;
      });
      const o = opcoesBase(s.titulo, 't/dia');
      o.scales.x.ticks.callback = (i: number) => (chaves[i]?.slice(5, 7) === '01' ? chaves[i]!.slice(0, 4) : '');
      o.scales.x.ticks.autoSkip = false;
      return [novo(canvas, 'bar', chaves.map((k) => `${k.slice(5, 7)}/${k.slice(0, 4)}`), [
        { type: 'bar', label: 'Carga do mês', data: valores, borderRadius: 3, backgroundColor: chaves.map((k) => (Number(k.slice(5, 7)) === s.mes ? SPA.verde : SPA.azul)) },
        { type: 'line', label: 'Média móvel (12 observações)', data: movel, borderColor: SPA.marinho, borderWidth: 3, tension: 0.35, pointRadius: 0 },
      ], o)];
    }
    // hidrograma: chuva diária (barras) em cima, nível com as cotas de referência embaixo
    case 'hidrograma': {
      const caixa = canvas.parentElement!;
      caixa.innerHTML = '<div style="height:32%"><canvas></canvas></div><div style="height:68%"><canvas></canvas></div>';
      const [cChuva, cNivel] = [...caixa.querySelectorAll('canvas')] as [HTMLCanvasElement, HTMLCanvasElement];
      const dias = Array.from({ length: diasNoMes(s.ano, s.mes) }, (_, i) => i + 1);
      const chuva = dias.map((d) => s.chuva[`${s.ano}-${String(s.mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`] ?? 0);
      const o1 = opcoesBase(`${s.titulo} — chuva diária`, 'mm');
      o1.plugins.legend.display = false;
      const g1 = novo(cChuva, 'bar', dias.map(String), [{ label: 'Chuva', data: chuva, backgroundColor: degrade(SPA.azul), borderRadius: 4, unidade: 'mm' }], o1);

      const rot = s.nivel.map((p) => p[0]);
      const ds: Conjunto[] = [{ label: 'Nível', data: s.nivel.map((p) => p[1]), borderColor: SPA.azulEscuro, backgroundColor: degrade(SPA.verde, 0.25, 0.02), fill: 'start', borderWidth: 2.2, tension: 0.25, pointRadius: 0, unidade: 'm' }];
      for (const [chave, nome, cor] of [['atencao', 'Atenção', ALERTA.ambar], ['alerta', 'Alerta', ALERTA.laranja], ['emergencia', 'Emergência', ALERTA.rosa], ['extravasamento', 'Extravasamento', ALERTA.vermelho]] as const) {
        const cota = s.cotas?.[chave];
        if (cota != null) ds.push({ label: `${nome} (${fmt(cota)} m)`, data: rot.map(() => cota), borderColor: cor, borderDash: [7, 5], borderWidth: 2, pointRadius: 0, fill: false, unidade: 'm' });
      }
      const o2 = opcoesBase(`${s.titulo} — nível (m)`, 'm');
      o2.scales.y.beginAtZero = false;
      o2.scales.y.ticks.callback = (v: unknown) => fmt(Number(v), 1);
      // um rótulo a cada dois dias, à meia-noite
      o2.scales.x.ticks = { autoSkip: false, maxRotation: 0, color: '#334155', callback: (i: number) => { const t = rot[i]; return t && t.slice(11, 13) === '00' && Number(t.slice(8, 10)) % 2 === 0 ? String(Number(t.slice(8, 10))) : ''; } };
      o2.plugins.tooltip.callbacks.title = (it: any[]) => { const t = rot[it[0].dataIndex]; return t ? `${dataCurta(t.slice(0, 10))} ${t.slice(11, 16)}` : ''; };
      return [g1, novo(cNivel, 'line', rot, ds, o2)];
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** "1.234,5" / "12,3" / "5%" → número; vazio → null (voltar ao original); inválido → undefined. */
function numeroDigitado(txt: string): number | null | undefined {
  let s = txt.trim().replace(/\s/g, '').replace('%', '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

type Pendentes = { textos: Record<string, string>; valores: Record<string, number | null> };

export function TelaBoletim({ tipo, ano, mes, nome, competencia }: { tipo: string; ano: number; mes: number; nome: string; competencia: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [versao, setVersao] = useState(0); // muda a cada carga: o conteúdo é remontado do zero
  const [falhou, setFalhou] = useState(false);
  const [emEdicao, setEmEdicao] = useState(false);
  const [status, setStatus] = useState<{ msg: string; cor?: string }>({ msg: '' });
  const [qtdPendentes, setQtdPendentes] = useState(0);
  const [temAjuste, setTemAjuste] = useState(false);
  const [ocupado, setOcupado] = useState(false); // gravação em andamento: uma de cada vez
  const alvo = useRef<HTMLDivElement>(null);
  const graficos = useRef<Chart[]>([]);
  const pendentes = useRef<Pendentes>({ textos: {}, valores: {} });

  const conferirPendentes = useCallback(() => {
    const p = pendentes.current;
    const n = Object.keys(p.textos).length + Object.keys(p.valores).length;
    setQtdPendentes(n);
    setTemAjuste(Object.keys(p.valores).length > 0 || !!alvo.current?.querySelector('.editavel.ajustado'));
    if (n) setStatus({ msg: 'Alterações não salvas', cor: '#B45309' });
  }, []);

  const carregar = useCallback(async () => {
    setFalhou(false);
    try {
      const r = await fetch(`${API}/conteudo?${new URLSearchParams({ tipo, ano: String(ano), mes: String(mes) })}`, { cache: 'no-store' });
      const d = (await r.json()) as { ok?: boolean; html?: string };
      if (!d.ok || typeof d.html !== 'string') throw new Error('falha');
      setHtml(d.html);
      setVersao((v) => v + 1);
    } catch {
      setFalhou(true);
    }
  }, [tipo, ano, mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Desenha os gráficos do conteúdo recém-montado.
  useEffect(() => {
    const raiz = alvo.current;
    if (!raiz || html === null) return;
    for (const canvas of raiz.querySelectorAll<HTMLCanvasElement>('canvas[data-grafico]')) {
      try {
        graficos.current.push(...desenhar(canvas, JSON.parse(canvas.dataset.grafico!) as Spec));
      } catch (e) {
        console.error('Gráfico do boletim não pôde ser desenhado', e);
      }
    }
    conferirPendentes();
    return () => {
      graficos.current.forEach((g) => g.destroy());
      graficos.current = [];
    };
  }, [html, versao, conferirPendentes]);

  // Modo edição: as caixas de análise ficam editáveis.
  useEffect(() => {
    alvo.current?.querySelectorAll<HTMLElement>('.analise-texto').forEach((t) => (t.contentEditable = emEdicao ? 'true' : 'false'));
  }, [emEdicao, html, versao]);

  // Avisa antes de sair com alterações não salvas.
  useEffect(() => {
    if (!qtdPendentes) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [qtdPendentes]);

  // Impressão: a classe "imprimindo" dá aos gráficos a largura da folha antes de imprimir.
  useEffect(() => {
    const redesenhar = () => graficos.current.forEach((g) => g.resize());
    const antes = () => { document.body.classList.add('imprimindo'); redesenhar(); };
    const depois = () => { document.body.classList.remove('imprimindo'); redesenhar(); };
    window.addEventListener('beforeprint', antes);
    window.addEventListener('afterprint', depois);
    return () => {
      window.removeEventListener('beforeprint', antes);
      window.removeEventListener('afterprint', depois);
      document.body.classList.remove('imprimindo');
    };
  }, []);

  /** Troca o valor de uma célula por um campo; Enter confirma, Esc cancela, vazio volta ao valor da fonte. */
  function editarCelula(span: HTMLElement) {
    if (span.querySelector('input')) return;
    const casas = Number(span.dataset.casas || 2);
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = span.dataset.valor === '' ? '' : Number(span.dataset.valor).toLocaleString('pt-BR', { maximumFractionDigits: 6, useGrouping: false });
    input.title = 'Deixe vazio para voltar ao valor original da fonte';
    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();
    let cancelar = false;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { cancelar = true; input.blur(); }
    });
    input.addEventListener('blur', () => {
      const n = cancelar ? undefined : numeroDigitado(input.value);
      if (n !== undefined) {
        const original = span.dataset.original === '' ? null : Number(span.dataset.original);
        const volta = n === null || (original !== null && Math.abs(n - original) < 1e-9);
        pendentes.current.valores[span.dataset.chave!] = volta ? null : n;
        const efetivo = volta ? original : n;
        span.dataset.valor = efetivo === null ? '' : String(efetivo);
        span.classList.toggle('ajustado', !volta);
      }
      const v = span.dataset.valor;
      span.textContent = v === '' || v === undefined ? '—' : fmt(Number(v), casas) + (span.dataset.chave!.startsWith('perm.') ? '%' : '');
      conferirPendentes();
    });
  }

  async function enviar(corpo: object, aoConcluir: (d: Record<string, unknown>) => string) {
    setOcupado(true);
    try {
      const r = await fetch(`${API}/edicao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, ano, mes, ...corpo }) });
      const d = (await r.json()) as Record<string, unknown>;
      if (!d.ok) throw new Error('falha');
      setStatus({ msg: aoConcluir(d), cor: '#15803D' });
      setQtdPendentes(0);
      await carregar(); // redesenha tabelas e gráficos com o que ficou gravado
    } catch {
      setStatus({ msg: 'Não foi possível gravar. Tente novamente.', cor: '#B91C1C' });
    } finally {
      setOcupado(false);
    }
  }

  function salvar() {
    const p = pendentes.current;
    if (!qtdPendentes) return;
    setStatus({ msg: 'Salvando…' });
    pendentes.current = { textos: {}, valores: {} };
    void enviar(p, () => 'Alterações salvas — já valem para a tela e para o PDF.');
  }

  function restaurar() {
    const qtd = alvo.current?.querySelectorAll('.editavel.ajustado').length ?? 0;
    if (!window.confirm(`Restaurar os dados originais das fontes?\n\n${qtd} valor(es) alterado(s) ou entrado(s) neste boletim e mês serão removidos, na tela e no PDF.\nOs textos de análise serão mantidos.`)) return;
    setStatus({ msg: 'Restaurando…' });
    pendentes.current.valores = {}; // alterações de valor ainda não salvas também são descartadas
    void enviar({ acao: 'restaurar' }, (d) => `${d.removidos} valor(es) restaurado(s) ao original.`);
  }

  function gerarPdf() {
    if (!alvo.current?.querySelector('.slide-tela')) return void window.alert('Espere o boletim terminar de carregar antes de gerar o PDF.');
    if (qtdPendentes && !window.confirm('Há alterações não salvas. O PDF sairá sem elas. Continuar?')) return;
    document.body.classList.add('imprimindo');
    graficos.current.forEach((g) => g.resize());
    // um instante para os gráficos assentarem na largura da folha
    setTimeout(() => window.print(), 350);
  }

  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3 sem-imprimir">
        <button className="btn btn-success" type="button" onClick={gerarPdf} title="Abre a impressão: escolha Salvar como PDF, paisagem">
          <i className="bi bi-file-earmark-pdf me-1" /> Gerar PDF
        </button>
        <button
          className="btn btn-outline-primary"
          type="button"
          onClick={() => {
            const novo = !emEdicao;
            setEmEdicao(novo);
            if (!qtdPendentes) setStatus({ msg: novo ? 'Clique nos valores destacados ou nas caixas de análise para editar.' : '' });
          }}
        >
          <i className={`bi ${emEdicao ? 'bi-x-lg' : 'bi-pencil'} me-1`} /> {emEdicao ? 'Sair da edição' : 'Editar boletim'}
        </button>
        {emEdicao && (
          <>
            <button className="btn btn-primary" type="button" disabled={!qtdPendentes || ocupado} onClick={salvar}>
              Salvar alterações
            </button>
            <button
              className="btn btn-outline-secondary"
              type="button"
              disabled={!temAjuste || ocupado}
              onClick={restaurar}
              title="Remove todos os valores alterados deste boletim e mês e volta aos dados das fontes (os textos de análise ficam)"
            >
              Restaurar original
            </button>
          </>
        )}
        <span className="status-edicao" role="status" style={{ color: status.cor ?? '#475569' }}>
          {status.msg}
        </span>
      </div>

      {html === null ? (
        <div className="conteudo-boletim" aria-live="polite">
          {falhou ? (
            <div className="aviso">
              Não foi possível carregar o boletim no momento.{' '}
              <button className="btn btn-sm btn-outline-secondary ms-2" type="button" onClick={() => void carregar()}>
                Tentar de novo
              </button>
            </div>
          ) : (
            <div className="carregando-boletim">
              Carregando o Boletim {nome} de {competencia}…
              <br />
              <small>Na primeira consulta de um mês os dados são buscados no SIBH, no SSD e na CETESB e isso pode levar alguns minutos; depois fica guardado.</small>
            </div>
          )}
        </div>
      ) : (
        // O HTML vem do servidor deste sistema (src/lib/boletins-sala/boletim-integrado-html.ts), com todo valor escapado.
        <div
          key={versao}
          ref={alvo}
          className={`conteudo-boletim${emEdicao ? ' modo-edicao' : ''}`}
          aria-live="polite"
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(e) => {
            const span = emEdicao && (e.target as HTMLElement).tagName !== 'INPUT' ? (e.target as HTMLElement).closest<HTMLElement>('.editavel') : null;
            if (span) editarCelula(span);
          }}
          onInput={(e) => {
            const t = (e.target as HTMLElement).closest<HTMLElement>('.analise-texto');
            const bloco = t?.closest<HTMLElement>('.analise-tela');
            if (!t || !bloco) return;
            pendentes.current.textos[bloco.dataset.secao!] = t.innerText.trim();
            bloco.classList.toggle('vazia', t.innerText.trim() === '');
            conferirPendentes();
          }}
        />
      )}
    </>
  );
}
