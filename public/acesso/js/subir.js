/* Botão "voltar ao topo" das páginas avulsas de boletim (não sai na impressão). */
(function () {
    'use strict';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'subir no-print';
    b.setAttribute('aria-label', 'Voltar ao topo');
    b.title = 'Voltar ao topo';
    b.textContent = '\u2191';
    b.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.body.appendChild(b);
    function olhar() { b.classList.toggle('subir--visivel', window.scrollY > 400); }
    window.addEventListener('scroll', olhar, { passive: true });
    olhar();
})();
