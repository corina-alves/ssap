/**
 * Mapas base do painel interativo (mapa do SIM e fundo dos diagramas
 * unifilares): os da Esri, sem chave de API (os da CARTO passaram a exigir
 * chave). Cada base é o fundo e, por cima, os rótulos.
 */
const ESRI = (servico: string) => `https://server.arcgisonline.com/ArcGIS/rest/services/${servico}/MapServer/tile/{z}/{y}/{x}`;

export const BASES = [
  { nome: 'Escuro', camadas: [ESRI('Canvas/World_Dark_Gray_Base'), ESRI('Canvas/World_Dark_Gray_Reference')], atribuicao: 'Esri, HERE, Garmin, © OpenStreetMap' },
  { nome: 'Claro', camadas: [ESRI('Canvas/World_Light_Gray_Base'), ESRI('Canvas/World_Light_Gray_Reference')], atribuicao: 'Esri, HERE, Garmin, © OpenStreetMap' },
  { nome: 'Ruas', camadas: [ESRI('World_Street_Map')], atribuicao: 'Esri, HERE, Garmin, USGS, © OpenStreetMap' },
  { nome: 'Relevo', camadas: [ESRI('World_Topo_Map')], atribuicao: 'Esri, HERE, Garmin, USGS, © OpenStreetMap' },
  { nome: 'Satélite', camadas: [ESRI('World_Imagery'), ESRI('Reference/World_Boundaries_and_Places')], atribuicao: 'Imagens © Esri, Maxar, Earthstar Geographics' },
] as const;

export type NomeBase = (typeof BASES)[number]['nome'];
