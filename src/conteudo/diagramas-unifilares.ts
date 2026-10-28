/**
 * Diagramas unifilares dos sistemas produtores (painel interativo), desenhados
 * para o tema escuro do painel. Topologia e pontos de dados copiados dos
 * diagramas oficiais do SSD (images/diagrams/<sistema>.svg): os números são os
 * mesmos data-space-id / data-variable-id de lá.
 *
 * Coordenadas no espaço do viewBox de cada diagrama. Ligações vão sempre da
 * origem para o destino da água (a seta segue esse sentido).
 */

/** Variáveis do SSD usadas nos diagramas. */
export const VD = { chuva: 1, vazao: 3, descarregada: 5, natural: 6, captada: 8, volumePct: 10, volumeHm3: 11, nivel: 12, defluente: 13 } as const;

export type Ancora = 'start' | 'middle' | 'end';
/** Valor do SSD (local:variável) desenhado em (x, y). */
export type Valor = { space: number; v: number; x: number; y: number; ancora?: Ancora; rotulo?: string };
export type Texto = { texto: string; x: number; y: number; ancora?: Ancora; giro?: number };

export type Ligacao = {
  /** rio/canal natural, túnel ou transferência, adução para ETA */
  tipo: 'rio' | 'tunel' | 'aducao';
  pontos: [number, number][];
  /** onde vão as setas: frações do comprimento (rio: meio; demais: no fim) */
  setas?: number[];
  valor?: Valor;
  rotulo?: Texto;
};

type Base = { nome: string; x: number; y: number };
export type No =
  | (Base & { tipo: 'reservatorio'; space: number; num: number; prefixo?: string; rotulo?: 'acima' | 'abaixo' | 'direita' | 'esquerda' })
  | (Base & {
      tipo: 'posto' | 'eeab' | 'eta' | 'estrutura' | 'uhe' | 'cidade';
      prefixo?: string;
      valor?: Omit<Valor, 'x' | 'y'> & { dx: number; dy: number };
      /** posição do nome em relação ao símbolo */
      rotulo?: 'acima' | 'abaixo' | 'direita' | 'esquerda';
    });

export type Diagrama = {
  chave: string;
  titulo: string;
  largura: number;
  altura: number;
  ligacoes: Ligacao[];
  nos: No[];
  /** valores avulsos, fora de ligação e de nó */
  valores?: Valor[];
  textos?: Texto[];
  notas?: string[];
};

const { vazao, descarregada: desc, natural, captada } = VD;

