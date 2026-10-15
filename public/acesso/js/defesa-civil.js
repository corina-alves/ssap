/* Defesa Civil: "Copiar texto" e "Abrir no WhatsApp" de cada UGRHI. */
(function () {
    'use strict';
    // Abre o WhatsApp (app ou web) com a mensagem já escrita — usa o texto como estiver na caixa (com as edições).
    document.querySelectorAll('[data-whatsapp]').forEach(function (botao) {
        botao.addEventListener('click', function () {
            var campo = document.getElementById(botao.dataset.whatsapp);
            window.open('https://wa.me/?text=' + encodeURIComponent(campo.value), '_blank', 'noopener');
        });
    });
    document.querySelectorAll('[data-copiar]').forEach(function (botao) {
        botao.addEventListener('click', function () {
            var campo = document.getElementById(botao.dataset.copiar);
            var aviso = document.querySelector('[data-copiado-de="' + botao.dataset.copiar + '"]');
            var feito = function () {
                if (!aviso) return;
                aviso.hidden = false;
                setTimeout(function () { aviso.hidden = true; }, 2000);
            };
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(campo.value).then(feito);
            } else {
                campo.select();
                document.execCommand('copy');
                feito();
            }
        });
    });
})();
