/**
 * Atalhos de cada sala para as páginas de produção (porte de config/atalhos.php
 * do PHP). Só entram aqui as páginas que já existem no Next; ao migrar outra,
 * acrescente a linha.
 *
 * modulo: em qual módulo da sala o atalho aparece ('boletins' ou 'graficos').
 * O atalho só é mostrado se o módulo estiver habilitado na sala e o usuário
 * tiver a permissão nela.
 */
export type Atalho = { modulo: 'boletins' | 'graficos'; titulo: string; descricao: string; href: string; icone: string; permissao: string };

/** Atalhos que valem para qualquer sala com o módulo ('*' no PHP); {sala} vira o identificador da sala. */
export const ATALHOS_GERAIS: Atalho[] = [
  {
    modulo: 'graficos',
    titulo: 'Gráficos com dados do SSD',
    descricao: 'Qualquer local e variável do SSD (descargas, vazões, chuva, volume, nível): séries no tempo, barras empilhadas, comparação de anos × MLT ou entre locais; salva na lista de gráficos.',
    href: '/acesso/graficos/criar-ssd?s={sala}',
    icone: 'bi-bar-chart-steps',
    permissao: 'visualizar_graficos',
  },
];

/** Atalhos de uma sala: os gerais mais os próprios. */
export function atalhosDaSala(slug: string): Atalho[] {
  return [...ATALHOS_GERAIS.map((t) => ({ ...t, href: t.href.replace('{sala}', slug) })), ...(ATALHOS[slug] ?? [])];
}

// O sumário do Ribeira aparece na Sala Alfredo Pisani e na Sala Vale do Ribeira.
const SUMARIO_RIBEIRA: Atalho = {
  modulo: 'boletins',
  titulo: 'Sumário Executivo — Vale do Ribeira de Iguape',
  descricao: 'Abra o sumário, confira os dados, use "Gerar PDF" e cadastre o PDF como boletim.',
  href: '/acesso/sumario_executivo_cheias/sumario_executivo_ribeira_iguape.html',
  icone: 'bi-pencil-square',
  permissao: 'criar_boletim',
};

export const ATALHOS: Record<string, Atalho[]> = {
  'alfredo-pisani': [
    {
      modulo: 'boletins',
      titulo: 'Boletim Diário — Sala de Situação Alfredo Pisani',
      descricao: 'Chuva 24 h com interpolação por município, fluviometria, extravasamentos, sistemas produtores e PPDC; preencha textos e imagens, use "Gerar PDF" e cadastre o PDF como boletim.',
      href: '/acesso/boletim_diario',
      icone: 'bi-file-earmark-bar-graph',
      permissao: 'criar_boletim',
    },
    {
      modulo: 'graficos',
      titulo: 'Projeções do volume útil × GDN',
      descricao: 'Envie os CSVs das simulações do SSD Sabesp (QN × retirada na ESI) e gere os gráficos com o limite da Faixa 2 e a retomada da GDN — todos os sistemas.',
      href: '/acesso/graficos/projecoes?s=alfredo-pisani',
      icone: 'bi-graph-down-arrow',
      permissao: 'visualizar_graficos',
    },
    {
      modulo: 'graficos',
      titulo: 'Criar gráfico com MLT — período chuvoso, seco ou anual',
      descricao: 'Chuva, vazão natural, vazão afluente ou volume de cada sistema × MLT: mês a mês, acumulado ou ano a ano; salva na lista de gráficos.',
      href: '/acesso/graficos/criar-mlt?s=alfredo-pisani',
      icone: 'bi-bar-chart-line',
      permissao: 'visualizar_graficos',
    },
    {
      modulo: 'graficos',
      titulo: 'Afluência × MLT dos sistemas produtores',
      descricao: 'Vazão natural mensal de cada sistema comparada à MLT, escolhendo os anos (dados do SSD).',
      href: '/acesso/graficos/afluencia-mlt?s=alfredo-pisani',
      icone: 'bi-graph-up-arrow',
      permissao: 'visualizar_graficos',
    },
    {
      modulo: 'graficos',
      titulo: 'Sistemas produtores — volume, chuva e vazões',
      descricao: 'Gráfico de cada sistema com os 12 últimos meses completos: volume útil (barras), chuva, vazão afluente e defluente (dados do SSD). Para o boletim mensal: baixa o gráfico e a tabela de cada sistema em PNG e copia a tabela.',
      href: '/acesso/sistemas_produtores?s=alfredo-pisani',
      icone: 'bi-water',
      permissao: 'visualizar_graficos',
    },
    {
      modulo: 'boletins',
      titulo: 'Sumário Executivo — Situação Hídrica',
      descricao: 'Reservatórios, chuva, vazão, previsão, descargas do Cantareira e outorgas (Sabesp, ANA, SSD e Open-Meteo).',
      href: '/acesso/sumario/sumario_novo_c_descargas',
      icone: 'bi-clipboard-data',
      permissao: 'criar_boletim',
    },
    SUMARIO_RIBEIRA,
    {
      modulo: 'boletins',
      titulo: 'Sumário Executivo — Alto Tietê / Pinheiros',
      descricao: 'Abra o sumário, confira os dados, use "Gerar PDF" e cadastre o PDF como boletim.',
      href: '/acesso/sumario_executivo_cheias/sumario_executivo_tiete_pinheiros.html',
      icone: 'bi-pencil-square',
      permissao: 'criar_boletim',
    },
  ],
  ribeira: [SUMARIO_RIBEIRA],
  cetesb: [
    {
      modulo: 'boletins',
      titulo: 'Boletins mensais do Alto Tietê — Chuva-Vazão, Mananciais e Exutórios',
      descricao: 'Monta o boletim do mês com dados do SIBH, do SSD e da CETESB; ajuste valores e análises na tela, use "Gerar PDF" e cadastre o PDF como boletim.',
      href: '/acesso/boletim_integrado/boletim',
      icone: 'bi-clipboard2-data',
      permissao: 'criar_boletim',
    },
    {
      modulo: 'boletins',
      titulo: 'Dados dos exutórios',
      descricao: 'Cadastro do que não tem fonte automática: operação diária de Pirapora e Billings/Pedreira e vazão e DBO da carga orgânica.',
      href: '/acesso/boletim_integrado/exutorios',
      icone: 'bi-pencil-square',
      permissao: 'criar_boletim',
    },
  ],
  'vale-paraiba': [
    {
      modulo: 'boletins',
      titulo: 'Boletim Diário — Sala de Situação Vale do Paraíba',
      descricao: 'Chuva 24 h e previsão na UGRHI 2, pontos em alerta, UHE Jaguari e reservatórios do SIN com gráficos; corrija o que precisar, use "Gerar PDF" e cadastre o PDF como boletim.',
      href: '/acesso/boletim_paraiba',
      icone: 'bi-file-earmark-bar-graph',
      permissao: 'criar_boletim',
    },
  ],
  pcj: [
    {
      modulo: 'boletins',
      titulo: 'Boletim Diário — Sala de Situação PCJ',
      descricao: 'Chuva, vazão, nível e cotas de alerta direto do SIBH; corrija o que precisar, use "Gerar PDF" e cadastre o PDF como boletim.',
      href: '/acesso/boletim_pcj',
      icone: 'bi-file-earmark-bar-graph',
      permissao: 'criar_boletim',
    },
  ],
};
