import dados from './boletim-ribeira.json';

/**
 * Boletim Executivo Público — Vale do Ribeira (/boletins/automatico/vale-do-ribeira).
 *
 * Pontos, barramentos e o posto do Capivari COPIADOS do Sumário Executivo
 * tradicional (src/conteudo/legado/sumario_cheias_ribeira_iguape.ts, que não
 * muda). Em boletim-ribeira.json, extraídos do mesmo HTML: os pluviômetros da
 * UGRHI 11 e a grade da previsão de chuva (centros de células de 0,1° dentro
 * dos municípios da UGRHI 11, geo/ugrhi11_municipios.geojson).
 */

export type EstacaoRibeira = {
  id: number;
  prefix: string;
  nome: string;
  curto: string;
  trecho: string;
  /** Posição no curso do rio, de montante para jusante (ordem das tabelas). */
  ordemRio: number;
};

/** Os oito pontos de monitoramento (station_prefix_id do SIBH), com cotas de referência. */
export const ESTACOES_RIBEIRA: EstacaoRibeira[] = [
  { id: 29794, prefix: '5F-005', nome: 'Ribeira (Ponte Divisa Estadual)', curto: 'Ribeira – Ponte Divisa Estadual', trecho: 'Rio Ribeira de Iguape', ordemRio: 1 },
  { id: 30854, prefix: '5F-010', nome: 'Barra do Turvo (R. Franco Filho)', curto: 'Barra do Turvo', trecho: 'Rio Turvo', ordemRio: 2 },
  { id: 33203, prefix: '5F-019', nome: 'Iporanga (R. dos Expedicionários)', curto: 'Iporanga', trecho: 'Rio Ribeira de Iguape', ordemRio: 3 },
  { id: 29791, prefix: '5F-001', nome: 'Eldorado (Av. Beira Rio)', curto: 'Eldorado', trecho: 'Rio Ribeira de Iguape', ordemRio: 4 },
  { id: 29726, prefix: '4F-015', nome: 'Sete Barras (Banana)', curto: 'Sete Barras', trecho: 'Rio Ribeira de Iguape', ordemRio: 5 },
  { id: 29728, prefix: '4F-018', nome: 'Juquiá (Estrada do Pouso Alto)', curto: 'Juquiá', trecho: 'Rio Juquiá', ordemRio: 6 },
  { id: 26243, prefix: '4F-002', nome: 'Registro (Rua Félix Aby Azar)', curto: 'Registro', trecho: 'Rio Ribeira de Iguape', ordemRio: 7 },
  { id: 1176, prefix: '4F-042', nome: 'Pariquera-Açu (Jusante Jacupiranga)', curto: 'Pariquera-Açu', trecho: 'Rio Ribeira de Iguape', ordemRio: 8 },
];

/** Leitura do sistema — propagação da cheia: as estações do eixo principal, de montante para jusante. */
export const PROPAGACAO_RIBEIRA: { id: number; rotulo: string }[] = [
  { id: 29794, rotulo: 'Ribeira – Divisa Estadual' },
  { id: 33203, rotulo: 'Iporanga' },
  { id: 29791, rotulo: 'Eldorado' },
  { id: 29726, rotulo: 'Sete Barras' },
  { id: 26243, rotulo: 'Registro' },
  { id: 1176, rotulo: 'Pariquera-Açu' },
];

export type Barramento = { id: number; prefix: string; nome: string; /** posto de jusante (vazão defluente em read_value) */ jusanteId: number | null };

/** UHEs/PCHs nas cabeceiras do Alto Juquiá (sem cotas de referência publicadas no SIBH). */
export const BARRAMENTOS: Barramento[] = [
  { id: 14508, prefix: '81499100', nome: 'Piedade (UHE Jurupara — Barramento)', jusanteId: 14461 },
  { id: 9508, prefix: '81499080', nome: 'Juquiá (PCH Serraria — Barramento)', jusanteId: 9570 },
  { id: 9545, prefix: '81500080', nome: 'Juquiá (UHE Salto do Iporanga — Barramento)', jusanteId: 9490 },
  { id: 14480, prefix: '81496080', nome: 'Tapiraí (UHE Barra — Barramento)', jusanteId: 14868 },
  { id: 14473, prefix: '81497080', nome: 'Tapiraí (PCH Porto Raso — Barramento)', jusanteId: null },
  { id: 14437, prefix: '81498080', nome: 'Tapiraí (UHE Alecrim — Barramento)', jusanteId: null },
  { id: 14504, prefix: '81491080', nome: 'Juquitiba (UHE França — Barramento)', jusanteId: 14546 },
  { id: 14815, prefix: '81495080', nome: 'Ibiúna (UHE Fumaça — Barramento)', jusanteId: null },
];

/** Reservatório Capivari — UHE Governador Parigot de Souza: posto de nível e vazão do SIBH. */
export const CAPIVARI = {
  id: 35718,
  prefix: '81301001',
  nome: 'Barragem Capivari — UHE Gov. Parigot de Souza',
  /** Nota do sumário tradicional (níveis de operação, m). */
  nivelMaximoOperacao: 845,
  nivelMaximoMaximorum: 845.5,
};

/** Página da Copel com o volume útil do Capivari (só para citar a fonte: não há API). */
export const COPEL_PAGINA = 'https://www.copel.com/mhbweb/paginas/bacia-atlantico-sudeste.jsf';

/** Pluviômetros da UGRHI 11 (station_prefix_id; station.ugrhi.cod === 11 no cadastro do SIBH). */
export const PLUVIOMETRICAS_UGRHI11 = new Set(dados.pluviometricasUgrhi11.map(String));

/** Grade da previsão de chuva na UGRHI 11: [latitude, longitude]. */
export const GRADE_PREVISAO_UGRHI11 = dados.gradePrevisaoUgrhi11 as [number, number][];

export const DIAGRAMA_SIBH_RIBEIRA = 'https://apps.spaguas.sp.gov.br/sibh/diagramas/tiete_pinheiros/?vw=flow&dg=ribeira-iguape&bs=gigante';
