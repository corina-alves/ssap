/**
 * Conteúdo fixo do Boletim Mensal da Sala Alfredo Pisani (/acesso/boletim_mensal):
 * descrições dos sistemas produtores, textos de apoio e os slides que a equipe
 * completa (imagens e textos de fontes sem integração automática).
 * Textos copiados do boletim manual de outubro/2026.
 */

/** Descrição de cada sistema produtor (chave do SSD → texto do slide). */
export const DESCRICAO_SISTEMAS: Record<string, string> = {
  cantareira:
    'O Sistema Cantareira é composto pelo conjunto de reservatórios Jaguari-Jacareí, Cachoeira, Atibainha e Paiva Castro, conectados por túneis e canais que conduzem as águas até a Estação Elevatória de Santa Inês por gravidade (EEAB-Santa Inês). Nessa estação é feito o recalque para a Estação de Tratamento de Água do Guaraú. O sistema tem capacidade para abastecer cerca de 9 milhões de pessoas da RMSP. O Cantareira conta com um aporte de volumes do reservatório UHE Jaguari, localizada em afluente do rio Paraíba do Sul, até o reservatório Atibainha.',
  'alto-tiete':
    'O Sistema Alto Tietê é composto pelos reservatórios Ponte Nova, Paraitinga, Biritiba, Jundiaí e Taiaçupeba, conectados por canais, túneis, e estações elevatórias e adutoras. A água do sistema é captada na represa de Taiaçupeba e tratada na estação de tratamento de água de mesmo nome. O sistema abastece cerca de 4 milhões de pessoas na zona leste de São Paulo e nos municípios de Arujá, Itaquaquecetuba, Poá, Ferraz de Vasconcelos, Suzano, além de parte dos municípios de Mogi das Cruzes e de Guarulhos.',
  guarapiranga:
    'O Sistema Guarapiranga é composto pelo reservatório Guarapiranga. A água captada é recalcada para a Estação de Tratamento de Água do Alto da Boa Vista, responsável pelo abastecimento de grande parte das Zonas Sul e Sudoeste da Grande São Paulo. O reservatório Guarapiranga recebe vazões complementares do Braço do Rio Taquacetuba, da represa Billings, e do rio Capivari, da vertente litorânea - da bacia do rio Itanhaém.',
  cotia:
    'O Sistema Cotia é composto pelo conjunto de reservatórios Pedro Beicht, Cachoeira da Graça e Isolina. A água armazenada nos reservatórios Pedro Beicht e Cachoeira da Graça é direcionada à Estação de Tratamento de Água Alto Cotia, abastecendo os municípios de Cotia, Embu, Itapecerica da Serra, Embu-Guaçu e Vargem Grande. A água armazenada no reservatório Isolina pode ser captada e direcionada à Estação de Tratamento de Água Baixo Cotia, abastecendo a Zona Oeste da RMSP, nas regiões de Barueri, Jandira e Itapevi.',
  'rio-grande':
    'O Sistema Rio Grande é composto pelo reservatório do Braço do Rio Grande, isolado da represa Billings pelo dique da Via Anchieta. No reservatório é realizada a captação e o recalque para a Estação de Tratamento de Água Rio Grande, para abastecimento de São Bernardo do Campo, Santo André e Diadema. O Rio Grande recebe volumes ocasionais do Braço do Rio Pequeno/Billings, pela Estação Elevatória do Rio Pequeno, e, por meio da Estação Elevatória do Rio Grande, viabiliza a transposição de vazões suplementares para o reservatório de Taiaçupeba, componente do SPAT – Sistema Produtor Alto Tietê.',
  'rio-claro':
    'O Sistema Rio Claro é composto pelo reservatório Ribeirão do Campo, além de receber água proveniente da transposição do rio Guaratuba, da vertente marítima. A água captada é encaminhada para a Estação de Tratamento de Água Casa Grande, e abastece parte da zona leste de São Paulo e o município de Santo André.',
  'sao-lourenco':
    'O Sistema São Lourenço é composto pela captação da Sabesp no reservatório da UHE Cachoeira do França, da CBA, no rio Juquiá, bacia do rio Ribeira de Iguape, de onde a água é recalcada para a Estação de Tratamento de Água Vargem Grande. O sistema abastece sete municípios da zona oeste da Grande São Paulo: Carapicuíba, Barueri, Jandira, Itapevi, Cotia, Vargem Grande Paulista e Santana do Parnaíba.',
  sim: 'O Sistema Integrado da Região Metropolitana (SIM) é composto por sete Sistemas Produtores: Sistema Cantareira, Sistema Alto Tietê, Sistema Guarapiranga, Sistema Rio Grande, Sistema Rio Claro, Sistema São Lourenço e Sistema Cotia.',
};

export const OBSERVACAO_VAZOES = 'Observações: Vazão afluente: total (inclui transposições); Vazão defluente: total (inclui descargas, captações e transposições).';

export const TEXTO_PROTOCOLO = [
  'O mapa apresenta o enquadramento das subUGRHIs no Protocolo de Escassez Hídrica da SP Águas, elaborado com base em indicadores hidrometeorológicos, como chuva, volume útil dos reservatórios, duração da seca e evapotranspiração, considerando o mês e o ano de referência.',
  'Ressalta-se que este Protocolo é um experimento regulatório com duração de dois anos que está em constante aprimoramento. O objetivo é apoiar na gestão dos recursos hídricos, indicando situações em que podem ser necessárias medidas de contingência para mitigar os efeitos dos impactos da seca.',
];

/** Slide que a equipe completa: imagens (com legenda) e um texto. Os textos vêm do mês anterior até serem editados. */
export type SlideEditavel = {
  chave: string;
  titulo: string;
  imagens: { chave: string; legenda: string }[];
  texto?: string; // rótulo do campo de texto
  fonte?: string;
  link?: string;
};