// ------------------------------------------------------------------ Alto Tietê
const altoTiete: Diagrama = {
  chave: 'alto-tiete',
  titulo: 'Sistema Alto Tietê',
  largura: 1300,
  altura: 780,
  ligacoes: [
    // Rio Tietê: entra em Ponte Nova e segue para oeste
    { tipo: 'rio', pontos: [[1290, 170], [1172, 170]], valor: { space: 26, v: natural, x: 1232, y: 158 }, rotulo: { texto: 'Rio Tietê', x: 1232, y: 192 } },
    { tipo: 'rio', pontos: [[1012, 170], [12, 170]], setas: [0.12, 0.45, 0.8], valor: { space: 26, v: desc, x: 960, y: 158 } },
    // Paraitinga
    { tipo: 'rio', pontos: [[1290, 70], [1172, 70]], valor: { space: 23, v: natural, x: 1232, y: 58 }, rotulo: { texto: 'Rio Paraitinga', x: 1232, y: 92 } },
    { tipo: 'rio', pontos: [[1012, 70], [860, 70], [860, 170]], valor: { space: 23, v: desc, x: 945, y: 58 } },
    // Rio Claro (km 76) → Ponte Nova
    { tipo: 'tunel', pontos: [[1290, 240], [1150, 240], [1150, 194]], valor: { space: 308, v: vazao, x: 1232, y: 228 }, rotulo: { texto: 'Rio Claro (km 76)', x: 1232, y: 262 } },
    // Biritiba
    { tipo: 'rio', pontos: [[1290, 335], [1172, 335]], valor: { space: 14, v: natural, x: 1232, y: 323 }, rotulo: { texto: 'Rio Biritiba', x: 1232, y: 357 } },
    { tipo: 'rio', pontos: [[1012, 335], [560, 335], [560, 170]], setas: [0.3, 0.85], valor: { space: 14, v: desc, x: 960, y: 323 } },
    // EEAB Biritiba: Tietê → Dique
    { tipo: 'tunel', pontos: [[660, 170], [660, 222]] },
    { tipo: 'tunel', pontos: [[660, 254], [660, 440], [843, 440]] },
    // Biritiba → Dique, Dique → Jundiaí
    { tipo: 'tunel', pontos: [[1090, 357], [1090, 440], [877, 440]], valor: { space: 42, v: vazao, x: 985, y: 428 }, rotulo: { texto: 'Biritiba → Dique', x: 985, y: 462 } },
    { tipo: 'tunel', pontos: [[860, 457], [860, 512], [702, 512]], valor: { space: 202, v: vazao, x: 790, y: 500 }, rotulo: { texto: 'Dique → Jundiaí', x: 790, y: 534 } },
    // Jundiaí
    { tipo: 'rio', pontos: [[960, 552], [676, 552]], valor: { space: 21, v: natural, x: 890, y: 576 }, rotulo: { texto: 'Rio Jundiaí', x: 890, y: 594 } },
    { tipo: 'rio', pontos: [[540, 530], [300, 530], [300, 170]], setas: [0.3, 0.8], valor: { space: 21, v: desc, x: 425, y: 518 } },
    // Jundiaí → Taiaçupeba
    { tipo: 'tunel', pontos: [[600, 552], [600, 652], [452, 652]], valor: { space: 43, v: vazao, x: 528, y: 640 }, rotulo: { texto: 'Jundiaí → Taiaçupeba', x: 528, y: 674 } },
    // Taiaçupeba
    { tipo: 'rio', pontos: [[960, 690], [426, 690]], setas: [0.35], valor: { space: 32, v: natural, x: 900, y: 678 }, rotulo: { texto: 'Rio Taiaçupeba', x: 900, y: 712 } },
    { tipo: 'rio', pontos: [[290, 670], [130, 670], [130, 170]], setas: [0.25, 0.75], valor: { space: 32, v: desc, x: 215, y: 658 } },
    // EEABs que reforçam o Taiaçupeba
    { tipo: 'tunel', pontos: [[690, 740], [690, 692]] },
    { tipo: 'tunel', pontos: [[830, 740], [830, 692]] },
    // Captação: Taiaçupeba → ETA → RMSP
    { tipo: 'aducao', pontos: [[372, 692], [372, 752], [258, 752]], valor: { space: 56, v: captada, x: 388, y: 726, ancora: 'start', rotulo: 'Captação' } },
    { tipo: 'aducao', pontos: [[205, 752], [104, 752]] },
  ],
  nos: [
    { tipo: 'reservatorio', nome: 'Paraitinga', space: 23, num: 1, x: 1092, y: 70 },
    { tipo: 'reservatorio', nome: 'Ponte Nova', space: 26, num: 2, x: 1092, y: 170 },
    { tipo: 'reservatorio', nome: 'Biritiba', space: 14, num: 3, x: 1092, y: 335 },
    { tipo: 'reservatorio', nome: 'Jundiaí', space: 21, num: 4, x: 620, y: 530 },
    { tipo: 'reservatorio', nome: 'Taiaçupeba', space: 32, num: 5, x: 372, y: 670 },
    { tipo: 'posto', prefixo: 'Posto', nome: 'AT-9', x: 72, y: 170, valor: { space: 69, v: vazao, dx: 0, dy: -60 } },
    { tipo: 'posto', prefixo: 'Captação Mogi', nome: 'SEMAE', x: 400, y: 170, valor: { space: 74, v: vazao, dx: 0, dy: -60 } },
    { tipo: 'posto', prefixo: 'Posto', nome: 'AT-7', x: 490, y: 170, valor: { space: 68, v: vazao, dx: 0, dy: -60 } },
    { tipo: 'posto', prefixo: 'Posto', nome: 'AT-18', x: 770, y: 170, valor: { space: 73, v: vazao, dx: 0, dy: -60 } },
    { tipo: 'eeab', prefixo: 'EEAB', nome: 'Biritiba', x: 660, y: 238, rotulo: 'direita', valor: { space: 200, v: vazao, dx: 22, dy: -22, ancora: 'start' } },
    { tipo: 'estrutura', prefixo: 'Dique', nome: 'Biritiba', x: 860, y: 440, rotulo: 'acima' },
    { tipo: 'eeab', prefixo: 'EEAB', nome: 'Rio Grande', x: 690, y: 756, rotulo: 'direita', valor: { space: 38, v: vazao, dx: 22, dy: -22, ancora: 'start' } },
    { tipo: 'eeab', prefixo: 'EEAB', nome: 'Guaió', x: 830, y: 756, rotulo: 'direita', valor: { space: 201, v: vazao, dx: 22, dy: -22, ancora: 'start' } },
    { tipo: 'eta', prefixo: 'ETA', nome: 'Taiaçupeba', x: 232, y: 752, rotulo: 'acima' },
    { tipo: 'cidade', nome: 'RMSP', x: 78, y: 752, rotulo: 'acima' },
  ],
  textos: [{ texto: 'Rio Tietê', x: 205, y: 192 }],
  notas: ['SEMAE: captação para Mogi das Cruzes.'],
};

