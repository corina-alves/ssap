/* Gráficos com dados do SSD (graficos/criar-ssd).
   <form data-ssd-catalogo='{"12":["Chuva|mm", ...]}'>
   - <select data-ssd-variavel-de="local1">: mostra só as variáveis que o local escolhido tem;
   - <select data-recarregar>: reenvia o formulário ao trocar;
   - <select data-periodo> + [data-datas]: as datas só aparecem em "Escolher as datas". */
(function () {
    'use strict';
    var form = document.querySelector('form[data-ssd-catalogo]');
    if (!form) return;
    var mapa = {};
    try { mapa = JSON.parse(form.getAttribute('data-ssd-catalogo')) || {}; } catch (e) { mapa = {}; }

    form.querySelectorAll('select[data-ssd-variavel-de]').forEach(function (sv) {
        var local = document.getElementById(sv.getAttribute('data-ssd-variavel-de'));
        if (!local) return;
        function filtrar() {
            var lista = mapa[local.value] || null;
            Array.prototype.forEach.call(sv.options, function (o) {
                var ok = o.value === '' || !lista || lista.indexOf(o.value) >= 0;
                o.hidden = !ok;
                o.disabled = !ok;
            });
            if (sv.selectedOptions.length && sv.selectedOptions[0].disabled) sv.value = '';
        }
        local.addEventListener('change', filtrar);
        filtrar();
    });

    form.querySelectorAll('select[data-recarregar]').forEach(function (s) {
        s.addEventListener('change', function () { form.submit(); });
    });

    var periodo = form.querySelector('select[data-periodo]');
    if (periodo) {
        var datas = form.querySelectorAll('[data-datas]');
        var alternar = function () {
            datas.forEach(function (d) { d.classList.toggle('d-none', periodo.value !== 'personalizado'); });
        };
        periodo.addEventListener('change', alternar);
        alternar();
    }
})();
