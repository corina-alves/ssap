/* Boletim Diário PCJ — preenche as tabelas com os dados do SIBH, deixa tudo
 * editável, guarda o rascunho no navegador (por data) e imprime em 16:9. */
(function () {
    'use strict';

    var corpo = document.body;
    var URL_DADOS = corpo.dataset.dados;
    var URL_MEDIAS = corpo.dataset.medias;
    var TOKEN = corpo.dataset.token;
    var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    var campoData = document.getElementById('data');
    var status = document.getElementById('status');
    var estado = null; // {data, dados, textos:{}, imagens:{}, salvoEm}

    // ---------------------------------------------------------------- utilidades
    function avisar(msg, erro) {
        status.textContent = msg;
        status.classList.toggle('erro', !!erro);
    }

    function el(tag, attrs, filhos) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === 'texto') { e.textContent = attrs[k]; }
            else if (k === 'classe') { e.className = attrs[k]; }
            else { e.setAttribute(k, attrs[k]); }
        });
        (filhos || []).forEach(function (f) { if (f) { e.appendChild(f); } });
        return e;
    }

    function br(data) { // '2026-09-25' → '25/09/2026'
        var p = String(data).split('-');
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    function brCurta(data) { // → '25/09/26'
        var p = String(data).split('-');
        return p[2] + '/' + p[1] + '/' + p[0].slice(2);
    }

    function num(v, casas) {
        if (v === null || v === undefined || v === '' || isNaN(v)) { return '*'; }
        return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    }

    /** Texto digitado → número (aceita "1.234,56", "12,5", "12.5"); "*" ou vazio → null. */
    function lerNumero(txt) {
        var t = String(txt || '').replace(/[^\d,.\-]/g, '');
        if (!t || t === '-' ) { return null; }
        if (t.indexOf(',') >= 0) { t = t.replace(/\./g, '').replace(',', '.'); }
        var n = parseFloat(t);
        return isNaN(n) ? null : n;
    }

    function chave(d) { return 'boletim_pcj:' + d; }

    function salvar() {
        if (!estado) { return; }
        estado.salvoEm = new Date().toISOString();
        try {
            localStorage.setItem(chave(estado.data), JSON.stringify(estado));
            return true;
        } catch (e) {
            // imagem muito grande para o armazenamento do navegador: salva sem ela
            try {
                var copia = JSON.parse(JSON.stringify(estado));
                copia.imagens = {};
                localStorage.setItem(chave(estado.data), JSON.stringify(copia));
                avisar('Rascunho salvo, mas a imagem é grande demais para ficar guardada — escolha-a de novo se recarregar a página.', true);
            } catch (e2) { /* armazenamento indisponível */ }
            return false;
        }
    }

    var temporizador = null;
    function salvarDepois() {
        clearTimeout(temporizador);
        temporizador = setTimeout(function () {
            if (salvar()) { avisar('Edições salvas neste navegador às ' + new Date().toLocaleTimeString('pt-BR').slice(0, 5) + '.'); }
        }, 600);
    }

    function lerRascunho(d) {
        try {
            var t = localStorage.getItem(chave(d));
            return t ? JSON.parse(t) : null;
        } catch (e) { return null; }
    }

    // ---------------------------------------------------------------- cálculos
    function relacao(v, ref) { // → "65,09 % Abaixo"
        if (v === null || ref === null || v === undefined || ref === undefined || !ref) { return '*'; }
        var r = v / ref;
        return num(Math.abs(r - 1) * 100, 2) + ' % ' + (r >= 1 ? 'Acima' : 'Abaixo');
    }

    function pctChuva(c) {
        if (c.mes === null || c.mes === undefined) { return '*'; }
        if (c.recente || c.media === null || c.media === undefined || !c.media) { return '***'; }
        return num(c.mes / c.media * 100, 1) + '%';
    }

    function classeNivel(n, cotas) {
        if (n === null || n === undefined) { return ''; }
        if (!cotas) { return 'n-normal'; }
        if (cotas.extravasamento !== null && n >= cotas.extravasamento) { return 'n-extra'; }
        if (cotas.emergencia !== null && n >= cotas.emergencia) { return 'n-emerg'; }
        if (cotas.alerta !== null && n >= cotas.alerta) { return 'n-alerta'; }
        if (cotas.atencao !== null && n >= cotas.atencao) { return 'n-atencao'; }
        return 'n-normal';
    }

    // ---------------------------------------------------------------- células
    function celulaValor(grupo, i, campo, v, casas) {
        return el('td', { classe: 'num', contenteditable: 'true', 'data-k': grupo + '|' + i + '|' + campo, 'data-casas': casas, texto: num(v, casas) });
    }

    function celulaDerivada(grupo, i, campo, texto) {
        return el('td', { classe: 'num', contenteditable: 'true', 'data-d': grupo + '|' + i + '|' + campo, texto: texto });
    }

    function celulaPosto(p) {
        var td = el('td', { classe: 'posto', contenteditable: 'true' });
        td.appendChild(el('b', { texto: p.rio }));
        td.appendChild(document.createTextNode(p.local));
        return td;
    }

    function th(texto, attrs) {
        var a = attrs || {};
        a.texto = texto;
        return el('th', a);
    }

    // ---------------------------------------------------------------- tabelas
    function tabelaChuva() {
        var d = estado.dados;
        var tab = document.getElementById('tab-chuva');
        tab.textContent = '';
        var nMeses = d.meses_fechados.length;
        var mes = MESES[d.mes - 1];
        var ontem = new Date(d.data + 'T12:00:00');
        ontem.setDate(ontem.getDate() - 1);
        var dOntem = ontem.toISOString().slice(0, 10);
        var total = 6 + nMeses;

        var thead = el('thead');
        thead.appendChild(el('tr', {}, [th('Rede telemétrica do SAISP', { colspan: total })]));
        var l2 = el('tr', {}, [th('Nomenclatura no mapa', { rowspan: 2 }), th('Postos', { rowspan: 2 })]);
        if (nMeses) { l2.appendChild(th(String(d.ano), { colspan: nMeses })); }
        l2.appendChild(th('Chuva acumulada das 7h de ' + br(dOntem) + ' às 7h de ' + br(d.data) + ' (mm)', { rowspan: 2 }));
        l2.appendChild(th('Chuva acumulada em ' + mes + ' (até ' + br(d.data) + ' 7h00min) (mm)', { rowspan: 2 }));
        l2.appendChild(th('Chuva média mensal de ' + mes + ' (mm)', { rowspan: 2 }));
        l2.appendChild(th('Quantidade de chuva em relação à média (%)', { rowspan: 2 }));
        thead.appendChild(l2);
        var l3 = el('tr');
        d.meses_fechados.forEach(function (m) { l3.appendChild(th(MESES[m - 1])); });
        thead.appendChild(l3);
        tab.appendChild(thead);

        var tbody = el('tbody');
        d.chuva.forEach(function (c, i) {
            var tr = el('tr', {}, [el('td', { classe: 'mapa', contenteditable: 'true', texto: c.mapa }), celulaPosto(c)]);
            c.meses.forEach(function (v, m) { tr.appendChild(celulaValor('chuva', i, 'meses.' + m, v, 2)); });
            tr.appendChild(celulaValor('chuva', i, 'h24', c.h24, 2));
            tr.appendChild(celulaValor('chuva', i, 'mes', c.mes, 2));
            tr.appendChild(celulaValor('chuva', i, 'media', c.media, 2));
            tr.appendChild(celulaDerivada('chuva', i, 'pct', pctChuva(c)));
            tbody.appendChild(tr);
        });
        tab.appendChild(tbody);
    }

    function tabelaCotas() {
        var d = estado.dados;
        var tab = document.getElementById('tab-cotas');
        tab.textContent = '';
        var thead = el('thead');
        thead.appendChild(el('tr', {}, [th('REDE TELEMÉTRICA SP-ÁGUAS', { colspan: 7, classe: 'titulo-rede' })]));
        thead.appendChild(el('tr', {}, [th('Nomenclatura no mapa', { rowspan: 2 }), th('Posto de medição', { rowspan: 2 }), th('Código Posto', { rowspan: 2 }), th('Cotas de Alerta', { colspan: 4 })]));
        thead.appendChild(el('tr', {}, [th('Atenção', { classe: 'c-atencao' }), th('Alerta', { classe: 'c-alerta' }), th('Emergência', { classe: 'c-emerg' }), th('Extravasamento', { classe: 'c-extra' })]));
        tab.appendChild(thead);
        var tbody = el('tbody');
        d.cotas.forEach(function (c, i) {
            var tr = el('tr', {}, [
                el('td', { classe: 'mapa', contenteditable: 'true', texto: c.mapa }),
                el('td', { classe: 'nome', contenteditable: 'true', texto: c.nome }),
                el('td', { classe: 'cod', contenteditable: 'true', texto: c.codigo })
            ]);
            ['atencao', 'alerta', 'emergencia', 'extravasamento'].forEach(function (k) {
                var td = celulaValor('cotas', i, k, c[k], 3);
                if (c[k] === null || c[k] === undefined) { td.textContent = '-'; }
                if (c.orto) { td.classList.add('orto'); }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        tab.appendChild(tbody);
    }

    function tabelaFlu() {
        var d = estado.dados;
        var tab = document.getElementById('tab-flu');
        tab.textContent = '';
        var mes = MESES[d.mes - 1];
        var hoje = br(d.data), ant = br(d.data_ano_anterior);
        var hc = brCurta(d.data), ac = brCurta(d.data_ano_anterior);
        var thead = el('thead');
        thead.appendChild(el('tr', {}, [th('REDE TELEMÉTRICA DAEE/SP', { colspan: 14, classe: 'titulo-rede' })]));
        thead.appendChild(el('tr', {}, [th(hoje, { colspan: 6, classe: 'sub' }), th('Vazão (Q)', { colspan: 4, classe: 'grupo-q' }), th('Nível (Flu)', { colspan: 4, classe: 'grupo-n' })]));
        var l3 = el('tr', {}, [
            th('Nomenclatura no mapa', { rowspan: 2, classe: 'sub' }), th('Posto de medição | local', { rowspan: 2, classe: 'sub' }),
            th('Código do Posto', { rowspan: 2, classe: 'sub' }),
            th('Vazão Média do Mês Atual', { classe: 'sub' }), th('Vazão do rio ' + hoje + ' 07 h', { classe: 'sub' }), th('Nível do rio ' + hoje + ' 07 h', { classe: 'sub' }),
            th('Vazão Média Histórica de ' + mes, { classe: 'sub' }), th('Vazão 7h/Vazão média', { classe: 'sub' }),
            th('Vazão ' + ant + ' 07h', { classe: 'sub' }), th('Relação Q (' + hc + ') 7h / Q (' + ac + ') 7h', { classe: 'sub' }),
            th('Nível Médio Histórico de ' + mes, { classe: 'sub' }), th('Nível 7h/ Nível médio', { classe: 'sub' }),
            th('Nível ' + ant + ' 07h', { classe: 'sub' }), th('Relação Flu (' + hc + ') 7h / Flu (' + ac + ') 7h', { classe: 'sub' })
        ]);
        thead.appendChild(l3);
        thead.appendChild(el('tr', {}, ['(m³/s)', '(m³/s)', '(m)', '(m³/s)', '%', '(m³/s)', '%', '(m)', '%', '(m)', '%'].map(function (u) { return th(u, { classe: 'sub' }); })));
        tab.appendChild(thead);

        var tbody = el('tbody');
        d.fluviometria.forEach(function (f, i) {
            var tr = el('tr', {}, [el('td', { classe: 'mapa', contenteditable: 'true', texto: f.mapa }), celulaPosto(f), el('td', { contenteditable: 'true', texto: f.codigo })]);
            tr.appendChild(celulaValor('flu', i, 'vazao_mes', f.vazao_mes, 2));
            tr.appendChild(celulaValor('flu', i, 'vazao_7h', f.vazao_7h, 2));
            tr.appendChild(celulaValor('flu', i, 'nivel_7h', f.nivel_7h, 2));
            tr.appendChild(celulaValor('flu', i, 'vazao_media', f.vazao_media, 2));
            tr.appendChild(celulaDerivada('flu', i, 'rq', relacao(f.vazao_7h, f.vazao_media)));
            tr.appendChild(celulaValor('flu', i, 'vazao_ano_ant', f.vazao_ano_ant, 2));
            tr.appendChild(celulaDerivada('flu', i, 'rq_ant', relacao(f.vazao_7h, f.vazao_ano_ant)));
            tr.appendChild(celulaValor('flu', i, 'nivel_medio', f.nivel_medio, 2));
            tr.appendChild(celulaDerivada('flu', i, 'rn', relacao(f.nivel_7h, f.nivel_medio)));
            tr.appendChild(celulaValor('flu', i, 'nivel_ano_ant', f.nivel_ano_ant, 2));
            tr.appendChild(celulaDerivada('flu', i, 'rn_ant', relacao(f.nivel_7h, f.nivel_ano_ant)));
            tbody.appendChild(tr);
        });
        tab.appendChild(tbody);
        estado.dados.fluviometria.forEach(function (f, i) { colorirNiveis(i); });
    }

    function colorirNiveis(i) {
        var f = estado.dados.fluviometria[i];
        ['nivel_7h', 'nivel_ano_ant'].forEach(function (k) {
            var td = document.querySelector('[data-k="flu|' + i + '|' + k + '"]');
            if (!td) { return; }
            td.classList.remove('n-normal', 'n-atencao', 'n-alerta', 'n-emerg', 'n-extra');
            var c = classeNivel(f[k], f.cotas);
            if (c) { td.classList.add(c); }
        });
    }

    /** Recalcula as colunas derivadas de uma linha depois de uma edição. */
    function recalcular(grupo, i) {
        var d = estado.dados;
        function por(campo, texto) {
            var td = document.querySelector('[data-d="' + grupo + '|' + i + '|' + campo + '"]');
            if (td) { td.textContent = texto; }
        }
        if (grupo === 'chuva') {
            por('pct', pctChuva(d.chuva[i]));
        } else if (grupo === 'flu') {
            var f = d.fluviometria[i];
            por('rq', relacao(f.vazao_7h, f.vazao_media));
            por('rq_ant', relacao(f.vazao_7h, f.vazao_ano_ant));
            por('rn', relacao(f.nivel_7h, f.nivel_medio));
            por('rn_ant', relacao(f.nivel_7h, f.nivel_ano_ant));
            colorirNiveis(i);
        }
    }

    // ---------------------------------------------------------------- textos
    function aplicarTextos() {
        document.querySelectorAll('[data-texto]').forEach(function (e) {
            var id = e.dataset.texto;
            if (e.dataset.inicial === undefined) { e.dataset.inicial = e.innerHTML; }
            if (estado.textos[id] !== undefined) {
                e.innerText = estado.textos[id];
            } else if (e.dataset.padrao) {
                e.textContent = e.dataset.padrao.replace('{data}', br(estado.data));
            } else {
                e.innerHTML = e.dataset.inicial;
            }
        });
    }

    // ---------------------------------------------------------------- imagens
    function aplicarImagens() {
        document.querySelectorAll('[data-imagem]').forEach(function (bloco) {
            var img = bloco.querySelector('img');
            var vazio = bloco.querySelector('.vazio');
            var src = estado.imagens[bloco.dataset.imagem] || img.dataset.original || '';
            if (src) { img.src = src; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
            if (vazio) { vazio.hidden = !!src; }
        });
    }

    document.querySelectorAll('[data-imagem] input[type=file]').forEach(function (inp) {
        inp.addEventListener('change', function () {
            var arq = inp.files && inp.files[0];
            if (!arq || !estado) { return; }
            var leitor = new FileReader();
            leitor.onload = function () {
                estado.imagens[inp.closest('[data-imagem]').dataset.imagem] = leitor.result;
                aplicarImagens();
                salvarDepois();
            };
            leitor.readAsDataURL(arq);
            inp.value = '';
        });
    });

    // ---------------------------------------------------------------- montagem
    function montar() {
        document.title = 'SSPCJ_BoletimDiario_' + estado.data.replace(/-/g, '');
        tabelaChuva();
        tabelaCotas();
        tabelaFlu();
        aplicarTextos();
        aplicarImagens();
    }

    function carregarDoSibh() {
        var d = campoData.value || corpo.dataset.hoje;
        var botao = document.getElementById('btn-carregar');
        botao.disabled = true;
        avisar('Consultando o SIBH… (a primeira consulta do dia pode levar até 1 minuto)');
        fetch(URL_DADOS + '?data=' + encodeURIComponent(d), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (j) {
                    if (!r.ok) { throw new Error(j.erro || ('HTTP ' + r.status)); }
                    return j;
                });
            })
            .then(function (j) {
                var anterior = estado && estado.data === j.data ? estado : lerRascunho(j.data);
                estado = { data: j.data, dados: j, textos: anterior ? anterior.textos || {} : {}, imagens: anterior ? anterior.imagens || {} : {} };
                montar();
                salvar();
                var falhas = (j.avisos || []).length;
                avisar(falhas
                    ? 'Dados carregados, mas ' + falhas + ' consulta(s) do SIBH falharam — os campos sem dado aparecem com * (confira ou preencha à mão).'
                    : 'Dados do SIBH carregados (' + (j.tempo_ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' s).', falhas > 0);
            })
            .catch(function (e) {
                avisar('Falha ao consultar o SIBH: ' + e.message + '. Tente de novo em instantes.', true);
            })
            .then(function () { botao.disabled = false; });
    }

    function abrirData(d) {
        var r = lerRascunho(d);
        if (r && r.dados) {
            estado = r;
            estado.textos = estado.textos || {};
            estado.imagens = estado.imagens || {};
            montar();
            avisar('Rascunho deste dia salvo em ' + new Date(r.salvoEm).toLocaleString('pt-BR').slice(0, 17) + '. Use "Carregar dados do SIBH" para atualizar.');
        } else {
            carregarDoSibh();
        }
    }

    // ---------------------------------------------------------------- edição
    document.getElementById('boletim').addEventListener('input', function (ev) {
        if (!estado) { return; }
        var alvo = ev.target.closest('[data-k], [data-texto]');
        if (!alvo) { salvarDepois(); return; }
        if (alvo.dataset.texto) {
            estado.textos[alvo.dataset.texto] = alvo.innerText;
        } else {
            var p = alvo.dataset.k.split('|');
            var grupo = p[0], i = +p[1], campo = p[2];
            var linha = grupo === 'chuva' ? estado.dados.chuva[i] : grupo === 'flu' ? estado.dados.fluviometria[i] : estado.dados.cotas[i];
            var v = lerNumero(alvo.textContent);
            if (campo.indexOf('meses.') === 0) { linha.meses[+campo.split('.')[1]] = v; } else { linha[campo] = v; }
            if (grupo === 'cotas') { sincronizarCotas(linha); }
            recalcular(grupo, i);
        }
        salvarDepois();
    });

    /** Cota editada na tabela de cotas → vale também para as cores da tabela de nível. */
    function sincronizarCotas(linhaCota) {
        estado.dados.fluviometria.forEach(function (f, i) {
            if (f.mapa === linhaCota.mapa || (linhaCota.mapa === '122' && f.mapa === '607')) {
                f.cotas = { atencao: linhaCota.atencao, alerta: linhaCota.alerta, emergencia: linhaCota.emergencia, extravasamento: linhaCota.extravasamento };
                colorirNiveis(i);
            }
        });
    }

    // Ao sair da célula, mostra o número no formato do boletim.
    document.getElementById('boletim').addEventListener('focusout', function (ev) {
        var td = ev.target.closest && ev.target.closest('[data-k]');
        if (!td || !estado) { return; }
        var v = lerNumero(td.textContent);
        td.textContent = v === null ? (td.textContent.trim() === '-' ? '-' : '*') : num(v, +td.dataset.casas);
    });

    // Colar sempre como texto simples.
    document.getElementById('boletim').addEventListener('paste', function (ev) {
        if (!ev.target.closest('[contenteditable="true"]')) { return; }
        ev.preventDefault();
        var t = (ev.clipboardData || window.clipboardData).getData('text');
        document.execCommand('insertText', false, t);
    });

    // ---------------------------------------------------------------- botões
    document.getElementById('btn-carregar').addEventListener('click', function () {
        if (estado && estado.data === campoData.value && !confirm('Recarregar os dados do SIBH? Os valores editados nas tabelas serão substituídos (textos e imagens continuam).')) { return; }
        carregarDoSibh();
    });

    campoData.addEventListener('change', function () { if (campoData.value) { abrirData(campoData.value); } });

    document.getElementById('btn-limpar').addEventListener('click', function () {
        if (!estado || !confirm('Descartar todas as edições deste dia (tabelas, textos e imagens) e carregar de novo do SIBH?')) { return; }
        try { localStorage.removeItem(chave(estado.data)); } catch (e) { /* nada */ }
        estado = null;
        carregarDoSibh();
    });

    document.getElementById('btn-pdf').addEventListener('click', function () {
        if (document.activeElement) { document.activeElement.blur(); }
        window.print();
    });

    document.getElementById('btn-medias').addEventListener('click', function () {
        if (!estado) { return; }
        var d = estado.dados;
        var corpoMedias = { mes: d.mes, chuva: {}, vazao: {}, nivel: {} };
        d.chuva.forEach(function (c) { corpoMedias.chuva[c.mapa] = c.media; });
        d.fluviometria.forEach(function (f) { corpoMedias.vazao[f.mapa] = f.vazao_media; corpoMedias.nivel[f.mapa] = f.nivel_medio; });
        if (!confirm('Gravar as médias históricas de ' + MESES[d.mes - 1] + ' mostradas nas tabelas? Elas passam a valer para os próximos boletins deste mês.')) { return; }
        fetch(URL_MEDIAS, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': TOKEN },
            body: JSON.stringify(corpoMedias)
        })
            .then(function (r) { return r.json().then(function (j) { if (!r.ok) { throw new Error(j.erro || ('HTTP ' + r.status)); } return j; }); })
            .then(function (j) { avisar(j.alterados ? 'Médias de ' + MESES[d.mes - 1] + ' gravadas (' + j.alterados + ' valor(es)).' : 'As médias já estavam iguais — nada a gravar.'); })
            .catch(function (e) { avisar('Não foi possível gravar as médias: ' + e.message, true); });
    });

    abrirData(campoData.value || corpo.dataset.hoje);
})();
