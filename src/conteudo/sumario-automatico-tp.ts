import dados from './sumario-automatico-tp.json';

/**
 * Sumário Executivo Automático — Alto Tietê / Pinheiros (/boletins/automatico/tiete-pinheiros).
 *
 * Estações, estruturas e regras COPIADAS do sumário tradicional
 * (src/conteudo/legado/sumario_cheias_tiete_pinheiros.ts, que não muda).
 * As tabelas grandes — curva de vazão da Penha, curvas de volume útil de
 * Billings e Guarapiranga, municípios da RMSP e a grade da previsão — estão em
 * sumario-automatico-tp.json, extraídas do mesmo HTML.
 */

export type Estacao = { id: number; prefix: string; nome: string; curto: string; trecho: string };

/** Estações do SIBH com cotas de referência cadastradas (station_prefix_id). */
export const ESTACOES: Estacao[] = [
  { id: 33209, prefix: '2', nome: 'Mogi das Cruzes (Rio Tietê Estaleiro)', curto: 'Mogi das Cruzes – Estaleiro', trecho: 'Tietê' },
  { id: 35423, prefix: '3E-193', nome: 'Itaquaquecetuba (Rio Tietê)', curto: 'Itaquaquecetuba', trecho: 'Tietê' },
  { id: 33212, prefix: '3E-189', nome: 'São Paulo (Jardim Romano)', curto: 'Jardim Romano', trecho: 'Núcleo de várzea' },
  { id: 35320, prefix: '1000035', nome: 'São Paulo (Núcleo Itaim Biacica)', curto: 'Itaim Biacica', trecho: 'Núcleo de várzea' },
  { id: 33762, prefix: '3E-134', nome: 'São Paulo (Barragem da Penha Jusante)', curto: 'Barragem da Penha (Jusante)', trecho: 'Barragem — Jusante' },
  { id: 114, prefix: '519', nome: 'São Paulo (Rio Pinheiros Superior — Usina Traição)', curto: 'Pinheiros – Traição (Superior)', trecho: 'Pinheiros' },
  { id: 33720, prefix: '3E-131', nome: 'São Paulo (Barragem Móvel Montante)', curto: 'Barragem Móvel (Montante)', trecho: 'Barragem — Montante' },
  { id: 33741, prefix: '3E-130', nome: 'São Paulo (Rio Tietê — Ponte Dutra)', curto: 'Ponte Dutra', trecho: 'Tietê' },
  { id: 33771, prefix: '3E-190', nome: 'São Paulo (Rio Tietê — São Miguel)', curto: 'São Miguel', trecho: 'Tietê' },
  { id: 117, prefix: '618', nome: 'São Paulo (Rio Pinheiros Superior — Pedreira)', curto: 'Pinheiros – Pedreira', trecho: 'Pinheiros' },
  { id: 868, prefix: '397', nome: 'São Paulo (Rio Pinheiros — Ponte João Dias)', curto: 'Pinheiros – Ponte João Dias', trecho: 'Pinheiros' },
  { id: 33722, prefix: '1000861', nome: 'São Paulo (Córrego Jacú — Jd. Pantanal)', curto: 'Córrego Jacú', trecho: 'Córrego Jacú' },
  { id: 33767, prefix: '413', nome: 'São Paulo (Rio Tamanduateí — Mercado Municipal)', curto: 'Tamanduateí – Mercado', trecho: 'Tamanduateí' },
  { id: 35335, prefix: '3E-135', nome: 'São Paulo (Núcleo Jardim Helena)', curto: 'Jardim Helena', trecho: 'Núcleo de várzea' },
  { id: 109, prefix: '518', nome: 'São Paulo (Rio Pinheiros Inferior — Usina Traição)', curto: 'Pinheiros – Traição (Inferior)', trecho: 'Pinheiros' },
  { id: 33673, prefix: '1000236', nome: 'Santana de Parnaíba (Guarda Municipal — Rio Tietê)', curto: 'Santana de Parnaíba', trecho: 'Tietê' },
  { id: 33675, prefix: '729', nome: 'Guarulhos (Barragem da Penha Montante)', curto: 'Barragem da Penha (Montante)', trecho: 'Barragem — Montante' },
  { id: 35285, prefix: '3E-154', nome: 'Guarulhos (Rio Baquirivu CECAP)', curto: 'Rio Baquirivu', trecho: 'Rio Baquirivu' },
  { id: 33698, prefix: '3E-132', nome: 'São Paulo (Barragem Móvel Jusante — Cebolão)', curto: 'Barragem Móvel (Jusante)', trecho: 'Barragem — Jusante' },
  { id: 33758, prefix: '3E-129', nome: 'São Paulo (Rio Tietê — Ponte do Piqueri)', curto: 'Ponte do Piqueri', trecho: 'Tietê' },
  { id: 33671, prefix: '1000225', nome: 'Pirapora do Bom Jesus (Barragem Montante)', curto: 'Pirapora do Bom Jesus', trecho: 'Barragem — Montante' },
  { id: 929, prefix: '1000881', nome: 'Santana de Parnaíba (Estação Edgar de Souza Montante)', curto: 'Edgar de Souza', trecho: 'Tietê — montante' },
  { id: 92, prefix: '1000517', nome: 'São Paulo (Rio Pinheiros — Estrutura de Retiro)', curto: 'Pinheiros – Retiro', trecho: 'Pinheiros' },
];

