import { VD, type Diagrama } from './diagramas-unifilares';

/**
 * Diagrama unifilar da bacia do Rio Paraíba do Sul (painel interativo, página
 * Paraíba do Sul), com os mesmos símbolos dos diagramas dos sistemas produtores.
 *
 * Os reservatórios e usinas vêm do ONS (dados abertos, base diária — os mesmos
 * números do SAR da ANA e do boletim "Acompanhamento do Sistema Hidráulico
 * Paraíba do Sul"); a transposição Jaguari ⇄ Atibainha, do SSD (os locais 44 e
 * 41, os do diagrama do Cantareira); os postos de SP, do SIBH; os do RJ e de MG,
 * da telemetria da ANA.
 *
 * Os reservatórios do ONS não são locais do SSD: cada um ganha um número de
 * local próprio (9001…) e as transferências do ONS outro (9101…), para usar as
 * mesmas chaves local:variável dos outros diagramas.
 *
 * Esquema: em cima, o trecho paulista da esquerda para a direita (represas com a
 * barragem à direita, a jusante) até Funil e a elevatória de Santa Cecília; acima
 * dela, o Complexo de Lajes, que leva a água bombeada ao Rio Guandu; o rio desce
 * pela direita e, embaixo, o trecho fluminense corre da direita para a esquerda
 * até a foz, com os afluentes de Minas e do norte fluminense entrando por baixo.
 *
 * Sobre o mapa (como os outros diagramas), cada nó fica na coordenada dele
 * (`ll`): barragens e usinas do cadastro do ONS e da BC250 do IBGE, postos do
 * SIBH e do inventário da ANA. Tocos e a ETA Guandu não estão em nenhum
 * cadastro aberto: posição aproximada. Rios e represas: hidrografia-paraiba.json.
 */

export const BACIA_ONS = 'PARAIBA DO SUL';

/** Reservatório ou usina do ONS no diagrama. `capacidade`: volume útil total (hm³, cadastro do ONS) para o volume em hm³. */
export type LocalOns = { space: number; ons: string; nome: string; rio: string; tipo: 'reservatorio' | 'elevatoria' | 'fio'; capacidade?: number; ll?: [number, number] };

// Capacidade e coordenadas: cadastro de reservatórios do ONS (RESERVATORIOS.csv, val_volutiltot).
// Tocos, Lajes, Santana e Vigário não estão no cadastro: ficam sem volume em hm³.
export const LOCAIS_ONS: LocalOns[] = [
  { space: 9001, ons: 'PBPARA', nome: 'Paraibuna', rio: 'Paraibuna / Paraitinga', tipo: 'reservatorio', capacidade: 2631.17, ll: [-23.41, -45.6006] },
  { space: 9002, ons: 'PBSTAB', nome: 'Santa Branca', rio: 'Paraíba do Sul', tipo: 'reservatorio', capacidade: 304.91, ll: [-23.3742, -45.87] },
  { space: 9003, ons: 'PBJAGU', nome: 'Jaguari', rio: 'Jaguari', tipo: 'reservatorio', capacidade: 795.98, ll: [-23.1925, -46.0214] },
  { space: 9004, ons: 'PBFUNI', nome: 'Funil', rio: 'Paraíba do Sul', tipo: 'reservatorio', capacidade: 584.75, ll: [-22.5286, -44.5669] },
  { space: 9005, ons: 'PBSTAC', nome: 'Santa Cecília', rio: 'Paraíba do Sul', tipo: 'elevatoria', capacidade: 1.26, ll: [-22.4822, -43.8389] },
  { space: 9006, ons: 'RPSANT', nome: 'Santana', rio: 'Piraí', tipo: 'elevatoria' },
  { space: 9007, ons: 'PBVIG', nome: 'Vigário', rio: 'Piraí', tipo: 'elevatoria' },
  { space: 9008, ons: 'RPTOCO', nome: 'Tocos', rio: 'Piraí', tipo: 'reservatorio' },
  { space: 9009, ons: 'RLLAJE', nome: 'Lajes', rio: 'Ribeirão das Lajes', tipo: 'reservatorio' },
  { space: 9010, ons: 'PBANTA', nome: 'Anta', rio: 'Paraíba do Sul', tipo: 'reservatorio', capacidade: 10.36, ll: [-22.0333, -43.0] },
  { space: 9011, ons: 'PBUSSI', nome: 'Simplício', rio: 'Paraíba do Sul', tipo: 'fio', ll: [-21.9214, -42.7897] },
  { space: 9012, ons: 'PBILHP', nome: 'Ilha dos Pombos', rio: 'Paraíba do Sul', tipo: 'fio', ll: [-21.8447, -42.5792] },
  { space: 9013, ons: 'PBPCDA', nome: 'Picada', rio: 'do Peixe', tipo: 'fio', ll: [-21.8842, -43.5405] },
  { space: 9014, ons: 'PUSOBR', nome: 'Sobragi', rio: 'Paraibuna (MG)', tipo: 'fio', ll: [-21.9817, -43.3506] },
  { space: 9015, ons: 'PBBBRA', nome: 'Barra do Braúna', rio: 'Pomba', tipo: 'fio', ll: [-21.45, -42.4] },
  { space: 9016, ons: 'RLFONT', nome: 'Fontes', rio: 'Ribeirão das Lajes', tipo: 'fio', ll: [-22.6911, -43.8628] },
  { space: 9017, ons: 'RLNPEC', nome: 'Nilo Peçanha', rio: 'Ribeirão das Lajes', tipo: 'fio', ll: [-22.6831, -43.8733] },
  { space: 9018, ons: 'RLPPAS', nome: 'Pereira Passos', rio: 'Ribeirão das Lajes', tipo: 'fio', ll: [-22.6867, -43.8253] },
];