// ------------------------------------------------------------------ Cantareira
const cantareira: Diagrama = {
  chave: 'cantareira',
  titulo: 'Sistema Cantareira',
  largura: 1300,
  altura: 820,
  ligacoes: [
    // Jaguari/Jacareí (Rio Jaguari e Rio Jacareí)
    { tipo: 'rio', pontos: [[1290, 80], [1062, 80]], setas: [0.3], valor: { space: 20, v: natural, x: 1110, y: 68 } },
    { tipo: 'rio', pontos: [[1290, 135], [1120, 135], [1120, 80]], setas: [0.4] },
    { tipo: 'rio', pontos: [[902, 80], [12, 80]], setas: [0.1, 0.45, 0.8], valor: { space: 20, v: desc, x: 850, y: 68 } },
    // Cachoeira
    { tipo: 'rio', pontos: [[1290, 260], [1062, 260]], valor: { space: 15, v: natural, x: 1220, y: 248 }, rotulo: { texto: 'Rio Cachoeira', x: 1220, y: 282 } },
    { tipo: 'rio', pontos: [[902, 260], [720, 260], [720, 430]], setas: [0.35], valor: { space: 15, v: desc, x: 820, y: 248 } },
    // Atibainha → Rio Atibaia
    { tipo: 'rio', pontos: [[1290, 430], [1062, 430]], valor: { space: 12, v: natural, x: 1220, y: 418 }, rotulo: { texto: 'Rio Atibainha', x: 1220, y: 452 } },
    { tipo: 'rio', pontos: [[902, 430], [12, 430]], setas: [0.08, 0.5, 0.85], valor: { space: 12, v: desc, x: 820, y: 418 } },
    // Túneis 7, 6 e 5
    { tipo: 'tunel', pontos: [[1034, 100], [1060, 240]], valor: { space: 47, v: vazao, x: 1058, y: 160, ancora: 'start' }, rotulo: { texto: 'Túnel 7', x: 1058, y: 182, ancora: 'start' } },
    { tipo: 'tunel', pontos: [[1034, 280], [1060, 410]], valor: { space: 46, v: vazao, x: 1058, y: 335, ancora: 'start' }, rotulo: { texto: 'Túnel 6', x: 1058, y: 357, ancora: 'start' } },
    { tipo: 'tunel', pontos: [[960, 452], [960, 520], [740, 520], [740, 610]], valor: { space: 45, v: vazao, x: 850, y: 508 }, rotulo: { texto: 'Túnel 5', x: 850, y: 542 } },
    // Paiva Castro (Rio Juqueri)
    { tipo: 'rio', pontos: [[1040, 630], [740, 630]], valor: { space: 22, v: natural, x: 960, y: 618 }, rotulo: { texto: 'Rio Juqueri', x: 960, y: 652 } },
    { tipo: 'rio', pontos: [[580, 630], [12, 630]], setas: [0.3, 0.8], valor: { space: 22, v: desc, x: 520, y: 618 } },
    // Paiva Castro → EEAB Santa Inês → Águas Claras → ETA Guaraú
    { tipo: 'tunel', pontos: [[660, 652], [660, 712]] },
    { tipo: 'tunel', pontos: [[644, 740], [500, 740]], valor: { space: 40, v: vazao, x: 572, y: 728 } },
    { tipo: 'rio', pontos: [[900, 790], [452, 790], [452, 762]], setas: [0.4], valor: { space: 11, v: natural, x: 800, y: 778 }, rotulo: { texto: 'Rib. Santa Inês', x: 800, y: 810 } },
    { tipo: 'aducao', pontos: [[342, 740], [162, 740]], valor: { space: 52, v: captada, x: 252, y: 710, rotulo: 'Captação' } },
    // Paraíba do Sul: UHE Jaguari ⇄ Atibainha
    { tipo: 'rio', pontos: [[1290, 730], [1202, 730]], rotulo: { texto: 'Rio Jaguari (PS)', x: 1250, y: 752 } },
    { tipo: 'tunel', pontos: [[1130, 660], [1130, 520], [1030, 452]], valor: { space: 44, v: vazao, x: 1142, y: 590, ancora: 'start', rotulo: 'PS → Atibainha' } },
    { tipo: 'tunel', pontos: [[1010, 452], [1100, 520], [1100, 660]], valor: { space: 41, v: vazao, x: 1088, y: 610, ancora: 'end', rotulo: 'Atibainha → PS' } },
  ],
  nos: [
    { tipo: 'reservatorio', nome: 'Jaguari/Jacareí', space: 20, num: 1, x: 982, y: 80 },
    { tipo: 'reservatorio', nome: 'Cachoeira', space: 15, num: 2, x: 982, y: 260 },
    { tipo: 'reservatorio', nome: 'Atibainha', space: 12, num: 3, x: 982, y: 430 },
    { tipo: 'reservatorio', nome: 'Paiva Castro', space: 22, num: 4, x: 660, y: 630 },
    { tipo: 'reservatorio', nome: 'Águas Claras', space: 11, num: 5, x: 420, y: 740, rotulo: 'acima' },
    { tipo: 'reservatorio', nome: 'UHE Jaguari', prefixo: 'Paraíba do Sul', space: 34, num: 6, x: 1122, y: 730, rotulo: 'abaixo' },
    { tipo: 'posto', prefixo: 'Posto', nome: 'F-25BT', x: 1200, y: 80, valor: { space: 61, v: vazao, dx: 0, dy: -50 }, rotulo: 'abaixo' },
    { tipo: 'posto', prefixo: 'Posto', nome: 'Buenópolis', x: 650, y: 80, valor: { space: 58, v: vazao, dx: 0, dy: -50 }, rotulo: 'abaixo' },
    { tipo: 'posto', prefixo: 'Posto', nome: 'Atibaia', x: 470, y: 430, valor: { space: 60, v: vazao, dx: 0, dy: -50 }, rotulo: 'abaixo' },
    { tipo: 'posto', prefixo: 'Posto', nome: 'Captação Valinhos', x: 200, y: 430, valor: { space: 59, v: vazao, dx: 0, dy: -50 }, rotulo: 'abaixo' },
    { tipo: 'eeab', prefixo: 'EEAB', nome: 'Santa Inês', x: 660, y: 740, rotulo: 'direita' },
    { tipo: 'eta', prefixo: 'ETA', nome: 'Guaraú', x: 136, y: 740, rotulo: 'abaixo' },
  ],
  textos: [
    { texto: 'Rio Jaguari → Rio Piracicaba', x: 20, y: 102, ancora: 'start' },
    { texto: 'Rio Jacareí', x: 1220, y: 157 },
    { texto: 'Rio Atibaia → Rio Piracicaba', x: 20, y: 412, ancora: 'start' },
    { texto: 'Bacia do Piracicaba ↑   Bacia do Alto Tietê ↓', x: 20, y: 545, ancora: 'start' },
  ],
  notas: ['UHE Jaguari fica na bacia do Paraíba do Sul e não entra no Sistema Equivalente.'],
};

