/* Boletim Diário — Sala de Situação Vale do Paraíba.
   Busca dados.php, monta tabelas, textos e gráficos; todo elemento com data-k é
   editável e a edição fica no localStorage (por dia), valendo mesmo depois de
   "Atualizar dados". Elementos com o mesmo data-k (ex.: o cabeçalho de cada
   página) mudam juntos. */
(function () {
    'use strict';

    var hoje = (function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })();
    var CHAVE = 'boletim_paraiba:' + hoje;
    var COR = { volume: '#1a73e8', afluencia: '#1e8a3a', defluencia: '#c8302a' };
    var ORDEM_SITUACAO = ['extravasamento', 'emergencia', 'alerta', 'atencao', 'normal'];
    var dados = null;
    var edicoes = ler();
    var padroes = {}; // texto original dos elementos fixos (para "Descartar edições")
    var graficos = [];

    // ------------------------------------------------------------ utilidades
    function ler() {
        try { return JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch (e) { return {}; }
    }
    var espera;
    function gravar() {
        clearTimeout(espera);
        espera = setTimeout(function () {
            try { localStorage.setItem(CHAVE, JSON.stringify(edicoes)); } catch (e) { status('Não foi possível salvar as edições neste navegador.', true); }
        }, 400);
    }
    function status(msg, erro) {
        var s = document.getElementById('status');
        s.textContent = msg;
        s.classList.toggle('erro', !!erro);
    }
    function el(tag, attrs, filhos) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === 'texto') e.textContent = attrs[k];
            else if (k === 'classe') e.className = attrs[k];
            else e.setAttribute(k, attrs[k]);
        });
        (filhos || []).forEach(function (f) { if (f) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
        return e;
    }
    /** Célula/elemento editável com chave: usa a edição salva, se houver. */
    function ed(tag, k, texto, classe) {
        var e = el(tag, { contenteditable: 'true', 'data-k': k, classe: classe || '' });
        e.textContent = Object.prototype.hasOwnProperty.call(edicoes, k) ? edicoes[k] : texto;
        if (Object.prototype.hasOwnProperty.call(edicoes, k)) e.classList.add('editado');
        return e;
    }
    function n(v, casas) {
        if (v === null || v === undefined || v === '' || isNaN(v)) return '—';
        return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    }
    function dataBR(iso) { // '2026-10-01' ou '2026-10-01 14:30'
        if (!iso) return '—';
        var p = iso.split(' '), d = p[0].split('-');
        return d[2] + '/' + d[1] + '/' + d[0] + (p[1] ? ' – ' + p[1].replace(':', 'h') : '');
    }
    function th(t) { return el('th', { texto: t }); }
    function limpar(id) { var e = document.getElementById(id); e.textContent = ''; return e; }
    function plural(q, um, varios) { return q + ' ' + (q === 1 ? um : varios); }
    function nomePosto(c) { return (c.c ? c.c + ' – ' : '') + c.n; }

    // ------------------------------------------------------------ montagem
    function montar() {
        paginaMapa();
        paginaResolucao();
        document.querySelectorAll('[data-campo="data_curta"]').forEach(function (e) { e.textContent = dataBR(dados.gerado_em.slice(0, 10)); });
        document.querySelectorAll('[data-campo="data_hora"]').forEach(function (e) { e.textContent = dataBR(dados.gerado_em); });
        chuva();
        mapa();
        previsao();
        pontos();
        reservatorios();
        resolucao();
        desenharGraficos();
        aplicarFixos();
    }

    function cartao(num, lab, sub, classe) {
        return el('div', { classe: 'cartao ' + (classe || '') }, [
            ed('div', 'cartao|' + lab, num, 'num'), el('div', { classe: 'lab', texto: lab }), sub ? ed('div', 'cartao|' + lab + '|sub', sub, 'sub') : null
        ]);
    }

    function chuva() {
        var c = dados.chuva;
        var box = limpar('cartoes-chuva');
        box.appendChild(cartao(n(c.media, 1) + ' mm', 'Média da UGRHI', plural(c.total_postos, 'posto com dados', 'postos com dados')));
        box.appendChild(cartao(c.maxima ? n(c.maxima.v, 1) + ' mm' : '—', 'Maior acumulado', c.maxima ? c.maxima.c || c.maxima.n : ''));
        box.appendChild(cartao(String(c.acima[10]), 'Postos acima de 10 mm', c.acima[25] + ' acima de 25 mm'));
        box.appendChild(cartao(String(c.acima[50]), 'Postos acima de 50 mm', ''));

        var txt = c.total_postos
            ? 'Nas últimas 24 horas, os ' + c.total_postos + ' postos pluviométricos da UGRHI 2 com dados registraram média de ' + n(c.media, 1) + ' mm. '
              + 'O maior acumulado foi de ' + n(c.maxima.v, 1) + ' mm em ' + nomePosto(c.maxima) + '. '
              + (c.acima[10] ? plural(c.acima[10], 'posto acumulou', 'postos acumularam') + ' mais de 10 mm'
                    + (c.acima[25] ? ', ' + c.acima[25] + ' acima de 25 mm' : '') + (c.acima[50] ? ' e ' + c.acima[50] + ' acima de 50 mm' : '') + '.'
                  : 'Nenhum posto passou de 10 mm.')
            : 'Sem dados de chuva do SIBH para a UGRHI 2 no momento.';
        auto('txt_chuva', txt);

        var tab = limpar('tab-chuva');
        tab.appendChild(el('thead', {}, [el('tr', {}, [th('#'), th('Município'), th('Posto'), th('Prefixo'), th('Chuva 24 h (mm)')])]));
        var corpo = el('tbody');
        var lista = c.postos.filter(function (p) { return p.v > 10; });
        if (lista.length < 12) lista = c.postos.slice(0, 12);
        lista = lista.slice(0, 20);
        if (!lista.length) corpo.appendChild(el('tr', { classe: 'vazio' }, [el('td', { colspan: 5, texto: 'Sem dados.' })]));
        lista.forEach(function (p, i) {
            var k = 'chuva|' + p.id + '|';
            corpo.appendChild(el('tr', {}, [
                el('td', { classe: 'centro', texto: String(i + 1) }), ed('td', k + 'c', p.c), ed('td', k + 'n', p.n), ed('td', k + 'p', p.p, 'centro'),
                ed('td', k + 'v', n(p.v, 1), 'num ' + (p.v > 50 ? 'chuva-muito-forte' : p.v > 25 ? 'chuva-forte' : ''))
            ]));
        });
        tab.appendChild(corpo);
    }

    /** Página "1.1": mapa da UGRHI 2. Criada uma vez, depois da página da chuva. */
    function paginaMapa() {
        if (document.getElementById('mapa-ugrhi')) return;
        var anterior = document.getElementById('tab-chuva').closest('.pagina');
        var pag = el('section', { classe: 'pagina' }, [
            anterior.querySelector('.cab').cloneNode(true),
            el('h2', { contenteditable: 'true', 'data-k': 'sec_mapa', texto: '1.1 MAPA DA UGRHI 2 — PARAÍBA DO SUL: CHUVA EM 24 HORAS E PONTOS DE MONITORAMENTO' }),
            el('p', { classe: 'texto', contenteditable: 'true', 'data-k': 'txt_mapa', 'data-auto': 'txt_mapa' }),
            el('div', { classe: 'mapa', id: 'mapa-ugrhi' }),
            el('div', { classe: 'mapa-legenda', id: 'mapa-legenda-chuva' }),
            el('div', { classe: 'mapa-legenda', id: 'mapa-legenda-pontos' }),
            el('p', { classe: 'nota', contenteditable: 'true', 'data-k': 'nota_mapa', texto: 'Limite da UGRHI 2: DataGEO. Posição dos postos: cadastro do SIBH; posto sem coordenada não aparece. O número ao lado do posto é o acumulado em 24 h (mm), mostrado nos cinco maiores acima de 10 mm. Os municípios servem de referência de localização.' }),
            el('div', { classe: 'rodape', contenteditable: 'true', 'data-k': 'rodape_mapa', texto: 'Fonte: SIBH — SP Águas; DataGEO.' })
        ]);
        anterior.parentNode.insertBefore(pag, anterior.nextSibling);
    }

    function svg(tag, attrs, filhos) {
        var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        (filhos || []).forEach(function (f) { if (f) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
        return e;
    }
    function classeChuva(v) { return v > 50 ? 4 : v > 25 ? 3 : v > 10 ? 2 : v > 0 ? 1 : 0; }
    function losango(x, y, r, classe) {
        return svg('path', { d: 'M' + x + ',' + (y - r) + 'L' + (x + r) + ',' + y + 'L' + x + ',' + (y + r) + 'L' + (x - r) + ',' + y + 'Z', 'class': 'mapa-ponto mapa-ponto--' + classe });
    }

    function mapa() {
        var m = dados.mapa, box = limpar('mapa-ugrhi');
        var legChuva = limpar('mapa-legenda-chuva'), legPontos = limpar('mapa-legenda-pontos');
        var postos = dados.chuva.postos, pt = dados.pontos;
        auto('txt_mapa', 'Localização, na UGRHI 2, ' + (postos.length ? 'dos ' + postos.length + ' postos pluviométricos com leitura nas últimas 24 horas' : 'dos postos pluviométricos (sem leitura no momento)')
            + ' e ' + (m.pontos.length ? 'dos ' + m.pontos.length + ' pontos de monitoramento com cotas de referência' : 'dos pontos de monitoramento (sem leitura no momento)')
            + ', coloridos pelo acumulado de chuva e pela situação do nível.');
        var todos = [].concat.apply([], m.contorno);
        if (!todos.length) { box.appendChild(el('div', { classe: 'mapa-vazio', texto: 'Limite da UGRHI indisponível.' })); return; }

        // projeção plana, corrigida pela latitude média da bacia
        var lons = todos.map(function (p) { return p[0]; }), lats = todos.map(function (p) { return p[1]; });
        var lonMin = Math.min.apply(null, lons), lonMax = Math.max.apply(null, lons), latMin = Math.min.apply(null, lats), latMax = Math.max.apply(null, lats);
        var L = 700, borda = 14, k = Math.cos((latMin + latMax) / 2 * Math.PI / 180);
        var esc = (L - 2 * borda) / ((lonMax - lonMin) * k), A = Math.round((latMax - latMin) * esc + 2 * borda);
        var X = function (lon) { return Math.round((borda + (lon - lonMin) * k * esc) * 10) / 10; };
        var Y = function (lat) { return Math.round((borda + (latMax - lat) * esc) * 10) / 10; };
        var dentro = function (lat, lon) { return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax; };

        var raiz = svg('svg', { viewBox: '0 0 ' + L + ' ' + A, role: 'img', 'aria-label': 'Mapa da UGRHI 2 — Paraíba do Sul, com chuva acumulada em 24 horas e pontos de monitoramento' });
        raiz.appendChild(svg('path', { 'class': 'mapa-limite', 'fill-rule': 'evenodd', d: m.contorno.map(function (anel) {
            return 'M' + anel.map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join('L') + 'Z';
        }).join('') }));
        m.municipios.forEach(function (c) {
            raiz.appendChild(svg('circle', { 'class': 'mapa-cidade', cx: X(c.lon), cy: Y(c.lat), r: 1.6 }));
            raiz.appendChild(svg('text', { 'class': 'mapa-rotulo', x: X(c.lon) + 4, y: Y(c.lat) - 4 }, [c.nome]));
        });
        // chuva: do menor para o maior, para o maior acumulado ficar por cima
        postos.slice().reverse().forEach(function (p) {
            if (!dentro(p.lat, p.lng)) return;
            raiz.appendChild(svg('circle', { 'class': 'mapa-chuva mapa-chuva--' + classeChuva(p.v), cx: X(p.lng), cy: Y(p.lat), r: 4.5 }, [
                svg('title', {}, [p.p + ' — ' + p.n + (p.c ? ' (' + p.c + ')' : '') + ': ' + n(p.v, 1) + ' mm'])
            ]));
        });
        ORDEM_SITUACAO.slice().reverse().forEach(function (s) { // o mais grave por cima
            m.pontos.filter(function (p) { return p.situacao === s && dentro(p.lat, p.lng); }).forEach(function (p) {
                var marca = losango(X(p.lng), Y(p.lat), 5.5, s);
                marca.appendChild(svg('title', {}, [p.prefixo + ' — ' + p.nome + (p.cidade ? ' (' + p.cidade + ')' : '') + ': ' + pt.situacoes[s]]));
                raiz.appendChild(marca);
            });
        });
        postos.filter(function (p) { return p.v > 10 && dentro(p.lat, p.lng); }).slice(0, 5).forEach(function (p) {
            raiz.appendChild(svg('text', { 'class': 'mapa-valor', x: X(p.lng) + 6, y: Y(p.lat) + 3 }, [n(p.v, 1)]));
        });
        box.appendChild(raiz);

        var item = function (marca, texto) { return el('span', {}, [svg('svg', { viewBox: '0 0 12 12', 'aria-hidden': 'true' }, [marca]), texto]); };
        legChuva.appendChild(el('strong', { texto: 'Chuva em 24 h (mm):' }));
        ['sem chuva', 'até 10', '10 a 25', '25 a 50', 'acima de 50'].forEach(function (t, i) {
            legChuva.appendChild(item(svg('circle', { 'class': 'mapa-chuva mapa-chuva--' + i, cx: 6, cy: 6, r: 4.5 }), t));
        });
        legPontos.appendChild(el('strong', { texto: 'Pontos de monitoramento:' }));
        ORDEM_SITUACAO.slice().reverse().forEach(function (s) { legPontos.appendChild(item(losango(6, 6, 5.5, s), pt.situacoes[s])); });
    }

    function previsao() {
        var p = dados.previsao;
        var tab = limpar('tab-prev');
        tab.appendChild(el('thead', {}, [el('tr', {}, [th('Município'), th('Próximas 24 h (mm)'), th('24 a 48 h (mm)'), th('48 a 72 h (mm)'), th('Prob. 24 h')])]));
        var corpo = el('tbody');
        var media = function (k) {
            var v = p.map(function (x) { return x[k]; }).filter(function (x) { return x !== null; });
            return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
        };
        p.forEach(function (m) {
            var k = 'prev|' + m.nome + '|';
            corpo.appendChild(el('tr', {}, [
                ed('td', k + 'nome', m.nome), ed('td', k + 'h24', n(m.h24, 1), 'num'), ed('td', k + 'h48', n(m.h48, 1), 'num'),
                ed('td', k + 'h72', n(m.h72, 1), 'num'), ed('td', k + 'prob', m.prob === null ? '—' : m.prob + '%', 'num')
            ]));
        });
        corpo.appendChild(el('tr', { classe: 'media' }, [
            el('td', { texto: 'Média dos municípios' }), ed('td', 'prev|media|h24', n(media('h24'), 1), 'num'),
            ed('td', 'prev|media|h48', n(media('h48'), 1), 'num'), ed('td', 'prev|media|h72', n(media('h72'), 1), 'num'), el('td', { texto: '' })
        ]));
        tab.appendChild(corpo);

        var validos = p.filter(function (x) { return x.h24 !== null; });
        var max = validos.reduce(function (a, b) { return !a || b.h24 > a.h24 ? b : a; }, null);
        var txt = !validos.length ? 'Previsão indisponível no momento.'
            : (max.h24 < 1
                ? 'Não há previsão de chuva significativa nas próximas 24 horas nos municípios da bacia (média de ' + n(media('h24'), 1) + ' mm).'
                : 'Para as próximas 24 horas, a previsão indica chuva média de ' + n(media('h24'), 1) + ' mm nos municípios da bacia, com até '
                    + n(max.h24, 1) + ' mm em ' + max.nome + '.')
              + ' Entre 24 e 48 horas, média de ' + n(media('h48'), 1) + ' mm; entre 48 e 72 horas, ' + n(media('h72'), 1) + ' mm.';
        auto('txt_prev', txt);
    }

    function pontos() {
        var pt = dados.pontos, c = pt.contagem;
        var box = limpar('cartoes-pontos');
        ORDEM_SITUACAO.slice().reverse().forEach(function (s) {
            box.appendChild(cartao(String(c[s]), pt.situacoes[s], '', 'cartao--' + s));
        });

        // aviso de emergência/extravasamento (página 1)
        var criticos = pt.fora.filter(function (p) { return p.situacao === 'extravasamento' || p.situacao === 'emergencia'; });
        var aviso = document.getElementById('aviso-critico');
        aviso.hidden = !criticos.length;
        var lista = limpar('aviso-lista');
        if (criticos.length) {
            var ul = el('ul');
            criticos.forEach(function (p) {
                ul.appendChild(ed('li', 'critico|' + p.id, pt.situacoes[p.situacao].toUpperCase() + ': ' + p.prefixo + ' — ' + p.nome
                    + (p.cidade ? ' (' + p.cidade + ')' : '') + ' — nível ' + n(p.nivel, 2) + ' m, ' + n(p.acima, 2) + ' m acima da cota'));
            });
            lista.appendChild(ul);
        }

        var fora = c.extravasamento + c.emergencia + c.alerta + c.atencao;
        var partes = ['extravasamento', 'emergencia', 'alerta', 'atencao'].filter(function (s) { return c[s]; }).map(function (s) {
            return c[s] + ' em ' + pt.situacoes[s].toLowerCase();
        });
        var txt = !pt.total ? 'Sem leituras recentes dos pontos com cotas de referência na UGRHI 2.'
            : (!fora ? 'Os ' + pt.total + ' pontos monitorados na UGRHI 2 estão em condição normal.'
                : (criticos.length ? 'ATENÇÃO: há ' + plural(criticos.length, 'ponto', 'pontos') + ' em emergência ou extravasamento. ' : '')
                  + 'Dos ' + pt.total + ' pontos monitorados na UGRHI 2, ' + fora + ' ' + (fora === 1 ? 'está' : 'estão') + ' fora do normal: '
                  + partes.join(', ').replace(/, ([^,]*)$/, ' e $1') + '. Os demais estão em condição normal.');
        auto('txt_pontos', txt);

        var tab = limpar('tab-pontos');
        tab.appendChild(el('thead', {}, [el('tr', {}, [th('Situação'), th('Posto'), th('Município'), th('Nível (m)'), th('Hora'), th('Cota ultrapassada (m)'), th('Acima da cota (m)'), th('Tendência (1 h)')])]));
        var corpo = el('tbody');
        if (!pt.fora.length) corpo.appendChild(el('tr', { classe: 'vazio' }, [el('td', { colspan: 8, texto: 'Nenhum ponto em atenção, alerta, emergência ou extravasamento.' })]));
        var tend = { elevacao: '↑ subindo', reducao: '↓ descendo', estavel: '→ estável' };
        pt.fora.forEach(function (p) {
            var k = 'ponto|' + p.id + '|';
            corpo.appendChild(el('tr', {}, [
                el('td', { classe: 'centro' }, [el('span', { classe: 'selo selo--' + p.situacao, texto: pt.situacoes[p.situacao] })]),
                ed('td', k + 'n', p.prefixo + ' — ' + p.nome), ed('td', k + 'c', p.cidade), ed('td', k + 'nivel', n(p.nivel, 2), 'num'),
                ed('td', k + 'hora', p.hora ? new Date(p.hora * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'média 1 h', 'centro'),
                ed('td', k + 'cota', n(p.cota_ref, 2), 'num'), ed('td', k + 'acima', p.acima === null ? '—' : '+' + n(p.acima, 2), 'num'),
                ed('td', k + 'tend', p.tendencia ? tend[p.tendencia] : '—', 'centro ' + (p.tendencia === 'elevacao' ? 'sobe' : p.tendencia === 'reducao' ? 'desce' : ''))
            ]));
        });
        tab.appendChild(corpo);
    }

    function reservatorios() {
        var r = dados.reservatorios;
        var por = {};
        r.lista.forEach(function (x) { por[x.chave] = x; });
        var j = por[r.destaque] || {};
        var dv = j.volume !== null && j.volume_7d !== null ? j.volume - j.volume_7d : null;

        var box = limpar('destaque-res');
        box.appendChild(el('div', { classe: 'titulo' }, [ed('strong', 'res|dest|titulo', 'UHE ' + (j.nome || 'Jaguari')), el('span', { texto: 'Situação em ' + dataBR(r.data) })]));
        box.appendChild(cartao(n(j.volume, 2) + '%', 'Volume útil', dv === null ? '' : (dv >= 0 ? '+' : '') + n(dv, 2) + ' p.p. em 7 dias'));
        box.appendChild(cartao(n(j.cota, 2), 'Cota (m)', ''));
        box.appendChild(cartao(n(j.afluencia, 1), 'Afluência (m³/s)', ''));
        box.appendChild(cartao(n(j.defluencia, 1), 'Defluência (m³/s)', ''));

        var vol = function (k) { return por[k] && por[k].volume !== null ? por[k].nome + ' ' + n(por[k].volume, 1) + '%' : null; };
        auto('txt_res', !r.data ? 'Dados de reservatórios indisponíveis no momento (SAR/ANA).'
            : 'Em ' + dataBR(r.data) + ', a UHE Jaguari estava com ' + n(j.volume, 2) + '% do volume útil'
              + (dv === null ? '' : ' (' + (dv >= 0 ? '+' : '') + n(dv, 2) + ' p.p. em 7 dias)') + ', cota de ' + n(j.cota, 2) + ' m, afluência de '
              + n(j.afluencia, 1) + ' m³/s e defluência de ' + n(j.defluencia, 1) + ' m³/s. Volume útil dos demais reservatórios de regularização: '
              + ['PARAIBUNA', 'SANTA BRANCA', 'FUNIL', 'SANTA CECILIA'].map(vol).filter(Boolean).join('; ') + '.');

        var tab = limpar('tab-res');
        tab.appendChild(el('thead', {}, [el('tr', {}, [th('Reservatório'), th('Cota (m)'), th('Volume útil (%)'), th('Var. 7 dias (p.p.)'), th('Afluência (m³/s)'), th('Defluência (m³/s)')])]));
        var corpo = el('tbody');
        var grupo = null;
        r.lista.forEach(function (x) {
            if (x.grupo !== grupo) {
                grupo = x.grupo;
                corpo.appendChild(el('tr', { classe: 'grupo' }, [ed('td', 'res|grupo|' + grupo, grupo)]));
                corpo.lastChild.firstChild.setAttribute('colspan', '6');
            }
            var d7 = x.volume !== null && x.volume_7d !== null ? x.volume - x.volume_7d : null;
            var k = 'res|' + x.chave + '|';
            corpo.appendChild(el('tr', { classe: x.chave === r.destaque ? 'realce' : '' }, [
                ed('td', k + 'nome', x.nome), ed('td', k + 'cota', n(x.cota, 2), 'num'), ed('td', k + 'vol', n(x.volume, 2), 'num'),
                ed('td', k + 'd7', d7 === null ? '—' : (d7 >= 0 ? '+' : '') + n(d7, 2), 'num ' + (d7 > 0 ? 'desce' : d7 < 0 ? 'sobe' : '')),
                ed('td', k + 'afl', n(x.afluencia, 1), 'num'), ed('td', k + 'defl', n(x.defluencia, 1), 'num')
            ]));
        });
        tab.appendChild(corpo);
    }

    /** Página "4.1": condições da Resolução nº 1.382/2015 ao lado dos valores do dia. Criada uma vez, depois da página dos reservatórios. */
    function paginaResolucao() {
        if (document.getElementById('tab-res-vazoes')) return;
        var anterior = document.getElementById('tab-res').closest('.pagina');
        var pag = el('section', { classe: 'pagina' }, [
            anterior.querySelector('.cab').cloneNode(true),
            el('h2', { contenteditable: 'true', 'data-k': 'sec_resol', texto: '4.1 CONDIÇÕES DE OPERAÇÃO — RESOLUÇÃO CONJUNTA ANA/DAEE/IGAM/INEA Nº 1.382/2015' }),
            el('div', { classe: 'cartoes cartoes--resol', id: 'cartoes-resol' }),
            el('p', { classe: 'texto', contenteditable: 'true', 'data-k': 'txt_resol', 'data-auto': 'txt_resol' }),
            el('h3', { classe: 'subtitulo', contenteditable: 'true', 'data-k': 'sub_resol_vaz', texto: 'Vazão mínima a jusante dos aproveitamentos (art. 1º, I)' }),
            el('table', { classe: 'tab', id: 'tab-res-vazoes' }),
            el('p', { classe: 'nota', contenteditable: 'true', 'data-k': 'nota_resol_vaz', texto: 'Os limites da resolução são de vazão instantânea; a defluência mostrada é a média do dia informada ao SAR/ANA. A vazão bombeada para o rio Guandu não é informada pelo SAR.' }),
            el('h3', { classe: 'subtitulo', contenteditable: 'true', 'data-k': 'sub_resol_est', texto: 'Limites mínimos de volume útil por estágio de deplecionamento (art. 1º, V)' }),
            el('table', { classe: 'tab', id: 'tab-res-estagios' }),
            el('p', { classe: 'nota', contenteditable: 'true', 'data-k': 'nota_resol_est', texto: 'A mudança de estágio só ocorre quando todos os reservatórios atingem os seus mínimos, admitida variação de 5% do valor de referência (art. 1º, § 1º). Reservatório equivalente: média do volume útil de Paraibuna, Santa Branca, Jaguari e Funil, ponderada pelo volume útil de cada um.' }),
            el('div', { classe: 'rodape', contenteditable: 'true', 'data-k': 'rodape_resol', texto: 'Fonte: ANA — Resolução Conjunta ANA/DAEE/IGAM/INEA nº 1.382, de 7 de dezembro de 2015; ANA/SAR — ONS.' })
        ]);
        anterior.parentNode.insertBefore(pag, anterior.nextSibling);
    }

    function resolucao() {
        var r = dados.resolucao, data = dados.reservatorios.data;
        var FAIXAS = ['Acima do mínimo do 1º estágio', 'Abaixo do mínimo do 1º estágio', 'Abaixo do mínimo do 2º estágio', 'Abaixo do mínimo do 3º estágio'];

        var box = limpar('cartoes-resol');
        var eq = r.equivalente, p = r.paraibuna;
        box.appendChild(cartao(n(eq.volume, 1) + '%', 'Reservatório equivalente', 'referência de ' + eq.limite + '% (art. 1º, III e IV)', eq.volume === null ? '' : eq.volume >= eq.limite ? 'cartao--normal' : 'cartao--atencao'));
        box.appendChild(cartao(n(p.cota, 2), 'Cota de Paraibuna (m)', 'mínimo operacional normal: ' + n(p.minimo, 2) + ' m', p.folga === null ? '' : p.folga >= 0 ? 'cartao--normal' : 'cartao--emergencia'));
        var abaixoVaz = r.vazoes.filter(function (v) { return v.atende === false; });
        box.appendChild(cartao(String(abaixoVaz.length), 'Abaixo da vazão mínima', 'de ' + r.vazoes.filter(function (v) { return v.atende !== null; }).length + ' aproveitamentos com dado', abaixoVaz.length ? 'cartao--alerta' : 'cartao--normal'));
        var abaixoEst = r.estagios.filter(function (e) { return e.faixa !== null && e.faixa > 0; });
        box.appendChild(cartao(String(abaixoEst.length), 'Abaixo do mínimo do 1º estágio', 'de ' + r.estagios.length + ' reservatórios de regularização', abaixoEst.length ? 'cartao--atencao' : 'cartao--normal'));

        auto('txt_resol', !data ? 'Dados de reservatórios indisponíveis no momento (SAR/ANA).'
            : 'Em ' + dataBR(data) + ', o reservatório equivalente do Sistema Hidráulico Paraíba do Sul estava com ' + n(eq.volume, 1) + '% do volume útil'
              + (p.folga === null ? '' : ' e Paraibuna operava ' + n(Math.abs(p.folga), 2) + ' m ' + (p.folga >= 0 ? 'acima' : 'abaixo') + ' do nível mínimo operacional normal (' + n(p.minimo, 2) + ' m)') + '. '
              + (abaixoVaz.length ? 'Defluência abaixo da vazão mínima da resolução em: ' + abaixoVaz.map(function (v) { return v.nome + ' (' + n(v.defluencia, 1) + ' m³/s, mínimo ' + n(v.minima, 0) + ')'; }).join('; ') + '. '
                  : 'Todas as defluências informadas atendiam às vazões mínimas da resolução. ')
              + (abaixoEst.length ? 'Volume útil abaixo do mínimo do 1º estágio de deplecionamento em: ' + abaixoEst.map(function (e) { return e.nome + ' (' + n(e.volume, 1) + '%)'; }).join('; ') + '.'
                  : 'Os quatro reservatórios de regularização estavam acima dos mínimos do 1º estágio de deplecionamento.'));

        var tab = limpar('tab-res-vazoes');
        tab.appendChild(el('thead', {}, [el('tr', {}, [th('Aproveitamento'), th('Vazão mínima (m³/s)'), th('Tipo'), th('Defluência do dia (m³/s)'), th('Diferença (m³/s)'), th('Situação')])]));
        var corpo = el('tbody');
        r.vazoes.forEach(function (v, i) {
            var k = 'resol|vaz|' + i + '|';
            var dif = v.defluencia === null ? null : v.defluencia - v.minima;
            var sit = el('td', { classe: 'centro' }, [v.atende === null ? '—' : el('span', { classe: 'selo selo--' + (v.atende ? 'normal' : 'alerta'), texto: v.atende ? 'Atende' : 'Abaixo do mínimo' })]);
            corpo.appendChild(el('tr', {}, [
                ed('td', k + 'nome', v.nome), ed('td', k + 'min', n(v.minima, 0), 'num'), ed('td', k + 'tipo', v.tipo, 'centro'),
                ed('td', k + 'defl', n(v.defluencia, 1), 'num'),
                ed('td', k + 'dif', dif === null ? '—' : (dif >= 0 ? '+' : '') + n(dif, 1), 'num ' + (dif === null ? '' : dif >= 0 ? 'desce' : 'sobe')), sit
            ]));
        });
        tab.appendChild(corpo);

        tab = limpar('tab-res-estagios');
        tab.appendChild(el('thead', {}, [el('tr', {}, [th('Ordem'), th('Reservatório'), th('Volume útil (%)'), th('1º estágio (%)'), th('2º estágio (%)'), th('3º estágio (%)'), th('Situação do volume')])]));
        corpo = el('tbody');
        r.estagios.forEach(function (e) {
            var k = 'resol|est|' + e.chave + '|';
            corpo.appendChild(el('tr', {}, [
                ed('td', k + 'ordem', e.ordem + 'ª', 'centro'), ed('td', k + 'nome', e.nome), ed('td', k + 'vol', n(e.volume, 2), 'num'),
                ed('td', k + 'l1', n(e.limites[0], 0), 'num'), ed('td', k + 'l2', n(e.limites[1], 0), 'num'), ed('td', k + 'l3', n(e.limites[2], 0), 'num'),
                e.faixa === null ? el('td', { classe: 'centro', texto: '—' })
                    : el('td', { classe: 'centro' }, [el('span', { classe: 'selo selo--' + ['normal', 'atencao', 'alerta', 'emergencia'][e.faixa], texto: FAIXAS[e.faixa] })])
            ]));
        });
        corpo.appendChild(el('tr', { classe: 'media' }, [
            el('td', { texto: '' }), ed('td', 'resol|eq|nome', 'Reservatório equivalente'), ed('td', 'resol|eq|vol', n(eq.volume, 2), 'num'),
            el('td', { texto: '' }), el('td', { texto: '' }), el('td', { texto: '' }), el('td', { texto: '' })
        ]));
        tab.appendChild(corpo);
    }

    function desenharGraficos() {
        graficos.forEach(function (g) { g.destroy(); });
        graficos = [];
        var box = limpar('graficos');
        if (!window.Chart) return;
        dados.reservatorios.series.forEach(function (s, i) {
            var canvas = el('canvas', { role: 'img', 'aria-label': 'Afluência, defluência e volume útil — ' + s.nome });
            box.appendChild(el('div', { classe: 'grafico' + (i === 0 ? ' grafico--largo' : '') }, [
                ed('h3', 'graf|' + s.chave, (i === 0 ? 'UHE ' : '') + s.nome + ' — afluência, defluência e volume útil'), el('div', { classe: 'area' }, [canvas])
            ]));
            graficos.push(new Chart(canvas, {
                data: {
                    labels: s.datas.map(function (d) { return d.slice(8, 10) + '/' + d.slice(5, 7); }),
                    datasets: [
                        { type: 'bar', label: 'Volume útil (%)', data: s.volume, yAxisID: 'vol', backgroundColor: 'rgba(26, 115, 232, .35)', borderColor: COR.volume, borderWidth: 1, order: 2 },
                        { type: 'line', label: 'Afluência (m³/s)', data: s.afluencia, yAxisID: 'q', borderColor: COR.afluencia, backgroundColor: COR.afluencia, borderWidth: 1.8, pointRadius: 0, tension: 0, spanGaps: true, order: 1 },
                        { type: 'line', label: 'Defluência (m³/s)', data: s.defluencia, yAxisID: 'q', borderColor: COR.defluencia, backgroundColor: COR.defluencia, borderWidth: 1.8, pointRadius: 0, tension: 0, spanGaps: true, order: 1 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false, devicePixelRatio: 2,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
                    scales: {
                        x: { ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
                        q: { position: 'left', beginAtZero: true, title: { display: true, text: 'Vazão (m³/s)', font: { size: 10 } }, ticks: { font: { size: 9 } } },
                        vol: { position: 'right', min: 0, max: 100, title: { display: true, text: 'Volume útil (%)', font: { size: 10 } }, ticks: { font: { size: 9 } }, grid: { drawOnChartArea: false } }
                    }
                }
            }));
        });
    }

    /** Texto gerado dos dados (data-auto), a menos que tenha sido editado. */
    function auto(k, texto) {
        document.querySelectorAll('[data-auto="' + k + '"]').forEach(function (e) {
            padroes[k] = texto;
            e.textContent = Object.prototype.hasOwnProperty.call(edicoes, k) ? edicoes[k] : texto;
            e.classList.toggle('editado', Object.prototype.hasOwnProperty.call(edicoes, k));
        });
    }

    /** Textos fixos da página (títulos, notas): guarda o original e aplica a edição salva. */
    function aplicarFixos() {
        document.querySelectorAll('[data-k]:not([data-auto])').forEach(function (e) {
            var k = e.getAttribute('data-k');
            if (e.closest('table, .cartoes, .destaque-res, #aviso-lista, .graficos')) return; // gerados: já aplicados
            if (!Object.prototype.hasOwnProperty.call(padroes, k)) padroes[k] = e.textContent;
            if (Object.prototype.hasOwnProperty.call(edicoes, k)) { e.textContent = edicoes[k]; e.classList.add('editado'); }
        });
    }

    // ------------------------------------------------------------ edição
    document.addEventListener('input', function (ev) {
        var e = ev.target.closest && ev.target.closest('[data-k]');
        if (!e) return;
        var k = e.getAttribute('data-k');
        edicoes[k] = e.innerText;
        e.classList.add('editado');
        document.querySelectorAll('[data-k="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]').forEach(function (o) {
            if (o !== e) { o.textContent = edicoes[k]; o.classList.add('editado'); }
        });
        gravar();
    });
    // colar só texto (sem formatação de outro programa)
    document.addEventListener('paste', function (ev) {
        if (!ev.target.closest || !ev.target.closest('[contenteditable="true"]')) return;
        ev.preventDefault();
        document.execCommand('insertText', false, (ev.clipboardData || window.clipboardData).getData('text'));
    });

    // ------------------------------------------------------------ dados
    function carregar(atualizar) {
        status('Consultando SIBH, Open-Meteo e ANA/SAR…');
        fetch('/api/acesso/boletim_paraiba/dados' + (atualizar ? '?atualizar=1' : ''), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
            .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.erro || ('HTTP ' + r.status)); return j; }); })
            .then(function (j) {
                dados = j;
                montar();
                status('Dados de ' + dataBR(j.gerado_em) + (j.falhas.length ? ' — sem resposta agora: ' + j.falhas.join(', ') + ' (confira os valores)' : '.'), j.falhas.length > 0);
            })
            .catch(function (e) { status('Não foi possível carregar os dados: ' + e.message, true); });
    }

    document.getElementById('btn-atualizar').addEventListener('click', function () { carregar(true); });
    document.getElementById('btn-pdf').addEventListener('click', function () { window.print(); });
    document.getElementById('btn-limpar').addEventListener('click', function () {
        if (!window.confirm('Descartar todas as edições feitas hoje neste boletim?')) return;
        edicoes = {};
        try { localStorage.removeItem(CHAVE); } catch (e) { /* ignora */ }
        Object.keys(padroes).forEach(function (k) {
            document.querySelectorAll('[data-k="' + k + '"]').forEach(function (e) { e.textContent = padroes[k]; e.classList.remove('editado'); });
        });
        if (dados) montar();
    });
    window.addEventListener('beforeprint', function () { graficos.forEach(function (g) { g.resize(); }); });

    aplicarFixos();
    carregar(false);
})();
