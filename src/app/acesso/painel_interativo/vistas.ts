/** Sub-abas da análise por sistema (usadas pela página no servidor e pela tela no navegador). */
export const VISTAS = [
  { chave: 'diagrama', rotulo: 'Diagrama unifilar', icone: 'bi-diagram-3' },
  { chave: 'graficos', rotulo: 'Gráficos por período', icone: 'bi-graph-up' },
  { chave: 'reservatorios', rotulo: 'Reservatórios e transferências', icone: 'bi-droplet-half' },
] as const;

export type Vista = (typeof VISTAS)[number]['chave'];
