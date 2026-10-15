/* Gráficos dos sistemas produtores (sistemas_produtores/index.php), Chart.js local.
   <canvas data-sp-grafico='{"sistema":"","rotulos":[],"volume":[],"chuva":[],"rotulo_chuva":"","afluente":[],"defluente":[],"arquivo":""}'>
   Volume útil em barras, chuva em linha suave, vazões afluente e defluente em linhas retas.
   Três eixos: vazão (m³/s) e volume (%) à esquerda, chuva (mm) à direita.
   <button data-sp-baixar="id-do-canvas"> baixa o gráfico em PNG (fundo branco).
   <button data-sp-tabela="id-do-canvas"> baixa a tabela do sistema em PNG, no formato do boletim mensal.
   <button data-sp-copiar="id-do-canvas"> copia a tabela (colar no Word, PowerPoint, Excel...). */
(function () {
    'use strict';
    if (!window.Chart) return;

    var COR = { volume: '#1a73e8', chuva: '#33d6e0', afluente: '#1e8a3a', defluente: '#c8302a' };
    var numBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
    var FONTE_EIXO = { size: 15 };                    // valores dos eixos x e y
    var FONTE_TITULO = { size: 16, weight: 'bold' };  // títulos dos eixos y

    // Fundo branco no canvas, para o PNG não sair transparente
    var fundoBranco = {
        id: 'spFundoBranco',
        beforeDraw: function (chart) {
            var ctx = chart.ctx;
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, chart.width, chart.height);
            ctx.restore();
        }
    };

    function eixo(titulo, cor, posicao, extra) {
        var e = {
            position: posicao, beginAtZero: true,
            title: { display: true, text: titulo, color: cor, font: FONTE_TITULO },
            ticks: { color: cor, font: FONTE_EIXO, callback: function (v) { return numBR.format(v); } },
            grid: { drawOnChartArea: false }
        };
        for (var k in extra) e[k] = extra[k];
        return e;
    }

    function linha(rotulo, dados, cor, eixoId, suave) {
        return {
            type: 'line', label: rotulo, data: dados, yAxisID: eixoId,
            borderColor: cor, backgroundColor: cor, borderWidth: 2,
            tension: suave ? 0.4 : 0, cubicInterpolationMode: suave ? 'monotone' : 'default',
            pointRadius: 0, pointHoverRadius: 4, pointStyle: 'line', spanGaps: true, fill: false, order: 1
        };
    }

    function montar(canvas, cfg) {
        var s = cfg.sistema;
        canvas._grafico = new Chart(canvas, {
            data: {
                labels: cfg.rotulos,
                datasets: [
                    { type: 'bar', label: s + ' – Volume útil (%)', data: cfg.volume, yAxisID: 'volume',
                      backgroundColor: COR.volume, borderColor: COR.volume, barPercentage: 0.6, pointStyle: 'rect', order: 2, unidade: '%' },
                    Object.assign(linha(s + ' – ' + (cfg.rotulo_chuva || 'Chuva (mm)'), cfg.chuva, COR.chuva, 'chuva', true), { unidade: 'mm' }),
                    Object.assign(linha(s + ' – Vazão afluente (m³/s)', cfg.afluente, COR.afluente, 'vazao', false), { unidade: 'm³/s' }),
                    Object.assign(linha(s + ' – Vazão defluente (m³/s)', cfg.defluente, COR.defluente, 'vazao', false), { unidade: 'm³/s' })
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    // Legenda e tooltip na ordem das séries (volume, chuva, afluente, defluente);
                    // sem o sort, o Chart.js ordena pelo "order" de desenho e o volume (barras, atrás) iria para o fim.
                    legend: { position: 'bottom', labels: { usePointStyle: true, sort: function (a, b) { return a.datasetIndex - b.datasetIndex; } } },
                    tooltip: { itemSort: function (a, b) { return a.datasetIndex - b.datasetIndex; }, callbacks: { label: function (c) {
                        var v = c.parsed.y;
                        return c.dataset.label.replace(/^.* – /, '') + ': ' + (v === null ? '—' : numBR.format(v));
                    } } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#3d4b59', font: FONTE_EIXO } },
                    vazao: eixo('Vazão (m³/s)', '#5b6b7b', 'left', { grid: { drawOnChartArea: true, color: '#e9edf1' } }),
                    volume: eixo('Volume (%)', COR.volume, 'left', {}),
                    chuva: eixo('Chuva (mm)', '#5b6b7b', 'right', {})
                }
            },
            plugins: [fundoBranco]
        });
    }

    document.querySelectorAll('canvas[data-sp-grafico]').forEach(function (c) {
        try { montar(c, JSON.parse(c.getAttribute('data-sp-grafico'))); } catch (e) { /* configuração inválida: ignora */ }
    });

    function baixar(url, nome) {
        var a = document.createElement('a');
        a.href = url;
        a.download = nome + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function configuracao(botao, atributo) {
        var canvas = document.getElementById(botao.getAttribute(atributo));
        return canvas ? JSON.parse(canvas.getAttribute('data-sp-grafico')) : null;
    }

    document.querySelectorAll('[data-sp-baixar]').forEach(function (b) {
        b.addEventListener('click', function () {
            var canvas = document.getElementById(b.getAttribute('data-sp-baixar'));
            if (!canvas || !canvas._grafico) return;
            var cfg = JSON.parse(canvas.getAttribute('data-sp-grafico'));
            baixar(canvas._grafico.toBase64Image('image/png', 1), cfg.arquivo || 'grafico');
        });
    });

    // ---------------------------------------------------------------- tabela do boletim mensal
    // Colunas do boletim: mês, volume útil, chuva acumulada, vazão afluente e vazão defluente.
    function dadosTabela(cfg) {
        var chuva = /média/i.test(cfg.rotulo_chuva || '') ? ['Chuva', 'Média', '(mm)'] : ['Chuva', 'Acumulada', '(mm)'];
        var colunas = [
            { titulo: ['Ano'] },
            { titulo: ['Volume', 'Útil (%)'], valores: cfg.volume, casas: 1 },
            { titulo: chuva, valores: cfg.chuva, casas: 1 },
            { titulo: ['Vazão', 'Afluente', '(m³/s)'], valores: cfg.afluente, casas: 2 },
            { titulo: ['Vazão', 'Defluente', '(m³/s)'], valores: cfg.defluente, casas: 2 }
        ];
        var linhas = cfg.rotulos.map(function (mes, i) {
            return [String(mes).replace(" '", '/')].concat(colunas.slice(1).map(function (c) {
                var v = c.valores[i];
                return v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c.casas, maximumFractionDigits: c.casas });
            }));
        });
        return { titulo: String(cfg.sistema).toLocaleUpperCase('pt-BR'), colunas: colunas, linhas: linhas };
    }

    function desenharTabela(cfg) {
        var t = dadosTabela(cfg);
        var ESCALA = 2, L = 1040, H_TITULO = 60, H_CAB = 112, H_LINHA = 58;
        var larguras = [200, 180, 220, 220, 220];
        var altura = H_TITULO + H_CAB + H_LINHA * t.linhas.length;
        var c = document.createElement('canvas');
        c.width = (L + 2) * ESCALA;
        c.height = (altura + 2) * ESCALA;
        var ctx = c.getContext('2d');
        var FONTE = '"Segoe UI", Arial, sans-serif';
        ctx.scale(ESCALA, ESCALA);
        ctx.translate(1, 1);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-1, -1, L + 2, altura + 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#111';

        ctx.font = '700 24px ' + FONTE;
        ctx.fillText(t.titulo, L / 2, H_TITULO / 2);

        var x = 0;
        ctx.font = '700 21px ' + FONTE;
        t.colunas.forEach(function (col, k) {
            var inicio = H_TITULO + H_CAB / 2 - (col.titulo.length - 1) * 13;
            col.titulo.forEach(function (parte, n) { ctx.fillText(parte, x + larguras[k] / 2, inicio + n * 26); });
            x += larguras[k];
        });

        t.linhas.forEach(function (linha, i) {
            var y = H_TITULO + H_CAB + H_LINHA * i + H_LINHA / 2;
            var ultima = i === t.linhas.length - 1; // mês do boletim em destaque
            ctx.font = (ultima ? '700' : '400') + ' 21px ' + FONTE;
            var px = 0;
            linha.forEach(function (texto, k) {
                ctx.fillText(texto, px + larguras[k] / 2, y);
                px += larguras[k];
            });
        });

        // grade
        ctx.strokeStyle = '#c9cdd2';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(0, 0, L, altura);
        [H_TITULO, H_TITULO + H_CAB].forEach(function (y) { ctx.moveTo(0, y); ctx.lineTo(L, y); });
        for (var i = 1; i < t.linhas.length; i++) {
            var yl = H_TITULO + H_CAB + H_LINHA * i;
            ctx.moveTo(0, yl);
            ctx.lineTo(L, yl);
        }
        var xc = 0;
        for (var k = 0; k < larguras.length - 1; k++) {
            xc += larguras[k];
            ctx.moveTo(xc, H_TITULO);
            ctx.lineTo(xc, altura);
        }
        ctx.stroke();
        return c;
    }

    document.querySelectorAll('[data-sp-tabela]').forEach(function (b) {
        b.addEventListener('click', function () {
            var cfg = configuracao(b, 'data-sp-tabela');
            if (cfg) baixar(desenharTabela(cfg).toDataURL('image/png'), 'tabela_' + (cfg.arquivo || 'sistema'));
        });
    });

    function escapar(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    document.querySelectorAll('[data-sp-copiar]').forEach(function (b) {
        b.addEventListener('click', function () {
            var cfg = configuracao(b, 'data-sp-copiar');
            if (!cfg || !navigator.clipboard) return;
            var t = dadosTabela(cfg);
            var cabecalho = t.colunas.map(function (c) { return c.titulo.join(' '); });
            var texto = [t.titulo, cabecalho.join('\t')].concat(t.linhas.map(function (l) { return l.join('\t'); })).join('\n');
            var celula = 'border:1px solid #c9cdd2;padding:6px 10px;text-align:center';
            var html = '<table style="border-collapse:collapse;font-family:Arial,sans-serif">' +
                '<tr><th colspan="' + t.colunas.length + '" style="' + celula + '">' + escapar(t.titulo) + '</th></tr>' +
                '<tr>' + cabecalho.map(function (c) { return '<th style="' + celula + '">' + escapar(c) + '</th>'; }).join('') + '</tr>' +
                t.linhas.map(function (l, i) {
                    var negrito = i === t.linhas.length - 1 ? ';font-weight:bold' : '';
                    return '<tr>' + l.map(function (v) { return '<td style="' + celula + negrito + '">' + escapar(v) + '</td>'; }).join('') + '</tr>';
                }).join('') + '</table>';
            var copia = window.ClipboardItem
                ? navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' }) })])
                : navigator.clipboard.writeText(texto);
            copia.then(function () {
                var original = b.innerHTML;
                b.innerHTML = '<i class="bi bi-check2"></i> Copiada!';
                setTimeout(function () { b.innerHTML = original; }, 1800);
            }).catch(function () { /* sem permissão para a área de transferência */ });
        });
    });
})();
