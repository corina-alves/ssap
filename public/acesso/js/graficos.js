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

    function montar(canvas, cfg) {
        if (canvas._grafico) canvas._grafico.destroy();
        var pizza = cfg.tipo === 'pizza';
        var series = pizza ? (cfg.series || []).slice(0, 1) : (cfg.series || []);
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
            return {
                label: s.nome,
                data: s.valores,
                borderColor: pizza ? '#fff' : cor,
                backgroundColor: pizza ? (cfg.rotulos || []).map(function (_, j) { return CORES[j % CORES.length]; })
                                       : (cfg.tipo === 'area' ? cor + '33' : cor),
                fill: cfg.tipo === 'area',
                tension: 0.25,
                spanGaps: true,
                borderWidth: pizza ? 1 : 2,
                pointRadius: (cfg.rotulos || []).length > 60 ? 0 : 3
            };
        });
        var unidade = cfg.unidade ? ' ' + cfg.unidade : '';
        canvas._grafico = new Chart(canvas, {
            type: TIPO[cfg.tipo] || 'line',
            data: { labels: cfg.rotulos || [], datasets: datasets },
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
                    y: { stacked: !!cfg.empilhado, beginAtZero: true,
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