// ------------------------------------------------------------------ Guarapiranga
const guarapiranga: Diagrama = {
  chave: 'guarapiranga',
  titulo: 'Sistema Guarapiranga',
  largura: 1300,
  altura: 560,
  ligacoes: [
    { tipo: 'rio', pontos: [[1290, 300], [722, 300]], setas: [0.15, 0.6], valor: { space: 19, v: natural, x: 1210, y: 288 }, rotulo: { texto: 'Rio Embu-Guaçu', x: 1210, y: 322 } },
    { tipo: 'rio', pontos: [[562, 300], [12, 300]], setas: [0.3, 0.75], valor: { space: 19, v: desc, x: 480, y: 288 }, rotulo: { texto: 'Rio Guarapiranga → Rio Pinheiros', x: 20, y: 322, ancora: 'start' } },
    { tipo: 'tunel', pontos: [[880, 470], [880, 302]], valor: { space: 63, v: vazao, x: 896, y: 400, ancora: 'start' } },
    { tipo: 'tunel', pontos: [[1060, 470], [1060, 302]], valor: { space: 62, v: vazao, x: 1076, y: 400, ancora: 'start' } },
    { tipo: 'aducao', pontos: [[642, 278], [642, 130], [462, 130]], valor: { space: 48, v: captada, x: 658, y: 200, ancora: 'start', rotulo: 'Captação' } },
    { tipo: 'aducao', pontos: [[410, 130], [270, 130]] },
  ],
  nos: [
    { tipo: 'reservatorio', nome: 'Guarapiranga', space: 19, num: 1, x: 642, y: 300, rotulo: 'abaixo' },
    { tipo: 'eeab', prefixo: 'EEAB', nome: 'Taquacetuba ¹', x: 880, y: 486, rotulo: 'abaixo' },
    { tipo: 'eeab', prefixo: 'EEAB', nome: 'Capivari ²', x: 1060, y: 486, rotulo: 'abaixo' },
    { tipo: 'eta', prefixo: 'ETA', nome: 'Alto da Boa Vista', x: 436, y: 130, rotulo: 'acima' },
    { tipo: 'cidade', nome: 'RMSP', x: 244, y: 130, rotulo: 'acima' },
  ],
  notas: ['¹ Reversão do Res. Billings (braço do Taquacetuba).', '² Rio Capivari, vertente litorânea (bacia do Itanhaém).'],
};

