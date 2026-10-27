/* Gráficos da área /acesso/ (Chart.js local).
   <canvas data-grafico='{"tipo":"linha","rotulos":[...],"series":[{"nome":"","valores":[],"cor":"#rrggbb"}],...}'>
   "cor" é opcional (cor fixa da série); sem ela, usa a paleta na ordem.
   Editor: <textarea data-grafico-dados> + campos data-grafico-campo="tipo|unidade|eixo_y|empilhado"
   atualizam a prévia <canvas data-grafico-previa> enquanto o usuário digita. */
(function () {
    'use strict';
    if (!window.Chart) return;

    var CORES = ['#0a4677', '#00a859', '#e08600', '#0d7ea4', '#8c1c24', '#6c7f91', '#7b4bb7', '#c2185b'];
    var TIPO = { linha: 'line', barra: 'bar', area: 'line', pizza: 'pie' };
    var numBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

    /* Estilo de uma série: o próprio (cfg.estilos[nome]) ou o do gráfico
       (tipo + estilo: barra, area, linha-reta, pontos ou linha suave). */
    function estiloDe(cfg, nome) {
        var proprio = cfg.estilos && cfg.estilos[nome];
        if (proprio) return proprio;
        if (cfg.tipo === 'barra' || cfg.tipo === 'area') return cfg.tipo;
        return cfg.estilo === 'reta' ? 'linha-reta' : cfg.estilo === 'pontos' ? 'pontos' : 'linha';
    }

    /* Faixas do período chuvoso (dez–mai) e seco (jun–nov) atrás das séries,
       com divisa tracejada entre elas. cfg.meses = mês (1–12) de cada rótulo. */
    var CHUVOSO = [12, 1, 2, 3, 4, 5];
    function pluginPeriodos(meses) {
        return {
            id: 'periodos',
            beforeDatasetsDraw: function (chart) {
                var x = chart.scales.x, area = chart.chartArea, ctx = chart.ctx, n = meses.length;
                if (!x || !n) return;
                var pos = function (i) { return x.getPixelForValue(i); };
                var borda = function (i) { // divisa entre o rótulo i-1 e o i
                    if (i <= 0) return area.left;
                    if (i >= n) return area.right;
                    return (pos(i - 1) + pos(i)) / 2;
                };
                var chuvoso = function (k) { return CHUVOSO.indexOf(meses[k]) >= 0; };
                var trechos = [], ini = 0;
                for (var i = 1; i <= n; i++) {
                    if (i === n || chuvoso(i) !== chuvoso(ini)) { trechos.push({ de: ini, ate: i, chuvoso: chuvoso(ini) }); ini = i; }
                }
                ctx.save();
                trechos.forEach(function (t, k) {
                    var x0 = borda(t.de), x1 = borda(t.ate);
                    ctx.fillStyle = t.chuvoso ? 'rgba(4,84,252,.07)' : 'rgba(245,183,42,.12)';
                    ctx.fillRect(x0, area.top, x1 - x0, area.bottom - area.top);
                    if (k > 0) { // divisa tracejada
                        ctx.strokeStyle = '#5b6b7b'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
                        ctx.beginPath(); ctx.moveTo(x0, area.top); ctx.lineTo(x0, area.bottom); ctx.stroke(); ctx.setLineDash([]);
                    }
                    var largura = x1 - x0;
                    var nome = largura > 170 ? (t.chuvoso ? 'Período chuvoso (dez–mai)' : 'Período seco (jun–nov)')
                             : largura > 56 ? (t.chuvoso ? 'Chuvoso' : 'Seco') : '';
                    if (nome) {
                        ctx.fillStyle = '#0a1633'; ctx.font = '600 11px ' + (getComputedStyle(chart.canvas).fontFamily || 'sans-serif');
                        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                        ctx.fillText(nome, x0 + largura / 2, area.top + 4);
                    }
                });
                ctx.restore();
            }
        };
    }

    function montar(canvas, cfg) {
        if (canvas._grafico) canvas._grafico.destroy();
        var pizza = cfg.tipo === 'pizza';
        var series = pizza ? (cfg.series || []).slice(0, 1) : (cfg.series || []);
        var muitos = (cfg.rotulos || []).length > 60;
        var datasets = series.map(function (s, i) {
            var cor = /^#[0-9a-fA-F]{6}$/.test(s.cor || '') ? s.cor : CORES[i % CORES.length];
            // Série de referência "MLT…": linha tracejada (também sobre barras)
            var mlt = !pizza && /^MLT/i.test(s.nome || '');
            if (mlt) {
                return {
                    label: s.nome, data: s.valores, type: 'line', borderColor: '#5b6b7b', backgroundColor: 'rgba(0,0,0,0)',
                    borderDash: [6, 4], borderWidth: 2, fill: false, tension: 0.25, spanGaps: true, pointRadius: 0, order: 0
                };
            }
            if (pizza) {
                return {
                    label: s.nome, data: s.valores, borderColor: '#fff', borderWidth: 1,
                    backgroundColor: (cfg.rotulos || []).map(function (_, j) { return CORES[j % CORES.length]; })
                };
            }
            var estilo = estiloDe(cfg, s.nome);
            var base = { label: s.nome, data: s.valores, borderColor: cor, spanGaps: true, borderWidth: 2 };
            if (estilo === 'barra') {
                // barras ficam atrás das linhas quando o gráfico mistura os dois
                return Object.assign(base, { type: 'bar', backgroundColor: cor, order: 2 });
            }
            var linha = Object.assign(base, {
                type: 'line', order: 1, backgroundColor: cor,
                tension: estilo === 'linha-reta' || estilo === 'pontos' ? 0 : 0.25,
                pointRadius: estilo === 'pontos' ? 4 : (muitos ? 0 : 3),
                showLine: estilo !== 'pontos',
                fill: false
            });
            if (estilo === 'area') {
                linha.backgroundColor = cor + '33';
                // áreas empilhadas: cada uma preenche até a de baixo
                linha.fill = cfg.empilhado && i > 0 ? '-1' : 'origin';
            }
            return linha;
        });
        var unidade = cfg.unidade ? ' ' + cfg.unidade : '';
        var plugins = [];
        if (!pizza && cfg.periodos && Array.isArray(cfg.meses) && cfg.meses.length === (cfg.rotulos || []).length) plugins.push(pluginPeriodos(cfg.meses));
        canvas._grafico = new Chart(canvas, {
            type: TIPO[cfg.tipo] || 'line',
            data: { labels: cfg.rotulos || [], datasets: datasets },
            plugins: plugins,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: function (c) {
                        var v = pizza ? c.parsed : c.parsed.y;
                        return c.dataset.label + ': ' + (v === null ? '—' : numBR.format(v) + unidade);
                    } } }
                },
                scales: pizza ? {} : {
                    x: { stacked: !!cfg.empilhado },
                    // com as faixas de período, folga no topo para os nomes não ficarem atrás das séries
                    y: { stacked: !!cfg.empilhado, beginAtZero: true, grace: plugins.length ? '12%' : 0,
                         title: { display: !!cfg.eixo_y, text: (cfg.eixo_y || '') + (cfg.unidade ? ' (' + cfg.unidade + ')' : '') },
                         ticks: { callback: function (v) { return numBR.format(v); } } }
                }
            }
        });
    }

    document.querySelectorAll('canvas[data-grafico]').forEach(function (c) {
        try { montar(c, JSON.parse(c.getAttribute('data-grafico'))); } catch (e) { /* configuração inválida: ignora */ }
    });

    // ---- Prévia do editor (a validação que vale é a do servidor)
    var area = document.querySelector('textarea[data-grafico-dados]');
    var previa = document.querySelector('canvas[data-grafico-previa]');
    if (!area || !previa) return;

    function numero(v) {
        v = (v || '').replace(/\s/g, '');
        if (v === '' || v === '-' || v === '—') return null;
        if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.');
        var n = Number(v);
        return isNaN(n) ? null : n;
    }
    function campo(nome) {
        var el = document.querySelector('[data-grafico-campo="' + nome + '"]');
        if (!el) return '';
        return el.type === 'checkbox' ? el.checked : el.value;
    }
    function atualizar() {
        var linhas = area.value.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
        if (linhas.length < 2) return;
        var sep = linhas[0].indexOf('\t') >= 0 ? '\t' : (linhas[0].indexOf(';') >= 0 ? ';' : ',');
        var cab = linhas[0].split(sep);
        var series = cab.slice(1, 9).map(function (n, i) { return { nome: n.trim() || 'Série ' + (i + 1), valores: [] }; });
        var rotulos = [];
        linhas.slice(1).forEach(function (l) {
            var cols = l.split(sep);
            rotulos.push((cols[0] || '').trim());
            series.forEach(function (s, i) { s.valores.push(numero(cols[i + 1])); });
        });
        montar(previa, { tipo: campo('tipo'), rotulos: rotulos, series: series, unidade: campo('unidade'),
                         eixo_y: campo('eixo_y'), empilhado: campo('empilhado') });
    }
    var espera;
    function agendar() { clearTimeout(espera); espera = setTimeout(atualizar, 300); }
    area.addEventListener('input', agendar);
    document.querySelectorAll('[data-grafico-campo]').forEach(function (el) { el.addEventListener('change', agendar); el.addEventListener('input', agendar); });
    atualizar();
})();