export const SLIDES_EDITAVEIS: Record<string, SlideEditavel> = {
  municipios: {
    chave: 'municipios',
    titulo: 'Dados de Pluviometria por Municípios',
    imagens: [
      { chave: 'municipios-tabela', legenda: 'Top 15 — Chuva máxima por município' },
      { chave: 'municipios-grafico', legenda: 'Figura 1: Os 15 municípios com maior precipitação durante o mês.' },
    ],
    fonte: 'Fonte de dados: Chuva Agora — SIBH',
    link: 'https://cth.daee.sp.gov.br/sibh/chuva_agora',
  },
  'idw-municipios': {
    chave: 'idw-municipios',
    titulo: 'Dados de Pluviometria por Municípios',
    imagens: [{ chave: 'idw-municipios', legenda: 'Figura 2: Interpolação IDW de precipitação acumulada do período.' }],
    fonte: 'Fonte de dados: Chuva Agora — SIBH',
    link: 'https://cth.daee.sp.gov.br/sibh/chuva_agora',
  },
  ugrhis: {
    chave: 'ugrhis',
    titulo: 'Dados de Pluviometria por UGRHIs',
    imagens: [
      { chave: 'ugrhis-tabela', legenda: 'Acumulados por UGRHI' },
      { chave: 'ugrhis-grafico', legenda: 'Figura 4: Acumulados Pluviométricos por UGRHIs.' },
    ],
    texto: 'Análise',
    fonte: 'Fonte de dados: Chuva Agora — SIBH',
  },
  'idw-ugrhis': {
    chave: 'idw-ugrhis',
    titulo: 'Interpolação IDW de precipitação acumulada por UGRHIs',
    imagens: [{ chave: 'idw-ugrhis', legenda: 'Figura 5: Interpolação IDW de precipitação acumulada por UGRHIs.' }],
    texto: 'Resumo',
    fonte: 'Fonte de dados: Chuva Agora — SIBH',
  },
  'hidroapp-mapas': {
    chave: 'hidroapp-mapas',
    titulo: 'Volume acumulado e anomalia de precipitação mensal',
    imagens: [
      { chave: 'hidroapp-volume', legenda: 'Figura 6: Volume acumulado de precipitação.' },
      { chave: 'hidroapp-anomalia', legenda: 'Figura 7: Anomalia de precipitação mensal.' },
    ],
    texto: 'Análise',
    fonte: 'Fonte de dados: HidroApp',
    link: 'https://hidroapp.spaguas.sp.gov.br/',
  },
  'hidroapp-tabela': {
    chave: 'hidroapp-tabela',
    titulo: 'Volume acumulado de precipitação por UGRHIs — HidroApp',
    imagens: [
      { chave: 'hidroapp-tabela', legenda: 'Precipitação e média mensal histórica por UGRHI' },
      { chave: 'hidroapp-grafico', legenda: 'Figura 8: Volume acumulado de precipitação e Média Histórica por UGRHIs.' },
    ],
    texto: 'Análise',
    fonte: 'Fonte de dados: HidroApp',
  },
  'previsao-anomalia': {
    chave: 'previsao-anomalia',
    titulo: 'Previsão de Anomalia de Precipitação Mensal e Trimestral',
    imagens: [
      { chave: 'previsao-mensal', legenda: 'Figura 19: Anomalia de Precipitação Mensal.' },
      { chave: 'previsao-trimestral', legenda: 'Figura 20: Anomalia de Precipitação Trimestral.' },
    ],
    texto: 'Análise',
    fonte: 'Fonte: CPTEC/INPE',
    link: 'https://clima.cptec.inpe.br/',
  },
  'previsao-sazonal': {
    chave: 'previsao-sazonal',
    titulo: 'Previsão Climática Sazonal',
    imagens: [{ chave: 'previsao-tercil', legenda: 'Figura 21: Multi-modelo CPTEC/INMET/FUNCEME — probabilidade do tercil mais provável (precipitação).' }],
    texto: 'Análise',
    fonte: 'Fonte: CPTEC/INPE',
    link: 'https://sazonal.cptec.inpe.br/',
  },
  tsm: {
    chave: 'tsm',
    titulo: 'Anomalias de Temperatura da Superfície do Mar',
    imagens: [{ chave: 'tsm', legenda: 'Figura 22: Anomalias de temperatura da superfície do mar.' }],
    texto: 'Análise',
    fonte: 'Fonte: CPTEC/INPE',
    link: 'https://clima.cptec.inpe.br/',
  },
  'previsao-semanal': {
    chave: 'previsao-semanal',
    titulo: 'Previsão de Precipitação de 7 em 7 dias no mês',
    imagens: [
      { chave: 'semana-1', legenda: 'Semana 1' },
      { chave: 'semana-2', legenda: 'Semana 2' },
      { chave: 'semana-3', legenda: 'Semana 3' },
      { chave: 'semana-4', legenda: 'Semana 4' },
    ],
    texto: 'Análise',
    fonte: 'Fonte: CPTEC/INPE',
    link: 'https://subsazonal.cptec.inpe.br/',
  },
};

/** Todas as chaves de imagem aceitas (o envio só aceita estas). */
export const CHAVES_IMAGEM = new Set(Object.values(SLIDES_EDITAVEIS).flatMap((s) => s.imagens.map((i) => i.chave)));
/** Chaves de texto aceitas: o texto de cada slide editável, a análise do protocolo e a referência da capa. */
export const CHAVES_TEXTO = new Set([...Object.values(SLIDES_EDITAVEIS).filter((s) => s.texto).map((s) => s.chave), 'protocolo', 'capa-referencia']);
