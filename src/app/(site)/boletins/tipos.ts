/**
 * Páginas públicas de cada tipo de boletim (textos das páginas do site PHP:
 * boletim-diario.php etc.). `tipos` = slugs de tipos_boletim listados na página.
 */
export const TIPOS_PUBLICOS = {
  diario: {
    titulo: 'Boletim Diário',
    descricao: 'Acompanhamento diário das condições hidrológicas e meteorológicas monitoradas pela Sala de Situação.',
    tipos: ['diario'],
  },
  mensal: {
    titulo: 'Boletim de Chuvas Mensal',
    descricao: 'Síntese mensal da precipitação observada no Estado de São Paulo, com apoio à análise hidrológica do período.',
    tipos: ['mensal'],
  },
  spi: {
    titulo: 'Boletim Índice Padronizado de Chuvas (SPI)',
    descricao: 'Publicações de acompanhamento do Índice Padronizado de Precipitação para avaliação de condições de seca e umidade.',
    tipos: ['spi'],
  },
  integrado: {
    titulo: 'Boletim Integrado',
    descricao: 'Leitura integrada das principais variáveis e indicadores utilizados no monitoramento dos recursos hídricos.',
    tipos: ['integrado'],
  },
  // No PHP estes dois links do menu não tinham página (404); aqui listam os tipos correspondentes.
  'alto-tiete-pinheiros': {
    titulo: 'Boletim Alto Tietê Pinheiros',
    descricao: 'Boletins Sumário Executivo Controle de cheias no Alto Tietê e Pinheiros',
    tipos: ['integrado-ugrhi6', 'sumario-tiete-pinheiros', 'integrado-diario', 'integrado-mensal'],
  },
  ribeira: {
    titulo: 'Boletim Vale do Ribeira',
    descricao: 'Sumários executivos de cheias da bacia do Ribeira de Iguape e Litoral Sul.',
    tipos: ['sumario-ribeira', 'sumario-cheias'],
  },
} as const;

export type TipoPublico = keyof typeof TIPOS_PUBLICOS;
