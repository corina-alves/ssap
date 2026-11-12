/**
 * Página "Previsão do tempo" do Boletim Diário PCJ: três imagens do Simepar
 * (chuva das últimas 24 h, amanhã e 3 a 7 dias), cada uma com o texto embaixo.
 * Tudo é preenchido na tela (imagem escolhida ou colada, textos editáveis) e fica
 * no rascunho do navegador, como a imagem do radar. Não vem do PHP: entra no
 * miolo capturado (src/conteudo/legado/boletim_pcj.ts) antes da contracapa.
 * Datas: {data} = data do boletim, {amanha} = dia seguinte, {d1} e {d6} = 1 e 6
 * dias depois (boletim.js, aplicarTextos).
 */

const cab = `<header class="cab"><span>Agência de Águas do Estado de São Paulo</span><img src="/acesso/boletim_pcj/img/logos-cabecalho.png" alt=""></header>`;

function coluna(n: number, imagem: string, rotulo: string, vazio: string) {
  return `    <div class="prev-col prev-col${n}">
        <div class="imagem-trocavel prev-img" data-imagem="previsao${n}" tabindex="0">
            <img alt="" hidden>
            <p class="vazio no-print">${imagem}<br>Clique em "Escolher imagem" ou clique aqui e cole (Ctrl+V).</p>
            <label class="no-print trocar">Escolher imagem <input type="file" accept="image/*"></label>
        </div>
        <p class="prev-texto">${rotulo ? `<b contenteditable="true" data-texto="prev_rotulo${n}" data-padrao="${rotulo}"></b> ` : ''}<span contenteditable="true" data-texto="prev_texto${n}" data-vazio="${vazio}"></span></p>
    </div>`;
}

const previsao = `<!-- Previsão do tempo (Simepar) -->
<section class="pagina previsao">
    ${cab}
    <h1 class="prev-titulo" contenteditable="true" data-texto="prev_titulo">PREVISÃO DO TEMPO</h1>
${coluna(1, 'Chuva acumulada nas últimas 24 h, até as 7h (Simepar).', '', 'Clique para escrever a previsão de hoje.')}
${coluna(2, 'Previsão de chuva para amanhã (Simepar).', 'Amanhã ({amanha}):', 'Clique para escrever a previsão de amanhã.')}
${coluna(3, 'Previsão de chuva de 3 a 7 dias (Simepar).', 'Previsão de 3 a 7 dias ({d1} a {d6}):', 'Clique para escrever a previsão de 3 a 7 dias.')}
    <p class="prev-fonte" contenteditable="true" data-texto="prev_fonte">Fonte: Simepar</p>
    <p class="prev-rodape" contenteditable="true" data-texto="prev_rodape">* Outras informações como previsão do tempo, meteogramas, gráficos de vazão e nível, podem ser encontrados no site da Sala de Situação PCJ.</p>
    <div class="rodape"></div>
</section>
`;

export default previsao;
