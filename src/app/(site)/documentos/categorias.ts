/**
 * Páginas de Documentos por categoria — mesmo conteúdo de documentos/*.php do
 * site PHP (listas fixas de atalhos, em arquivo e não no banco). Documentos
 * públicos cadastrados na área restrita com a mesma categoria aparecem abaixo.
 */

export type ItemDocumento = { titulo: string; desc?: string; href: string; icone: string; externo?: boolean };
export type GrupoDocumentos = { secao: string; icone: string; sub?: string; itens: ItemDocumento[] };
export type CategoriaDocumentos = { titulo: string; kicker: string; intro: string; icone: string; grupos: GrupoDocumentos[] };

export const CATEGORIAS: Record<string, CategoriaDocumentos> = {
  'resolucoes-cantareira': {
    titulo: 'Resoluções do Cantareira',
    kicker: 'Documentos',
    intro: 'Referências regulatórias e resoluções aplicáveis ao Sistema Cantareira.',
    icone: 'bi-file-earmark-ruled',
    grupos: [
      {
        secao: 'Resoluções e referências regulatórias',
        icone: 'bi-file-text',
        itens: [
          {
            titulo: 'Resolução Conjunta ANA–DAEE nº 926/2017',
            desc: 'Publicada no Diário Oficial do Estado em 29/05/2017.',
            href: '/legado/nota_tecnica_spaguas_arsesp/DOE_-_Resolucao_Conjunta_ANA-DAEE_No_926_de_29-05-2017.pdf',
            externo: true,
            icone: 'bi-file-earmark-pdf',
          },
          {
            titulo: 'Resolução Regulatória ANA / SP-Águas — Cantareira',
            desc: 'Página do portal com o acompanhamento regulatório do Sistema Cantareira.',
            href: '/resolucao_regulatorio_ana_spaguas',
            icone: 'bi-graph-up',
          },
        ],
      },
      {
        secao: 'Fontes oficiais',
        icone: 'bi-box-arrow-up-right',
        itens: [
          {
            titulo: 'Portal SP-Águas',
            desc: 'Legislação, resoluções e publicações oficiais.',
            href: 'https://www.spaguas.sp.gov.br/',
            externo: true,
            icone: 'bi-globe',
          },
        ],
      },
    ],
  },
  deliberacoes: {
    titulo: 'Deliberações',
    kicker: 'Documentos',
    intro: 'Deliberações do Conselho Diretor da SP-Águas relacionadas à gestão de recursos hídricos e à escassez.',
    icone: 'bi-file-earmark-check',
    grupos: [
      {
        secao: 'Deliberações',
        icone: 'bi-file-earmark-check',
        itens: [
          {
            titulo: 'Deliberação SP-Águas nº 10, de 23/09/2025',
            desc: 'Estabelece o Experimento Regulatório para implementação do Protocolo de Escassez Hídrica.',
            href: '/protocolo',
            icone: 'bi-journal-text',
          },
          {
            titulo: 'Deliberação DSS',
            desc: 'Acompanhamento e projeções do Sistema de Suporte à Decisão.',
            href: '/deliberacao_dss',
            icone: 'bi-graph-up-arrow',
          },
        ],
      },
      {
        secao: 'Relacionados',
        icone: 'bi-diagram-3',
        itens: [
          {
            titulo: 'Protocolo de Escassez Hídrica',
            desc: 'Classificação de estágios, indicadores e recomendações.',
            href: '/protocolo_escassez',
            icone: 'bi-exclamation-triangle',
          },
        ],
      },
    ],
  },
  'atos-administrativos': {
    titulo: 'Atos Administrativos',
    kicker: 'Documentos',
    intro: 'Atos administrativos publicados pela SP-Águas, com destaque para os atos de outorga de direito de uso de recursos hídricos.',
    icone: 'bi-file-earmark-text',
    grupos: [
      {
        secao: 'Outorga de recursos hídricos',
        icone: 'bi-droplet',
        itens: [
          {
            titulo: 'Atos Administrativos de Outorga',
            desc: 'Relação dos atos administrativos de outorga da SP-Águas.',
            href: '/atos-administrativos-outorga',
            icone: 'bi-list-columns',
          },
          {
            titulo: 'Portarias e atos de outorga (SP-Águas)',
            desc: 'Informações oficiais publicadas pela SP-Águas.',
            href: 'https://www.spaguas.sp.gov.br/site/portariasdeoutorgas/',
            externo: true,
            icone: 'bi-journal-text',
          },
        ],
      },
    ],
  },
  'outros-documentos': {
    titulo: 'Outros Documentos',
    kicker: 'Documentos',
    intro: 'Notas técnicas, publicações e referências complementares da Sala de Situação.',
    icone: 'bi-folder2-open',
    grupos: [
      {
        secao: 'Notas e referências técnicas',
        icone: 'bi-stickies',
        itens: [
          {
            titulo: 'Nota Informativa Conjunta SP-Águas e Arsesp',
            desc: 'Projeções hidrológicas e ações de gestão da demanda.',
            href: '/nota_informativa',
            icone: 'bi-file-earmark-text',
          },
          {
            titulo: 'Nota Informativa — Armazenamento do Cantareira',
            desc: 'Avaliação da situação de armazenamento e das medidas de restrição.',
            href: '/legado/nota_tecnica_arsesp_spaguas/SEI_0100243788_Informacao.pdf',
            icone: 'bi-file-earmark-bar-graph',
          },
          {
            titulo: 'Nota Informativa — Metodologia de Acompanhamento',
            desc: 'Metodologia de acompanhamento da segurança hídrica dos sistemas produtores do SIM.',
            href: '/legado/nota_tecnica_arsesp_spaguas/Nota_Informativa_Conjunta2026-2027.pdf',
            icone: 'bi-file-earmark-ruled',
          },
        ],
      },
      {
        secao: 'Boletins',
        icone: 'bi-journals',
        itens: [
          {
            titulo: 'Todos os boletins',
            desc: 'Boletins diários, mensais, SPI e integrados publicados.',
            href: '/boletins',
            icone: 'bi-journal-text',
          },
        ],
      },
    ],
  },
};