// ------------------------------------------------------------------ Cotia
const cotia: Diagrama = {
  chave: 'cotia',
  titulo: 'Sistema Cotia',
  largura: 1300,
  altura: 560,
  ligacoes: [
    { tipo: 'rio', pontos: [[12, 380], [168, 380]], valor: { space: 25, v: natural, x: 90, y: 368 }, rotulo: { texto: 'Rio Cotia', x: 90, y: 402 } },
    { tipo: 'rio', pontos: [[328, 380], [440, 380], [440, 300], [578, 300]], setas: [0.6], valor: { space: 25, v: desc, x: 375, y: 368 } },
    { tipo: 'rio', pontos: [[738, 300], [860, 300], [860, 220], [1008, 220]], setas: [0.6], valor: { space: 27, v: desc, x: 795, y: 288 } },
    { tipo: 'rio', pontos: [[1168, 220], [1290, 220]], valor: { space: 30, v: desc, x: 1225, y: 208 }, rotulo: { texto: 'Rio Cotia → Rio Tietê', x: 1225, y: 242 } },
    { tipo: 'aducao', pontos: [[658, 278], [658, 120]], valor: { space: 49, v: captada, x: 674, y: 200, ancora: 'start', rotulo: 'Captação' } },
    { tipo: 'aducao', pontos: [[1088, 242], [1088, 410]], valor: { space: 50, v: captada, x: 1104, y: 330, ancora: 'start', rotulo: 'Captação' } },
  ],
  nos: [
    { tipo: 'reservatorio', nome: 'Pedro Beicht', space: 25, num: 1, x: 248, y: 380, rotulo: 'abaixo' },
    { tipo: 'reservatorio', nome: 'Cachoeira da Graça', space: 27, num: 2, x: 658, y: 300, rotulo: 'abaixo' },
    { tipo: 'reservatorio', nome: 'Isolina', space: 30, num: 3, x: 1088, y: 220 },
    { tipo: 'eta', prefixo: 'ETA', nome: 'Alto Cotia', x: 658, y: 100, rotulo: 'acima' },
    { tipo: 'eta', prefixo: 'ETA', nome: 'Baixo Cotia', x: 1088, y: 430, rotulo: 'abaixo' },
  ],
  // vazão natural da Graça e da Isolina, no trecho que chega a cada uma
  valores: [
    { space: 27, v: natural, x: 512, y: 288 },
    { space: 30, v: natural, x: 938, y: 208 },
  ],
};

