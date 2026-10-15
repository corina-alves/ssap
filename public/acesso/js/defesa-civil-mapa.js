/* Defesa Civil — mapa de cada UGRHI (Leaflet local) e a imagem para enviar pelo WhatsApp.
   <div class="dc-mapa" id="mapa-6" data-dc-mapa='{"ugrhi":6,"titulo":"","subtitulo":"","limite":{GeoJSON},
        "chuva":[{p,n,c,lat,lng,v}],"estacoes":[{t:"plu|flu",p,n,c,lat,lng,s}],"arquivo":"","mensagem":"zap-6"}'>
   <button data-dc-enviar="mapa-6">  imagem do mapa + texto da caixa "mensagem" → WhatsApp
   <button data-dc-baixar="mapa-6">  baixa a imagem do mapa (JPG — bem menor que PNG para o WhatsApp)
   A imagem é desenhada num <canvas>: mapa de fundo (Esri World Topo Map, com CORS), limite da UGRHI,
   estações, chuva, título, legenda e fonte. As divisas das regionais da Defesa Civil
   (geo/regionais_defesa_civil_linhas.json) entram tracejadas, com o nome de cada regional. */
(function () {
    'use strict';
    if (!window.L) return;

    var numBR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    var COR_LIMITE = '#0a4677';
    var COR_REGIONAL = '#7a2e8e';
    var COR_PLU = '#2e9e4f';
    var COR_SITUACAO = { extravasamento: '#d0021b', emergencia: '#b0009e', alerta: '#e67e00', atencao: '#c9a800', normal: '#2e9e4f' };
    var COR_FLU_SEM_COTA = '#5b6b7b';
    var ROTULO_SITUACAO = { extravasamento: 'Extravasamento', emergencia: 'Emergência', alerta: 'Alerta', atencao: 'Atenção', normal: 'Normal' };
    // Classes de chuva (mm): [a partir de, cor, rótulo]
    var CLASSES_CHUVA = [
        [120, '#d81b60', 'acima de 120 mm'],
        [80, '#8e24aa', '80 a 120 mm'],
        [50, '#3949ab', '50 a 80 mm'],
        [25, '#1e88e5', '25 a 50 mm'],
        [10, '#4fc3f7', '10 a 25 mm']
    ];
    var MAX_ROTULOS = 15; // valores escritos ao lado dos maiores postos de chuva
    var mapas = {};
    var regionais = null; // { regionais: [{nome, centro:[lat,lng]}], linhas: [[[lat,lng]...]] }

    /** Divisas e nomes das regionais num mapa já montado. */
    function desenharRegionais(item) {
        if (!regionais || item.regionais) return;
        var mapa = item.mapa;
        item.regionais = L.layerGroup().addTo(mapa);
        regionais.linhas.forEach(function (l) {
            L.polyline(l, { pane: 'regionais', color: COR_REGIONAL, weight: 2, opacity: 0.9, dashArray: '6 5', interactive: false }).addTo(item.regionais);
        });
        regionais.regionais.forEach(function (r) {
            var rotulo = texto('span', 'dc-reg-ugrhi', r.nome);
            L.marker(r.centro, { pane: 'regionais', interactive: false, icon: L.divIcon({ className: 'dc-reg-icone', html: rotulo, iconSize: [0, 0] }) }).addTo(item.regionais);
        });
    }

    function corChuva(v) {
        for (var i = 0; i < CLASSES_CHUVA.length; i++) if (v >= CLASSES_CHUVA[i][0]) return CLASSES_CHUVA[i][1];
        return CLASSES_CHUVA[CLASSES_CHUVA.length - 1][1];
    }
    function raioChuva(v) { return 6 + Math.min(12, v / 10); }
    function corFlu(s) { return COR_SITUACAO[s] || COR_FLU_SEM_COTA; }
    function mm(v) { return numBR.format(v) + ' mm'; }

    function texto(tag, cls, conteudo) {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        if (conteudo !== undefined) el.textContent = conteudo;
        return el;
    }
    function popup(linhas) {
        var div = texto('div', 'dc-popup');
        linhas.forEach(function (l, i) { div.appendChild(texto(i ? 'div' : 'strong', '', l)); });
        return div;
    }

    // ------------------------------------------------------------ mapa na tela
    function montar(el) {
        var cfg = JSON.parse(el.getAttribute('data-dc-mapa'));
        var mapa = L.map(el, { zoomSnap: 0.25, attributionControl: true });
        // Esri World Topo Map: sem chave e com CORS (o OpenStreetMap bloqueia sem "Referer", e a área acesso/ não envia)
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 18, crossOrigin: true,
            attribution: 'Base: &copy; Esri, HERE, Garmin, USGS, colaboradores do OpenStreetMap'
        }).addTo(mapa);
        mapa.attributionControl.setPrefix('Leaflet');
        mapa.createPane('regionais').style.zIndex = 450; // divisas das regionais: acima do limite, abaixo dos marcadores
        mapa.createPane('chuva').style.zIndex = 650; // chuva acima das estações
        mapa.createPane('rotulos').style.zIndex = 660;

        var limite = L.geoJSON(cfg.limite, { style: { color: COR_LIMITE, weight: 2.5, fillColor: COR_LIMITE, fillOpacity: 0.06 } }).addTo(mapa);
        mapa.fitBounds(limite.getBounds(), { padding: [12, 12] });

        cfg.estacoes.filter(function (e) { return e.t === 'plu'; }).forEach(function (e) {
            L.circleMarker([e.lat, e.lng], { radius: 3, color: '#fff', weight: 1, fillColor: COR_PLU, fillOpacity: 0.9 })
                .bindPopup(popup([e.p + ' — ' + e.n, e.c, 'Pluviométrica telemétrica'])).addTo(mapa);
        });
        cfg.estacoes.filter(function (e) { return e.t === 'flu'; }).forEach(function (e) {
            var icone = L.divIcon({ className: 'dc-mk-flu dc-mk-flu--' + (e.s || 'sem-cota'), iconSize: [13, 12] });
            L.marker([e.lat, e.lng], { icon: icone, zIndexOffset: 500 })
                .bindPopup(popup([e.p + ' — ' + e.n, e.c, 'Fluviométrica telemétrica' + (e.s ? ' · ' + ROTULO_SITUACAO[e.s] : '')])).addTo(mapa);
        });
        // chuva por cima, a maior por último (fica visível)
        cfg.chuva.slice().reverse().forEach(function (c) {
            var m = L.circleMarker([c.lat, c.lng], { pane: 'chuva', radius: raioChuva(c.v), color: '#fff', weight: 1.5, fillColor: corChuva(c.v), fillOpacity: 0.88 })
                .bindPopup(popup([mm(c.v), c.p + ' — ' + c.n, c.c])).addTo(mapa);
            if (cfg.chuva.indexOf(c) < MAX_ROTULOS) {
                m.bindTooltip(numBR.format(c.v), { pane: 'rotulos', permanent: true, direction: 'right', offset: [raioChuva(c.v), 0], className: 'dc-rotulo' });
            }
        });

        mapas[el.id] = { mapa: mapa, cfg: cfg, legenda: legenda(cfg).addTo(mapa) };
        desenharRegionais(mapas[el.id]);
    }

    function itensLegenda(cfg) {
        var itens = [];
        var temChuva = {};
        cfg.chuva.forEach(function (c) { temChuva[corChuva(c.v)] = true; });
        CLASSES_CHUVA.slice().reverse().forEach(function (k) { if (temChuva[k[1]]) itens.push({ forma: 'circulo', cor: k[1], rotulo: 'Chuva ' + k[2] }); });
        if (!cfg.chuva.length) itens.push({ forma: 'nada', rotulo: 'Sem chuva acima de 10 mm' });
        if (cfg.estacoes.some(function (e) { return e.t === 'plu'; })) itens.push({ forma: 'ponto', cor: COR_PLU, rotulo: 'Pluviométrica telemétrica' });
        var sit = {};
        cfg.estacoes.forEach(function (e) { if (e.t === 'flu') sit[e.s || ''] = true; });
        Object.keys(ROTULO_SITUACAO).forEach(function (s) { if (sit[s]) itens.push({ forma: 'triangulo', cor: COR_SITUACAO[s], classe: s, rotulo: 'Fluviométrica — ' + ROTULO_SITUACAO[s].toLowerCase() }); });
        if (sit['']) itens.push({ forma: 'triangulo', cor: COR_FLU_SEM_COTA, classe: 'sem-cota', rotulo: 'Fluviométrica (sem cota)' });
        if (regionais) itens.push({ forma: 'tracejado', cor: COR_REGIONAL, rotulo: 'Regionais da Defesa Civil' });
        return itens;
    }

    function legenda(cfg) {
        var ctl = L.control({ position: 'bottomleft' });
        ctl.onAdd = function () {
            var div = texto('div', 'dc-legenda');
            itensLegenda(cfg).forEach(function (i) {
                var linha = texto('div', 'dc-legenda__item');
                var simbolo = i.forma === 'triangulo' ? texto('span', 'dc-mk-flu dc-mk-flu--' + i.classe)
                    : texto('span', 'dc-legenda__simbolo dc-legenda__simbolo--' + i.forma);
                if (i.cor && i.forma !== 'triangulo' && i.forma !== 'tracejado') simbolo.style.backgroundColor = i.cor;
                linha.appendChild(simbolo);
                linha.appendChild(texto('span', '', i.rotulo));
                div.appendChild(linha);
            });
            L.DomEvent.disableClickPropagation(div);
            return div;
        };
        return ctl;
    }

    // ------------------------------------------------------------ imagem (PNG)
    var CAB = 64, ROD = 26, ESCALA = 2;

    function triangulo(ctx, x, y, t) {
        ctx.beginPath();
        ctx.moveTo(x, y - t * 0.6);
        ctx.lineTo(x + t * 0.55, y + t * 0.45);
        ctx.lineTo(x - t * 0.55, y + t * 0.45);
        ctx.closePath();
    }

    /** Desenha a imagem do mapa. tipo: 'image/jpeg' (enviar/baixar) ou 'image/png' (área de transferência). */
    function desenhar(id, tipo) {
        var item = mapas[id];
        var mapa = item.mapa, cfg = item.cfg;
        var tam = mapa.getSize();
        var canvas = document.createElement('canvas');
        canvas.width = tam.x * ESCALA;
        canvas.height = (tam.y + CAB + ROD) * ESCALA;
        var ctx = canvas.getContext('2d');
        ctx.scale(ESCALA, ESCALA);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, tam.x, tam.y + CAB + ROD);

        // cabeçalho
        ctx.fillStyle = COR_LIMITE;
        ctx.font = 'bold 19px system-ui, Segoe UI, Arial, sans-serif';
        ctx.fillText(cfg.titulo, 14, 27);
        ctx.fillStyle = '#3d4b59';
        ctx.font = '13px system-ui, Segoe UI, Arial, sans-serif';
        ctx.fillText(cfg.subtitulo, 14, 49);

        // área do mapa
        ctx.save();
        ctx.translate(0, CAB);
        ctx.beginPath();
        ctx.rect(0, 0, tam.x, tam.y);
        ctx.clip();
        var caixa = mapa.getContainer().getBoundingClientRect();
        mapa.getContainer().querySelectorAll('.leaflet-tile-pane img.leaflet-tile-loaded').forEach(function (img) {
            var r = img.getBoundingClientRect();
            ctx.drawImage(img, r.left - caixa.left, r.top - caixa.top, r.width, r.height);
        });
        var pt = function (lat, lng) { return mapa.latLngToContainerPoint([lat, lng]); };

        // limite da UGRHI
        var poligonos = cfg.limite.type === 'Polygon' ? [cfg.limite.coordinates] : cfg.limite.coordinates;
        ctx.beginPath();
        poligonos.forEach(function (aneis) {
            aneis.forEach(function (anel) {
                anel.forEach(function (c, i) { var p = pt(c[1], c[0]); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
                ctx.closePath();
            });
        });
        ctx.fillStyle = 'rgba(10, 70, 119, 0.06)';
        ctx.fill('evenodd');
        ctx.strokeStyle = COR_LIMITE;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // regionais da Defesa Civil: divisas tracejadas e nomes
        if (regionais) {
            ctx.save();
            ctx.strokeStyle = COR_REGIONAL; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
            regionais.linhas.forEach(function (l) {
                ctx.beginPath();
                l.forEach(function (c, i) { var p = pt(c[0], c[1]); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
                ctx.stroke();
            });
            ctx.setLineDash([]);
            ctx.font = 'bold 12px system-ui, Segoe UI, Arial, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            regionais.regionais.forEach(function (r) {
                var p = pt(r.centro[0], r.centro[1]);
                if (p.x < 0 || p.y < 0 || p.x > tam.x || p.y > tam.y) return;
                ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(r.nome, p.x, p.y);
                ctx.fillStyle = COR_REGIONAL; ctx.fillText(r.nome, p.x, p.y);
            });
            ctx.restore();
        }

        // estações
        cfg.estacoes.forEach(function (e) {
            if (e.t !== 'plu') return;
            var p = pt(e.lat, e.lng);
            ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
            ctx.fillStyle = COR_PLU; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        });
        cfg.estacoes.forEach(function (e) {
            if (e.t !== 'flu') return;
            var p = pt(e.lat, e.lng);
            triangulo(ctx, p.x, p.y, 12);
            ctx.fillStyle = corFlu(e.s); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
        });
        // chuva (maior por cima) e valores
        cfg.chuva.slice().reverse().forEach(function (c) {
            var p = pt(c.lat, c.lng);
            ctx.beginPath(); ctx.arc(p.x, p.y, raioChuva(c.v), 0, 2 * Math.PI);
            ctx.globalAlpha = 0.88; ctx.fillStyle = corChuva(c.v); ctx.fill(); ctx.globalAlpha = 1;
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        });
        ctx.font = 'bold 12px system-ui, Segoe UI, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        cfg.chuva.slice(0, MAX_ROTULOS).forEach(function (c) {
            var p = pt(c.lat, c.lng);
            var x = p.x + raioChuva(c.v) + 3;
            ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(numBR.format(c.v), x, p.y);
            ctx.fillStyle = '#1b2733'; ctx.fillText(numBR.format(c.v), x, p.y);
        });

        // legenda (canto inferior esquerdo)
        var itens = itensLegenda(cfg);
        ctx.font = '12px system-ui, Segoe UI, Arial, sans-serif';
        var larg = 0;
        itens.forEach(function (i) { larg = Math.max(larg, ctx.measureText(i.rotulo).width); });
        var lh = 18, lw = larg + 40, lt = itens.length * lh + 12;
        var lx = 10, ly = tam.y - lt - 10;
        ctx.globalAlpha = 0.92; ctx.fillStyle = '#fff'; ctx.fillRect(lx, ly, lw, lt); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#c9d2db'; ctx.lineWidth = 1; ctx.strokeRect(lx, ly, lw, lt);
        itens.forEach(function (i, k) {
            var cy = ly + 6 + lh * k + lh / 2, cx = lx + 15;
            if (i.forma === 'circulo') { ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 2 * Math.PI); ctx.fillStyle = i.cor; ctx.fill(); }
            if (i.forma === 'ponto') { ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 2 * Math.PI); ctx.fillStyle = i.cor; ctx.fill(); }
            if (i.forma === 'triangulo') { triangulo(ctx, cx, cy, 12); ctx.fillStyle = i.cor; ctx.fill(); }
            if (i.forma === 'tracejado') {
                ctx.save(); ctx.strokeStyle = i.cor; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
                ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.stroke(); ctx.restore();
            }
            ctx.fillStyle = '#1b2733';
            ctx.fillText(i.rotulo, lx + 30, cy);
        });
        ctx.restore();

        // rodapé
        ctx.fillStyle = '#5b6b7b';
        ctx.font = '11px system-ui, Segoe UI, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('Fonte: SIBH — SP Águas · Limite das UGRHIs: DataGEO · Regionais: Defesa Civil · Mapa de fundo: © Esri', 14, CAB + tam.y + ROD / 2);

        return new Promise(function (ok, erro) {
            try {
                canvas.toBlob(function (b) { if (b) ok(b); else erro(new Error('vazio')); }, tipo || 'image/jpeg', 0.9);
            } catch (e) { erro(e); }
        });
    }

    function baixar(blob, nome) {
        var ext = blob.type === 'image/png' ? '.png' : '.jpg';
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nome + ext;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }

    function avisar(id, msg) {
        var el = document.querySelector('[data-dc-aviso="' + id + '"]');
        if (!el) return;
        el.textContent = msg;
        el.hidden = !msg;
    }

    var ERRO_IMAGEM = 'Não foi possível gerar a imagem do mapa (o mapa de fundo não carregou). Tente de novo em instantes.';

    document.querySelectorAll('[data-dc-mapa]').forEach(function (el) {
        try { montar(el); } catch (e) { el.textContent = 'Não foi possível montar o mapa.'; }
    });

    // As divisas chegam depois: entram nos mapas já montados e a legenda é refeita com o item delas.
    fetch('/acesso/geo/regionais_defesa_civil_linhas.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
            if (!d || !d.linhas) return;
            regionais = d;
            Object.keys(mapas).forEach(function (id) {
                var item = mapas[id];
                desenharRegionais(item);
                if (item.legenda) item.legenda.remove();
                item.legenda = legenda(item.cfg).addTo(item.mapa);
            });
        })
        .catch(function () { /* sem as divisas, o mapa segue como antes */ });

    document.querySelectorAll('[data-dc-baixar]').forEach(function (b) {
        b.addEventListener('click', function () {
            var id = b.getAttribute('data-dc-baixar');
            if (!mapas[id]) return;
            desenhar(id).then(function (blob) { baixar(blob, mapas[id].cfg.arquivo); avisar(id, ''); })
                .catch(function () { avisar(id, ERRO_IMAGEM); });
        });
    });

    // Enviar: no celular (e no Windows/Chrome/Edge) abre o "compartilhar" com a imagem e o texto
    // juntos — escolha o WhatsApp. Sem esse recurso: copia a imagem (ou baixa) e abre o WhatsApp
    // com o texto; aí é só colar a imagem (Ctrl+V) na conversa.
    document.querySelectorAll('[data-dc-enviar]').forEach(function (b) {
        b.addEventListener('click', function () {
            var id = b.getAttribute('data-dc-enviar');
            var item = mapas[id];
            if (!item) return;
            var caixa = document.getElementById(item.cfg.mensagem);
            var mensagem = caixa ? caixa.value : '';
            desenhar(id, 'image/jpeg').then(function (blob) {
                var arquivo = new File([blob], item.cfg.arquivo + '.jpg', { type: 'image/jpeg' });
                if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
                    return navigator.share({ files: [arquivo], text: mensagem }).then(function () { avisar(id, ''); }, function (e) {
                        if (e && e.name === 'AbortError') return;
                        return copiarEAbrir(id, blob, mensagem);
                    });
                }
                return copiarEAbrir(id, blob, mensagem);
            }).catch(function () { avisar(id, ERRO_IMAGEM); });
        });
    });

    // A área de transferência só aceita PNG: gera de novo nesse formato; se não der, baixa o JPG.
    function copiarEAbrir(id, jpg, mensagem) {
        var copiar = (navigator.clipboard && window.ClipboardItem && window.isSecureContext)
            ? navigator.clipboard.write([new window.ClipboardItem({ 'image/png': desenhar(id, 'image/png') })]).then(function () { return true; }, function () { return false; })
            : Promise.resolve(false);
        return copiar.then(function (copiou) {
            if (!copiou) baixar(jpg, mapas[id].cfg.arquivo);
            window.open('https://wa.me/?text=' + encodeURIComponent(mensagem), '_blank', 'noopener');
            avisar(id, copiou
                ? 'O mapa foi copiado. Na conversa do WhatsApp, cole com Ctrl+V para enviar a imagem junto com a mensagem.'
                : 'O mapa foi baixado (JPG). Na conversa do WhatsApp, anexe a imagem baixada junto com a mensagem.');
        });
    }
})();