/** As 4 estações fixas da propagação da cheia no Tietê, na ordem da tabela. */
export const PROPAGACAO = [
  { id: 33209, rotulo: 'Mogi / Estaleiro' },
  { id: 35335, rotulo: 'Jardim Helena' },
  { id: 35320, rotulo: 'Itaim Biacica' },
  { id: 35423, rotulo: 'Itaquaquecetuba' },
];

export const PENHA_MONTANTE = 33675;
export const PENHA_JUSANTE = 33762;

/** Comportas no SIBH (API v1 /dams): 1 = Barragem da Penha, 2 = Barragem Móvel. */
export const BARRAGEM_PENHA = 1;
export const BARRAGEM_MOVEL = 2;

/**
 * Colunas da planilha horária da EMAE (índice 0-based: A = 0, B = 1…), as
 * mesmas do CSV que o sumário tradicional importa à mão.
 */
export type EstruturaEmae = { nome: string; cota: number; vazao: number | null; volumeUtil?: 'Billings' | 'Guarapiranga' };
export const MAPA_PLANILHA: EstruturaEmae[] = [
  { nome: 'Barragem Móvel', cota: 8, vazao: null }, // I
  { nome: 'Estrutura de Retiro', cota: 7, vazao: 9 }, // H, J
  { nome: 'Pinheiros Inferior', cota: 5, vazao: 6 }, // F, G
  { nome: 'Pinheiros Superior', cota: 4, vazao: 6 }, // E, G
  { nome: 'Pedreira', cota: 2, vazao: 3 }, // C, D
  { nome: 'Billings', cota: 1, vazao: 24, volumeUtil: 'Billings' }, // B, Y
  { nome: 'Guarapiranga', cota: 20, vazao: 21, volumeUtil: 'Guarapiranga' }, // U, V
  { nome: 'Edgard de Souza', cota: 12, vazao: 13 }, // M, N
  { nome: 'Pirapora', cota: 14, vazao: 15 }, // O, P
  { nome: 'Rasgão', cota: 16, vazao: 17 }, // Q, R
  { nome: 'Porto Goés', cota: 18, vazao: 19 }, // S, T
];

/** Cotas da EMAE (referencial EPUSP) + 1,39 m = referencial IGG, o da SP Águas. */
export const OFFSET_IGG = 1.39;

/** Linhas da tabela "Situação atual das estruturas", por eixo, na ordem do sumário tradicional. */
export const EIXOS: { eixo: string; destaque?: boolean; estruturas: string[] }[] = [
  { eixo: 'TIETÊ', estruturas: ['Barragem da Penha', 'Barragem Móvel'] },
  { eixo: 'PINHEIROS', destaque: true, estruturas: ['Estrutura de Retiro', 'Pinheiros Inferior', 'Pinheiros Superior', 'Pedreira'] },
  { eixo: 'RESERVATÓRIOS', estruturas: ['Billings', 'Guarapiranga', 'Edgard de Souza', 'Pirapora', 'Rasgão', 'Porto Goés'] },
];

/** Linhas da "Situação operacional das estruturas". `fonte: null` = sem fonte automática. */
export const OPERACIONAL: { nome: string; local: string; fonte: 'penha' | 'movel' | 'retiro' | 'usina-sp' | 'pedreira' | null }[] = [
  { nome: 'Barragem da Penha', local: 'Tietê', fonte: 'penha' },
  { nome: 'Pôlderes Marginal', local: 'Tietê', fonte: null },
  { nome: 'Barragem Móvel', local: 'Tietê', fonte: 'movel' },
  { nome: 'Edgard de Souza / Rasgão / Pirapora', local: 'Tietê', fonte: null },
  { nome: 'Retiro', local: 'Pinheiros', fonte: 'retiro' },
  { nome: 'Usina São Paulo', local: 'Pinheiros', fonte: 'usina-sp' },
  { nome: 'Usina Pedreira', local: 'Pinheiros', fonte: 'pedreira' },
];

/** Códigos IBGE dos 39 municípios da RMSP (chuva observada). */
export const RMSP_COD_IBGE = new Set(dados.rmspCodIbge);

/** Centros da grade de 0,1° dentro da RMSP, [lat, lon] (previsão de chuva). */
export const GRADE_PREVISAO_RMSP = dados.gradePrevisaoRmsp as [number, number][];

/**
 * Vazão da Barragem da Penha (m³/s) pela curva de descarga: nível de montante
 * (m) × comportas abertas (0–6). Fora da faixa, usa a linha da borda.
 */
export function vazaoPenha(nivel: number | null, comportasAbertas: number): number | null {
  if (nivel === null || !Number.isFinite(nivel)) return null;
  const { inicio, passo, linhas } = dados.curvaVazaoPenha;
  const i = Math.min(linhas.length - 1, Math.max(0, Math.round((nivel - inicio) / passo)));
  return linhas[i]![Math.min(6, Math.max(0, comportasAbertas))] ?? null;
}

/** % do volume útil pela curva cota × volume, com a cota no referencial da EMAE. */
export function volumeUtil(reservatorio: 'Billings' | 'Guarapiranga', cotaEmae: number): number | null {
  const curva = (dados.curvaVolumeUtil as Record<string, { inicio: number; passo: number; pct: number[] }>)[reservatorio];
  if (!curva || !Number.isFinite(cotaEmae)) return null;
  const i = Math.min(Math.max(Math.round((cotaEmae - curva.inicio) / curva.passo), 0), curva.pct.length - 1);
  return curva.pct[i] ?? null;
}