/** Transferências do ONS: vazão transferida (val_vazaotransferida) do reservatório `de`. */
export const TRANSFERENCIAS_ONS = [
  { space: 9101, de: 'PBSTAC', nome: 'Bombeamento Santa Cecília → Santana (para o Guandu)' },
  { space: 9102, de: 'RPSANT', nome: 'Bombeamento Santana → Vigário' },
  { space: 9103, de: 'RPTOCO', nome: 'Túnel Tocos → Lajes' },
  { space: 9104, de: 'PBANTA', nome: 'Canal Anta → Simplício' },
] as const;

/** Locais do SSD no diagrama: a transposição (os mesmos do diagrama do Cantareira). */
export const LOCAIS_SSD_PARAIBA = [44, 41] as const;

const { defluente: deflu, vazao } = VD;

export const DIAGRAMA_PARAIBA: Diagrama = {
  chave: 'paraiba-do-sul',
  titulo: 'Bacia do Rio Paraíba do Sul',
  largura: 2120,
  altura: 990,
  api: { valores: '/api/acesso/painel_interativo/paraiba/valores', posto: '/api/acesso/painel_interativo/paraiba/posto' },
  fonte: 'ONS',
  nota: 'Reservatórios e usinas: ONS (dados diários) · transposição: SSD SP Águas · postos: SIBH (SP) e telemetria da ANA (RJ e MG)',
  zoom: true,
  // a bacia toda: zoom bem menor que o de um sistema produtor; rios e represas da BC250 do IBGE (scripts/hidrografia-paraiba.mjs)
  mapa: { zoom: { min: 6, inicial: [6.5, 12] }, hidrografia: 'paraiba', contorno: 'paraiba' },
  ligacoes: [
    // ---- trecho paulista (da esquerda para a direita)
    { tipo: 'rio', mapa: { fim: [-23.372, -45.6579] }, pontos: [[30, 150], [110, 150], [110, 318], [160, 318]], setas: [0.55], rotulo: { texto: 'Rio Paraitinga', x: 30, y: 196, ancora: 'start' } },
    { tipo: 'rio', pontos: [[30, 510], [110, 510], [110, 342], [160, 342]], setas: [0.55], rotulo: { texto: 'Rio Paraibuna', x: 30, y: 470, ancora: 'start' } },
    { tipo: 'rio', pontos: [[312, 330], [420, 330]], valor: { space: 9001, v: deflu, x: 366, y: 318 }, rotulo: { texto: 'Rio Paraíba do Sul', x: 366, y: 372 } },
    // de Santa Branca a Funil numa ligação só: o Jaguari deságua nela (no mapa, afluente que chega à ponta de duas ligações não acha a confluência)
    { tipo: 'rio', pontos: [[572, 330], [1480, 330]], setas: [0.2, 0.41, 0.63, 0.97], valor: { space: 9002, v: deflu, x: 625, y: 318 } },
    { tipo: 'rio', pontos: [[900, 190], [900, 330]], valor: { space: 9003, v: deflu, x: 912, y: 272, ancora: 'start' }, rotulo: { texto: 'Rio Jaguari', x: 912, y: 290, ancora: 'start' } },
    { tipo: 'rio', pontos: [[1632, 330], [1720, 330]], valor: { space: 9004, v: deflu, x: 1676, y: 318 } },
    // ---- transposição Jaguari ⇄ Atibainha (SSD)
    { tipo: 'tunel', mapa: { via: [[-23.2336, -46.1807]] }, pontos: [[826, 154], [690, 154], [690, 164], [642, 164]], valor: { space: 44, v: vazao, x: 760, y: 144 } },
    { tipo: 'tunel', mapa: { via: [[-23.2336, -46.1807]] }, pontos: [[642, 178], [700, 178], [700, 186], [826, 186]], valor: { space: 41, v: vazao, x: 760, y: 208 } },
    // ---- Complexo de Lajes: bombeamento de Santa Cecília até o Guandu
    { tipo: 'tunel', pontos: [[1800, 306], [1800, 232]], valor: { space: 9101, v: vazao, x: 1812, y: 276, ancora: 'start', rotulo: 'bombeada' } },
    { tipo: 'tunel', pontos: [[1726, 210], [1660, 210]], valor: { space: 9102, v: vazao, x: 1693, y: 244, rotulo: 'bombeada' } },
    { tipo: 'rio', pontos: [[2030, 102], [2030, 210], [1880, 210]], setas: [0.75], valor: { space: 9008, v: deflu, x: 2018, y: 160, ancora: 'end' }, rotulo: { texto: 'Rio Piraí', x: 2018, y: 176, ancora: 'end' } },
    { tipo: 'tunel', pontos: [[1956, 80], [1870, 80]], valor: { space: 9103, v: vazao, x: 1913, y: 54 } },
    { tipo: 'rio', pontos: [[1716, 80], [1662, 80]] },
    { tipo: 'rio', pontos: [[1626, 80], [1260, 80], [1260, 192]], setas: [0.45], valor: { space: 9016, v: deflu, x: 1440, y: 68 }, rotulo: { texto: 'Ribeirão das Lajes', x: 1440, y: 100 } },
    { tipo: 'tunel', pontos: [[1504, 210], [1438, 210]] },
    { tipo: 'rio', pontos: [[1402, 210], [1278, 210]], valor: { space: 9017, v: deflu, x: 1340, y: 198 } },
    { tipo: 'rio', pontos: [[1242, 210], [1146, 210]], valor: { space: 9018, v: deflu, x: 1194, y: 198 } },
    // ---- o rio desce pela direita e volta pelo trecho fluminense (da direita para a esquerda)
    { tipo: 'rio', pontos: [[1872, 330], [2060, 330], [2060, 640], [1880, 640]], setas: [0.46, 0.8], valor: { space: 9005, v: deflu, x: 1966, y: 318 } },
    { tipo: 'rio', pontos: [[1960, 930], [1960, 652]], setas: [0.3], rotulo: { texto: 'Rio Paraibuna (MG)', x: 1972, y: 700, ancora: 'start' } },
    { tipo: 'rio', pontos: [[2110, 880], [1972, 880]] },
    { tipo: 'rio', pontos: [[1790, 950], [1790, 760], [1948, 760]], setas: [0.4], rotulo: { texto: 'Rio Preto', x: 1778, y: 940, ancora: 'end' } },
    { tipo: 'tunel', pontos: [[1800, 662], [1800, 740], [1658, 740]], valor: { space: 9104, v: vazao, x: 1730, y: 728 } },
    { tipo: 'rio', pontos: [[1622, 740], [1560, 740], [1560, 652]], valor: { space: 9011, v: deflu, x: 1572, y: 700, ancora: 'start' } },
    { tipo: 'rio', pontos: [[1726, 640], [1480, 640]], valor: { space: 9010, v: deflu, x: 1650, y: 628 } },
    { tipo: 'rio', pontos: [[1442, 640], [1302, 640]], valor: { space: 9012, v: deflu, x: 1358, y: 628 } },
    { tipo: 'rio', pontos: [[1290, 960], [1290, 652]], setas: [0.2], rotulo: { texto: 'Rio Pomba', x: 1278, y: 960, ancora: 'end' } },
    { tipo: 'rio', pontos: [[1302, 640], [664, 640]], setas: [0.3, 0.62, 0.92], rotulo: { texto: 'Rio Paraíba do Sul', x: 700, y: 662 } },
    { tipo: 'rio', pontos: [[980, 960], [980, 652]], setas: [0.2], rotulo: { texto: 'Rio Muriaé', x: 968, y: 960, ancora: 'end' } },
  ],
  nos: [
    // ---- represas do trecho paulista (barragem à direita: o rio corre para a direita)
    { tipo: 'reservatorio', nome: 'Paraibuna', space: 9001, num: 1, x: 240, y: 330, espelhar: true, semChuva: true, ll: [-23.41, -45.6006] },
    { tipo: 'reservatorio', nome: 'Santa Branca', space: 9002, num: 2, x: 500, y: 330, espelhar: true, semChuva: true, ll: [-23.3742, -45.87] },
    { tipo: 'reservatorio', nome: 'Jaguari', space: 9003, num: 3, x: 900, y: 170, semChuva: true, ll: [-23.1925, -46.0214] },
    { tipo: 'reservatorio', nome: 'Funil', space: 9004, num: 4, x: 1560, y: 330, espelhar: true, semChuva: true, ll: [-22.5286, -44.5669] },
    { tipo: 'reservatorio', nome: 'Santa Cecília', prefixo: 'Elevatória', space: 9005, num: 5, x: 1800, y: 330, espelhar: true, semChuva: true, rotulo: 'abaixo', ll: [-22.4822, -43.8389] },
    // ---- Complexo de Lajes (Tocos e a ETA Guandu: posição aproximada)
    { tipo: 'reservatorio', nome: 'Santana', prefixo: 'Elevatória', space: 9006, num: 6, ll: [-22.5322, -43.8183], x: 1800, y: 210, semChuva: true },
    { tipo: 'reservatorio', nome: 'Vigário', prefixo: 'Elevatória', space: 9007, num: 7, ll: [-22.6298, -43.8956], x: 1580, y: 210, semChuva: true },
    { tipo: 'reservatorio', nome: 'Tocos', space: 9008, num: 8, ll: [-22.748, -44.118], x: 2030, y: 80, semChuva: true },
    { tipo: 'reservatorio', nome: 'Lajes', space: 9009, num: 9, ll: [-22.703, -43.8808], x: 1790, y: 80, semChuva: true, rotulo: 'abaixo' },
    { tipo: 'uhe', prefixo: 'UHE', nome: 'Fontes', ll: [-22.6911, -43.8628], x: 1644, y: 80, rotulo: 'acima' },
    { tipo: 'uhe', prefixo: 'UHE', nome: 'Nilo Peçanha', ll: [-22.6831, -43.8733], x: 1420, y: 210, rotulo: 'abaixo' },
    { tipo: 'uhe', prefixo: 'UHE', nome: 'Pereira Passos', ll: [-22.6867, -43.8253], x: 1260, y: 210, rotulo: 'abaixo' },
    { tipo: 'cidade', prefixo: 'Rio Guandu', nome: 'ETA Guandu (RMRJ)', ll: [-22.8083, -43.6283], x: 1122, y: 210, rotulo: 'abaixo' },
    { tipo: 'estrutura', prefixo: 'Sistema Cantareira', nome: 'Atibainha', ll: [-23.17391, -46.3927], x: 630, y: 171, rotulo: 'esquerda' },
    // ---- trecho fluminense e afluentes
    { tipo: 'reservatorio', nome: 'Anta', space: 9010, num: 10, x: 1800, y: 640, semChuva: true, ll: [-22.0333, -43.0] },
    { tipo: 'uhe', prefixo: 'UHE', nome: 'Simplício', ll: [-21.9214, -42.7897], x: 1640, y: 740, rotulo: 'abaixo' },
    { tipo: 'uhe', prefixo: 'UHE', nome: 'Ilha dos Pombos', ll: [-21.8447, -42.5792], x: 1460, y: 640, rotulo: 'abaixo' },
    { tipo: 'uhe', prefixo: 'UHE', nome: 'Sobragi', ll: [-21.9817, -43.3506], x: 1960, y: 800, rotulo: 'direita', valor: { space: 9014, v: deflu, dx: -24, dy: 5, ancora: 'end' } },
    { tipo: 'uhe', prefixo: 'UHE', nome: 'Picada', ll: [-21.8842, -43.5405], x: 2040, y: 880, rotulo: 'abaixo', valor: { space: 9013, v: deflu, dx: 0, dy: -24 } },
    { tipo: 'uhe', prefixo: 'UHE', nome: 'Barra do Braúna', ll: [-21.4498, -42.4054], x: 1290, y: 800, rotulo: 'direita', valor: { space: 9015, v: deflu, dx: -24, dy: 5, ancora: 'end' } },
    { tipo: 'cidade', prefixo: 'Foz — São João da Barra', nome: 'Oceano Atlântico', ll: [-21.6148, -41.0123], x: 640, y: 640, rotulo: 'esquerda' },

    // ---- postos fluviométricos do SIBH (SP): nível e vazão; clique abre os gráficos
    { tipo: 'posto', prefixo: '2E-051', nome: 'São Luiz', municipio: 'São Luís do Paraitinga', ll: [-23.2227, -45.3121], x: 62, y: 150, rotulo: 'acima', sibh: { id: 664, dy: 30 } },
    { tipo: 'posto', prefixo: '2E-052', nome: 'Ponte Alta', municipio: 'São Luís do Paraitinga', ll: [-23.3301, -45.1437], x: 62, y: 510, rotulo: 'abaixo', sibh: { id: 792, dy: -22 } },
    { tipo: 'posto', prefixo: '2E-053', nome: 'Santa Branca', municipio: 'Santa Branca', ll: [-23.3678, -45.8995], x: 720, y: 330, rotulo: 'abaixo', sibh: { id: 33858, dy: -22 } },
    { tipo: 'posto', prefixo: '2E-054', nome: 'Jacareí', municipio: 'Jacareí', ll: [-23.3078, -45.9757], x: 820, y: 330, rotulo: 'acima', sibh: { id: 660, dy: 34 } },
    { tipo: 'posto', prefixo: '2E-010', nome: 'S. José dos Campos', municipio: 'São José dos Campos', ll: [-23.1621, -45.9031], x: 1000, y: 330, rotulo: 'abaixo', sibh: { id: 667, dy: -22 } },
    { tipo: 'posto', prefixo: '2D-025', nome: 'Pindamonhangaba', municipio: 'Pindamonhangaba', ll: [-22.8777, -45.3573], x: 1110, y: 330, rotulo: 'acima', sibh: { id: 671, dy: 34 } },
    { tipo: 'posto', prefixo: '2D-006', nome: 'Guaratinguetá', municipio: 'Guaratinguetá', ll: [-22.7904, -45.1789], x: 1220, y: 330, rotulo: 'abaixo', sibh: { id: 673, dy: -22 } },
    { tipo: 'posto', prefixo: '2D-028', nome: 'Lorena', municipio: 'Lorena', ll: [-22.6999, -45.1193], x: 1320, y: 330, rotulo: 'acima', sibh: { id: 821, dy: 34 } },
    { tipo: 'posto', prefixo: '58230600', nome: 'Queluz', municipio: 'Queluz', ll: [-22.545, -44.7919], x: 1415, y: 330, rotulo: 'abaixo', sibh: { id: 26129, dy: -22 } },

    // ---- estações telemétricas da ANA (RJ e MG): vazão, nível e chuva
    { tipo: 'posto', prefixo: '58380001', nome: 'Paraíba do Sul', municipio: 'Paraíba do Sul (RJ)', ll: [-22.1628, -43.2864], x: 2060, y: 480, rotulo: 'esquerda', ana: { codigo: '58380001', dx: -16, dy: 32, ancora: 'end' } },
    { tipo: 'posto', prefixo: '58790002', nome: 'S. Antônio de Pádua', municipio: 'Santo Antônio de Pádua (RJ)', ll: [-21.5422, -42.1806], x: 1290, y: 720, rotulo: 'direita', ana: { codigo: '58790002', dx: -16, dy: 5, ancora: 'end' } },
    { tipo: 'posto', prefixo: '58770000', nome: 'Cataguases', municipio: 'Cataguases (MG)', ll: [-21.3894, -42.6964], x: 1290, y: 880, rotulo: 'direita', ana: { codigo: '58770000', dx: -16, dy: 5, ancora: 'end' } },
    { tipo: 'posto', prefixo: '58880001', nome: 'São Fidélis', municipio: 'São Fidélis (RJ)', ll: [-21.6453, -41.7522], x: 1120, y: 640, rotulo: 'abaixo', ana: { codigo: '58880001', dy: -22 } },
    { tipo: 'posto', prefixo: '58960000', nome: 'Cardoso Moreira', municipio: 'Cardoso Moreira (RJ)', ll: [-21.5006, -41.6106], x: 980, y: 720, rotulo: 'direita', ana: { codigo: '58960000', dx: -16, dy: 5, ancora: 'end' } },
    { tipo: 'posto', prefixo: '58940000', nome: 'Itaperuna', municipio: 'Itaperuna (RJ)', ll: [-21.2078, -41.8922], x: 980, y: 800, rotulo: 'direita', ana: { codigo: '58940000', dx: -16, dy: 5, ancora: 'end' } },
    { tipo: 'posto', prefixo: '58920000', nome: 'Patrocínio do Muriaé', municipio: 'Patrocínio do Muriaé (MG)', ll: [-21.1506, -42.2144], x: 980, y: 880, rotulo: 'direita', ana: { codigo: '58920000', dx: -16, dy: 5, ancora: 'end' } },
    { tipo: 'posto', prefixo: '58974000', nome: 'Campos', municipio: 'Campos dos Goytacazes (RJ)', ll: [-21.7514, -41.3244], x: 840, y: 640, rotulo: 'abaixo', ana: { codigo: '58974000', dy: -22 } },

    // ---- pluviômetros do SIBH (SP): chuva em 24 h (72 h e no mês na dica)
    { tipo: 'pluviometro', prefixo: 'D1-005', nome: 'Cunha', municipio: 'Cunha', ll: [-22.9167, -44.8167], x: 200, y: 60, rotulo: 'direita', pluvio: 28546 },
    { tipo: 'pluviometro', prefixo: '2345211', nome: 'S. Luiz do Paraitinga', municipio: 'São Luís do Paraitinga', ll: [-23.2375, -45.3064], x: 200, y: 160, rotulo: 'direita', pluvio: 15074 },
    { tipo: 'pluviometro', prefixo: '2345212', nome: 'Natividade da Serra', municipio: 'Natividade da Serra', ll: [-23.4211, -45.2889], x: 200, y: 530, rotulo: 'direita', pluvio: 15075 },
    { tipo: 'pluviometro', prefixo: '2345213', nome: 'Paraibuna', municipio: 'Paraibuna', ll: [-23.4142, -45.6081], x: 380, y: 450, rotulo: 'direita', pluvio: 15072 },
    { tipo: 'pluviometro', prefixo: '637', nome: 'Santa Isabel (EEAB)', municipio: 'Santa Isabel', ll: [-23.239, -46.1746], x: 1000, y: 100, rotulo: 'direita', pluvio: 35353 },
    { tipo: 'pluviometro', prefixo: '354990407A', nome: 'S. José dos Campos', municipio: 'São José dos Campos', ll: [-23.109, -45.933], x: 760, y: 450, rotulo: 'direita', pluvio: 1460 },
    { tipo: 'pluviometro', prefixo: '355410201A', nome: 'Taubaté', municipio: 'Taubaté', ll: [-23.0383, -45.573], x: 960, y: 450, rotulo: 'direita', pluvio: 9801 },
    { tipo: 'pluviometro', prefixo: '351840402A', nome: 'Guaratinguetá', municipio: 'Guaratinguetá', ll: [-22.804, -45.228], x: 1140, y: 450, rotulo: 'direita', pluvio: 1175 },
    { tipo: 'pluviometro', prefixo: '351340501A', nome: 'Cruzeiro', municipio: 'Cruzeiro', ll: [-22.577, -44.958], x: 1320, y: 450, rotulo: 'direita', pluvio: 1546 },
    { tipo: 'pluviometro', prefixo: '350490901A', nome: 'Bananal', municipio: 'Bananal', ll: [-22.679, -44.317], x: 1490, y: 450, rotulo: 'direita', pluvio: 1277 },
  ],
  textos: [{ texto: 'SP  │  RJ', x: 1452, y: 408, semMapa: true }],
  notas: [
    'Valores do ONS são diários e saem com um dia de atraso (o dia mais recente fica marcado com *). Dados consistidos: o ONS ainda pode revisá-los.',
    'Santa Cecília bombeia parte do Paraíba do Sul para o Rio Piraí (Santana); de Vigário a água desce pelas usinas do Complexo de Lajes até o Rio Guandu, que abastece a Região Metropolitana do Rio de Janeiro.',
  ],
};