// ------------------------------------------------------------------ Rio Grande
const rioGrande: Diagrama = {
  chave: 'rio-grande',
  titulo: 'Sistema Rio Grande',
  largura: 1300,
  altura: 640,
  ligacoes: [
    { tipo: 'rio', pontos: [[1290, 420], [642, 420]], setas: [0.2, 0.75], valor: { space: 31, v: natural, x: 1210, y: 408 }, rotulo: { texto: 'Rio Grande', x: 1210, y: 442 } },
    { tipo: 'rio', pontos: [[482, 420], [12, 420]], setas: [0.6], valor: { space: 31, v: desc, x: 200, y: 408 }, rotulo: { texto: 'Res. Billings', x: 60, y: 442 } },
    { tipo: 'rio', pontos: [[1290, 200], [1102, 200]], valor: { space: 28, v: natural, x: 1210, y: 188 }, rotulo: { texto: 'Rib. da Estiva', x: 1210, y: 222 } },
    { tipo: 'rio', pontos: [[942, 200], [800, 200], [800, 420]], setas: [0.35], valor: { space: 28, v: desc, x: 870, y: 188 } },
    { tipo: 'aducao', pontos: [[1022, 178], [1022, 80]], valor: { space: 53, v: captada, x: 1038, y: 130, ancora: 'start', rotulo: 'Captação' } },
    { tipo: 'aducao', pontos: [[562, 398], [562, 230]], valor: { space: 54, v: captada, x: 578, y: 320, ancora: 'start', rotulo: 'Captação' } },
    { tipo: 'tunel', pontos: [[300, 560], [300, 482], [530, 482], [530, 442]], valor: { space: 39, v: vazao, x: 415, y: 470 } },
    { tipo: 'tunel', pontos: [[610, 442], [610, 560], [690, 560]] },
    { tipo: 'tunel', pontos: [[724, 560], [960, 560]], valor: { space: 38, v: vazao, x: 842, y: 548 }, rotulo: { texto: 'Transposição para Taiaçupeba (Alto Tietê)', x: 970, y: 564, ancora: 'start' } },
  ],
  nos: [
    { tipo: 'reservatorio', nome: 'Rio Grande', space: 31, num: 1, x: 562, y: 420, rotulo: 'esquerda' },
    { tipo: 'reservatorio', nome: 'Ribeirão da Estiva', space: 28, num: 2, x: 1022, y: 200, rotulo: 'abaixo' },
    { tipo: 'eta', prefixo: 'ETA', nome: 'Rio Grande', x: 562, y: 210, rotulo: 'acima' },
    { tipo: 'eta', prefixo: 'ETA', nome: 'Ribeirão da Estiva', x: 1022, y: 60, rotulo: 'direita' },
    { tipo: 'eeab', prefixo: 'EEAB', nome: 'Rio Pequeno ¹', x: 300, y: 576, rotulo: 'abaixo' },
    { tipo: 'eeab', prefixo: 'EEAB', nome: 'Rio Grande', x: 707, y: 560, rotulo: 'abaixo' },
  ],
  notas: ['¹ Reversão do braço do Rio Pequeno (Billings) para o Res. Rio Grande.'],
};

