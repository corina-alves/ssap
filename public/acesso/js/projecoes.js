/* Projeções do volume útil × GDN (graficos/projecoes) — mesmo visual do
   Kit_Atualizar_Graficos: título em duas linhas, logo, curvas QN, limite da
   Faixa 2 tracejado, blocos "Retomada da GDN" na linha de 10% e rodapé.
   <canvas data-projecao='{...}' data-logo="url">; <button data-baixar-png="id do canvas">.
   Tamanhos de fonte e traço proporcionais à largura (base 1600 px, como o PNG do kit). */
(function () {
    'use strict';
    if (!window.Chart) return;

    var BASE = 1600;
    // Tamanhos abaixo estão em pontos, como no script do kit (matplotlib, 220 dpi em 3520 px):
    // 1 pt = 220/72/2.2 ≈ 1,39 px na largura base de 1600 px.
    var PT = 220 / 72 / 2.2;
    var ROXO = '#7B3294';
    var numBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
    var logos = {};

    function logo(url) {
        if (!url) return null;
        if (!logos[url]) {
            logos[url] = new Image();
            logos[url].src = url;
        }
        return logos[url];
    }
    function esc(chart) { return chart.width / BASE; }
    function px(chart, v) { return Math.max(1, v * PT * esc(chart)); }

    // Fundo branco (o PNG baixado não fica transparente)
    var fundo = {
        id: 'projFundo',
        beforeDraw: function (chart) {
            var c = chart.ctx;
            c.save();
            c.fillStyle = '#fff';
            c.fillRect(0, 0, chart.width, chart.height);
            c.restore();
        }
    };

    // Faixas da GDN: sombra do mês de análise até o mês da retomada, linha pontilhada e caixa na linha de 10%
    var gdn = {
        id: 'projGdn',
        beforeDatasetsDraw: function (chart) {
            var cfg = chart.$proj, x = chart.scales.x, y = chart.scales.y, a = chart.chartArea, c = chart.ctx;
            if (!cfg || !cfg.marcas) return;
            cfg.marcas.forEach(function (m) {
                var x0 = x.getPixelForValue(m.de), x1 = x.getPixelForValue(Math.min(m.ate, cfg.rotulos.length - 1));
                c.save();
                c.fillStyle = 'rgba(123, 50, 148, 0.12)';
                c.fillRect(x0, a.top, Math.max(x1 - x0, 2), a.bottom - a.top);
                c.strokeStyle = ROXO;
                c.lineWidth = px(chart, 1.8);
                c.setLineDash([px(chart, 2), px(chart, 3)]);
                c.beginPath(); c.moveTo(x0, a.top); c.lineTo(x0, a.bottom); c.stroke();
                c.restore();
            });
        },
        afterDatasetsDraw: function (chart) {
            var cfg = chart.$proj, x = chart.scales.x, y = chart.scales.y, c = chart.ctx;
            if (!cfg || !cfg.marcas) return;
            var fonte = 'bold ' + px(chart, 15) + 'px sans-serif';
            var yCaixa = y.getPixelForValue(10);
            cfg.marcas.forEach(function (m, i) {
                var x0 = x.getPixelForValue(m.de);
                var linhas = [m.texto, m.cenarios];
                c.save();
                c.font = fonte;
                var larg = Math.max(c.measureText(linhas[0]).width, c.measureText(linhas[1]).width);
                var alt = px(chart, 15) * 2.5, pad = px(chart, 6);
                // Com mais de um bloco, o primeiro fica à esquerda da linha (como no kit)
                var esquerda = cfg.marcas.length > 1 && i === 0;
                var bx = esquerda ? x0 - px(chart, 12) - larg - pad * 2 : x0 + px(chart, 12);
                bx = Math.max(2, Math.min(bx, chart.width - larg - pad * 2 - 2));
                var by = yCaixa - alt / 2;
                c.fillStyle = 'rgba(255,255,255,0.95)';
                c.strokeStyle = ROXO;
                c.lineWidth = px(chart, 1.2);
                if (c.roundRect) { c.beginPath(); c.roundRect(bx, by, larg + pad * 2, alt, px(chart, 5)); c.fill(); c.stroke(); }
                else { c.fillRect(bx, by, larg + pad * 2, alt); c.strokeRect(bx, by, larg + pad * 2, alt); }
                c.fillStyle = '#5E2372';
                c.textBaseline = 'middle';
                c.textAlign = esquerda ? 'right' : 'left';
                var tx = esquerda ? bx + larg + pad : bx + pad;
                c.fillText(linhas[0], tx, by + alt * 0.3);
                c.fillText(linhas[1], tx, by + alt * 0.72);
                c.restore();
            });
        }
    };

    // Logo (canto superior direito) e rodapé
    var moldura = {
        id: 'projMoldura',
        afterDraw: function (chart) {
            var cfg = chart.$proj, c = chart.ctx;
            if (!cfg) return;
            var img = logo(chart.$logo);
            if (img && img.complete && img.naturalWidth) {
                var w = px(chart, 72), h = w * img.naturalHeight / img.naturalWidth;
                c.drawImage(img, chart.width - w - px(chart, 40), px(chart, 14), w, h);
            }
            if (cfg.rodape) {
                c.save();
                c.font = px(chart, 15) + 'px sans-serif';
                c.fillStyle = '#333';
                c.textAlign = 'center';
                c.textBaseline = 'bottom';
                c.fillText(cfg.rodape, chart.width / 2, chart.height - px(chart, 6));
                c.restore();
            }
        }
    };

    function montar(canvas, cfg, opcoes) {
        opcoes = opcoes || {};
        var datasets = cfg.series.map(function (s) {
            return {
                label: s.nome, data: s.valores, borderColor: s.cor || '#0a4677', backgroundColor: s.cor || '#0a4677',
                borderWidth: function (ctx) { return px(ctx.chart, 3.4); },
                pointRadius: function (ctx) { return px(ctx.chart, 3.5); },
                pointHoverRadius: function (ctx) { return px(ctx.chart, 6); },
                tension: 0, spanGaps: true, order: 1
            };
        });
        if (cfg.limite) {
            datasets.push({
                label: cfg.limite.nome, data: cfg.limite.valores, borderColor: '#545454', backgroundColor: '#545454',
                borderDash: [8, 5], pointStyle: 'rect',
                borderWidth: function (ctx) { return px(ctx.chart, 2); },
                pointRadius: function (ctx) { return px(ctx.chart, 3); },
                tension: 0, spanGaps: true, order: 2
            });
        }
        var fonteTicks = function (ctx) { return { size: px(ctx.chart, 18) }; };
        // Marcador da legenda (não aceita função): calculado pela largura inicial
        var largura = opcoes.fixo ? BASE : ((canvas.parentNode && canvas.parentNode.clientWidth) || BASE);
        var marcador = Math.max(6, 9 * PT * largura / BASE);
        var chart = new Chart(canvas, {
            type: 'line',
            data: { labels: cfg.rotulos, datasets: datasets },
            plugins: [fundo, gdn, moldura],
            options: {
                responsive: !opcoes.fixo,
                maintainAspectRatio: true,
                aspectRatio: BASE / 750,
                devicePixelRatio: opcoes.dpr || window.devicePixelRatio,
                animation: false,
                layout: { padding: function (ctx) { var s = esc(ctx.chart); return { top: 10 * s, right: 30 * s, left: 20 * s, bottom: 34 * s }; } },
                plugins: {
                    title: {
                        display: true, text: [cfg.titulo, cfg.subtitulo], color: '#000',
                        font: function (ctx) { return { size: px(ctx.chart, 28), weight: 'bold' }; },
                        padding: function (ctx) { return { top: px(ctx.chart, 16), bottom: px(ctx.chart, 12) }; }
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: function (ctx) { return { size: px(ctx.chart, 18) }; },
                            usePointStyle: true, boxHeight: marcador, color: '#000',
                            padding: 28
                        }
                    },
                    tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + (c.parsed.y === null ? '—' : numBR.format(c.parsed.y) + '%'); } } }
                },
                scales: {
                    x: { offset: true, grid: { display: false }, ticks: { font: fonteTicks, color: '#000', maxRotation: 0 } },
                    y: {
                        min: cfg.y_min, max: cfg.y_max,
                        ticks: { stepSize: 10, font: fonteTicks, color: '#000' },
                        title: { display: true, text: 'Volume útil final (%)', color: '#000', font: function (ctx) { return { size: px(ctx.chart, 20) }; } },
                        border: { display: true, color: '#000', dash: [4, 4] }, // dash = grade tracejada (Chart.js 4)
                        // Grade horizontal tracejada, sem a linha do zero (como no kit)
                        grid: { color: function (ctx) { return ctx.tick && ctx.tick.value === 0 ? 'rgba(0,0,0,0)' : '#D9D9D9'; } }
                    }
                }
            }
        });
        chart.$proj = cfg;
        chart.$logo = canvas.getAttribute('data-logo') || opcoes.logo;
        var img = logo(chart.$logo);
        if (img && !img.complete) img.addEventListener('load', function () { chart.draw(); });
        return chart;
    }

    var charts = {};
    document.querySelectorAll('canvas[data-projecao]').forEach(function (cv) {
        try {
            var cfg = JSON.parse(cv.getAttribute('data-projecao'));
            charts[cv.id] = { cfg: cfg, chart: montar(cv, cfg) };
        } catch (e) { /* configuração inválida: ignora */ }
    });

    // PNG em alta resolução (3520 × 1650, como o kit), desenhado fora da tela
    function baixar(id) {
        var item = charts[id];
        if (!item) return;
        var caixa = document.createElement('div');
        caixa.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + BASE + 'px;height:750px';
        var cv = document.createElement('canvas');
        cv.width = BASE; cv.height = 750;
        caixa.appendChild(cv);
        document.body.appendChild(caixa);
        var url = document.getElementById(id).getAttribute('data-logo');
        var img = logo(url);
        var gerar = function () {
            var ch = montar(cv, item.cfg, { fixo: true, dpr: 2.2, logo: url });
            ch.resize(BASE, 750);
            ch.draw();
            var a = document.createElement('a');
            a.href = cv.toDataURL('image/png');
            a.download = item.cfg.arquivo || 'projecao.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            ch.destroy();
            caixa.remove();
        };
        if (img && !img.complete) img.addEventListener('load', gerar, { once: true }); else gerar();
    }
    document.querySelectorAll('[data-baixar-png]').forEach(function (b) {
        b.addEventListener('click', function () { baixar(b.getAttribute('data-baixar-png')); });
    });
})();