// ------------------------------------------------------------------ Rio Claro
const rioClaro: Diagrama = {
  chave: 'rio-claro',
  titulo: 'Sistema Rio Claro',
  largura: 1300,
  altura: 700,
  ligacoes: [
    { tipo: 'rio', pontos: [[1290, 170], [12, 170]], setas: [0.06, 0.35, 0.62, 0.9], rotulo: { texto: 'Rio Claro', x: 1250, y: 192 } },
    { tipo: 'rio', pontos: [[1130, 690], [1130, 532]], setas: [0.5], valor: { space: 29, v: natural, x: 1146, y: 620, ancora: 'start' }, rotulo: { texto: 'Ribeirão do Carmo', x: 1146, y: 642, ancora: 'start' } },
    { tipo: 'rio', pontos: [[1130, 488], [1130, 172]], setas: [0.3], valor: { space: 29, v: desc, x: 1146, y: 300, ancora: 'start' } },
    { tipo: 'aducao', pontos: [[400, 186], [400, 322]], valor: { space: 35, v: vazao, x: 416, y: 260, ancora: 'start', rotulo: 'Captação Km 76' } },
    { tipo: 'aducao', pontos: [[760, 186], [760, 340], [428, 340]], valor: { space: 36, v: vazao, x: 600, y: 312, rotulo: 'Captação Poço Preto' } },
    { tipo: 'rio', pontos: [[900, 300], [900, 690]], setas: [0.2, 0.8], rotulo: { texto: 'Rio Guaratuba', x: 916, y: 690, ancora: 'start' } },
    { tipo: 'tunel', pontos: [[884, 560], [620, 560], [620, 172]], valor: { space: 37, v: vazao, x: 752, y: 548 } },
  ],
  nos: [
    { tipo: 'reservatorio', nome: 'Ribeirão do Campo', space: 29, num: 1, x: 1130, y: 510, rotulo: 'esquerda' },
    { tipo: 'posto', prefixo: 'Posto', nome: 'Km 76 (jusante)', x: 250, y: 170, valor: { space: 308, v: vazao, dx: 0, dy: -50 }, rotulo: 'abaixo' },
    { tipo: 'posto', prefixo: 'Captação', nome: 'Km 76', x: 400, y: 170, rotulo: 'acima' },
    { tipo: 'posto', prefixo: 'Captação', nome: 'Poço Preto', x: 760, y: 170, rotulo: 'acima' },
    { tipo: 'eta', prefixo: 'ETA', nome: 'Casa Grande', x: 400, y: 340, rotulo: 'abaixo' },
    { tipo: 'eeab', prefixo: 'EEAB', nome: 'Guaratuba ¹', x: 900, y: 560, rotulo: 'direita' },
  ],
  textos: [{ texto: 'Res. Ponte Nova (Alto Tietê) ²', x: 20, y: 192, ancora: 'start' }],
  notas: ['¹ Vertente marítima.', '² O Rio Claro segue para o Sistema Produtor Alto Tietê.'],
};

// ------------------------------------------------------------------ São Lourenço
const saoLourenco: Diagrama = {
  chave: 'sao-lourenco',
  titulo: 'Sistema São Lourenço',
  largura: 1300,
  altura: 640,
  ligacoes: [
    { tipo: 'rio', pontos: [[1290, 420], [842, 420]], setas: [0.15, 0.7], valor: { space: 16, v: natural, x: 935, y: 408 }, rotulo: { texto: 'Rio Juquiá', x: 1240, y: 442 } },
    { tipo: 'rio', pontos: [[682, 420], [12, 420]], setas: [0.2, 0.5, 0.85], valor: { space: 16, v: desc, x: 610, y: 408, rotulo: 'D1' } },
    { tipo: 'rio', pontos: [[480, 40], [480, 420]], setas: [0.15, 0.75], rotulo: { texto: 'Rio Bonito', x: 496, y: 60, ancora: 'start' } },
    // UHE França (vazão turbinada) devolve ao rio
    { tipo: 'tunel', pontos: [[700, 442], [700, 580], [614, 580]], valor: { space: 64, v: vazao, x: 716, y: 520, ancora: 'start', rotulo: 'D2 · turbinada' } },
    { tipo: 'tunel', pontos: [[574, 580], [400, 580], [400, 422]] },
    // Captação: EEAB → ETA Vargem Grande
    { tipo: 'aducao', pontos: [[762, 398], [762, 300]] },
    { tipo: 'aducao', pontos: [[762, 270], [762, 150]], valor: { space: 55, v: captada, x: 778, y: 210, ancora: 'start', rotulo: 'Captação' } },
  ],
  nos: [
    { tipo: 'reservatorio', nome: 'Cachoeira do França', space: 16, num: 1, x: 762, y: 420, rotulo: 'abaixo' },
    { tipo: 'posto', prefixo: 'Posto', nome: 'Rio Juquiá', x: 1100, y: 420, valor: { space: 65, v: vazao, dx: 0, dy: -50 }, rotulo: 'abaixo' },
    { tipo: 'posto', prefixo: 'Posto', nome: 'Rio Bonito', x: 480, y: 220, valor: { space: 66, v: vazao, dx: -18, dy: 4, ancora: 'end' }, rotulo: 'direita' },
    { tipo: 'posto', prefixo: 'Posto', nome: 'UHE França Jusante', x: 220, y: 420, valor: { space: 67, v: vazao, dx: 0, dy: -50 }, rotulo: 'abaixo' },
    { tipo: 'uhe', prefixo: 'UHE', nome: 'França', x: 594, y: 580, rotulo: 'abaixo' },
    { tipo: 'eeab', prefixo: 'EEAB', nome: 'São Lourenço', x: 762, y: 285, rotulo: 'direita' },
    { tipo: 'eta', prefixo: 'ETA', nome: 'Vargem Grande', x: 762, y: 130, rotulo: 'acima' },
  ],
  notas: ['Defluente total = D1 (descarregada) + D2 (turbinada na UHE França).'],
};

export const DIAGRAMAS_UNIFILARES: Record<string, Diagrama> = {
  cantareira,
  'alto-tiete': altoTiete,
  guarapiranga,
  cotia,
  'rio-grande': rioGrande,
  'rio-claro': rioClaro,
  'sao-lourenco': saoLourenco,
};

/** Pares local:variável que um diagrama precisa (valores das ligações, dos nós e dos reservatórios). */
export function paresDoDiagrama(d: Diagrama): string[] {
  const pares = new Set<string>();
  for (const l of d.ligacoes) if (l.valor) pares.add(`${l.valor.space}:${l.valor.v}`);
  for (const v of d.valores ?? []) pares.add(`${v.space}:${v.v}`);
  for (const n of d.nos) {
    if (n.tipo === 'reservatorio') for (const v of [VD.volumePct, VD.volumeHm3, VD.nivel, VD.chuva]) pares.add(`${n.space}:${v}`);
    else if (n.valor) pares.add(`${n.valor.space}:${n.valor.v}`);
  }
  return [...pares];
}
