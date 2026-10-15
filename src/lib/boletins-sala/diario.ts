import { painelReservatorios } from '../hidrologia/reservatorios';
import { chuvaEstado, classificar, coordenadasPostos, SITUACOES, situacaoRios, UGRHIS, type PontoChuvaEstado, type Posto, type Situacao } from '../hidrologia/situacao-rios';
import { hojeSp, normalizar } from '../integracoes/comum';
import { contornoSP, malhaMunicipiosSP, municipiosSP } from '../integracoes/ibge';
import { ID_SIM, resumoRecente } from '../integracoes/sabesp';
import { instante, medicoes } from '../integracoes/sibh-medicoes';

/**
 * Dados do Boletim Diário da Sala de Situação Alfredo Pisani (SSAP):
 *   - chuva acumulada em 24 h (das 07h às 07h) nos pluviômetros do estado
 *     (SIBH), por município e por UGRHI, a interpolação IDW por município e o
 *     acumulado do mês;
 *   - situação dos postos fluviométricos (cotas de alerta do SIBH) e o gráfico
 *     de 24 h dos postos em extravasamento;
 *   - sistemas produtores da RMSP (SABESP/ANA);
 *   - chuva de 72 h por município, para a tabela do PPDC.
 * O que não tem fonte automática (histórico mensal, limiares do PPDC, imagem
 * de previsão, textos de análise) é preenchido na tela. As imagens de radar
 * vêm de ./radares.ts.
 */

export const SALA_DIARIO = 'alfredo-pisani';
export const PERMISSAO_DIARIO = 'criar_boletim';

/** Parâmetros da interpolação (os mesmos citados no boletim). */
export const IDW = { potencia: 2, suavizacao: 0.02, raioGraus: 0.5 } as const;
const MAX_EXTRAVASAMENTOS = 3;
const DIA_MS = 86_400_000;

/**
 * Fim da janela do boletim: as 07h (horário de São Paulo, UTC−3) mais recentes.
 * O período vai das 07h do dia anterior até esse instante.
 */
export function fimDaJanela(agora = Date.now()): number {
  const SP = 3 * 3_600_000;
  const seteHoje = Math.floor((agora - SP) / DIA_MS) * DIA_MS + 7 * 3_600_000 + SP;
  return seteHoje <= agora ? seteHoje : seteHoje - DIA_MS;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

const fmtHoraSp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** "2026-10-09 07:00" no horário de São Paulo. */
const horaSp = (ms: number) => fmtHoraSp.format(new Date(ms));

/** Valor interpolado no ponto: média dos postos dentro do raio, com peso 1/(d² + s²)^(p/2). null = nenhum posto no raio. */
export function idw(lat: number, lng: number, postos: { lat: number; lng: number; v: number }[]): number | null {
  let soma = 0;
  let pesos = 0;
  for (const p of postos) {
    const d2 = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d2 > IDW.raioGraus ** 2) continue;
    const w = 1 / (d2 + IDW.suavizacao ** 2) ** (IDW.potencia / 2);
    soma += w * p.v;
    pesos += w;
  }
  return pesos ? r1(soma / pesos) : null;
}

/** Centro aproximado do município: média dos vértices do anel externo. */
function centro(anel: [number, number][]): { lat: number; lng: number } {
  const n = anel.length || 1;
  return { lng: anel.reduce((t, p) => t + p[0], 0) / n, lat: anel.reduce((t, p) => t + p[1], 0) / n };
}

/** Por município: maior acumulado, média dos postos e quantos postos. Do maior para o menor. */
function porMunicipio(postos: PontoChuvaEstado[]) {
  const mapa = new Map<string, { cidade: string; maxima: number; soma: number; postos: number }>();
  for (const p of postos) {
    if (!p.c) continue;
    const m = mapa.get(p.c) ?? { cidade: p.c, maxima: 0, soma: 0, postos: 0 };
    m.maxima = Math.max(m.maxima, p.v);
    m.soma += p.v;
    m.postos++;
    mapa.set(p.c, m);
  }
  return [...mapa.values()]
    .map((m) => ({ cidade: m.cidade, maxima: r1(m.maxima), media: r1(m.soma / m.postos), postos: m.postos }))
    .sort((a, b) => b.maxima - a.maxima || a.cidade.localeCompare(b.cidade, 'pt-BR'));
}

/** Nível de 24 h de um posto em extravasamento, com o tempo em cada situação. */
async function extravasamento(p: Posto, ini: number, fim: number) {
  const chave = `diario-nivel:${p.id}:${Math.floor(fim / 600_000)}`;
  const med = (await medicoes('boletim_diario', { [chave]: { ids: [Number(p.id)], ini, fim, grupo: 'minute', ttlSeg: 600 } }))[chave];
  const serie = (med ?? [])
    .flatMap(([, d, v]): [number, number][] => (v === null ? [] : [[instante(d), r2(v / 100)]])) // cm → m
    .filter(([t]) => Number.isFinite(t))
    .sort((a, b) => a[0] - b[0]);
  const tempo = Object.fromEntries(Object.keys(SITUACOES).map((k) => [k, 0])) as Record<Situacao, number>;
  for (const [, nivel] of serie) tempo[classificar(nivel, p.cotas).situacao]++;
  const cota = p.cotas.extravasamento;
  const acima = cota === null ? [] : serie.filter(([, n]) => n >= cota);
  return {
    id: p.id,
    prefixo: p.prefixo,
    nome: p.nome,
    cidade: p.cidade,
    ugrhi: UGRHIS[p.ugrhi] ?? '',
    cota,
    situacao: p.situacao,
    serie: serie.map(([t, n]) => [horaSp(t), n] as [string, number]),
    percentual: Object.fromEntries(Object.entries(tempo).map(([k, n]) => [k, serie.length ? r2((100 * n) / serie.length) : 0])) as Record<Situacao, number>,
    inicio: acima.length ? horaSp(acima[0]![0]) : null,
    fim: acima.length ? horaSp(acima.at(-1)![0]) : null,
    duracaoMin: acima.length ? Math.round((acima.at(-1)![0] - acima[0]![0]) / 60_000) : null,
    nivelMaximo: serie.length ? Math.max(...serie.map(([, n]) => n)) : null,
  };
}

export async function dadosDiario(atualizar = false) {
  const falhas: string[] = [];
  const agora = Date.now();
  const hoje = hojeSp();

  const fim = fimDaJanela(agora);
  // do dia 1º do mês (07h) até o fim da janela, em pedaços de até 72 h (limite do SIBH)
  const inicioMes = Date.parse(`${horaSp(fim).slice(0, 7)}-01T07:00:00-03:00`);
  const pedacos: [horas: number, ate: number][] = [];
  for (let ate = fim; ate > inicioMes; ) {
    const dias = Math.min(3, Math.round((ate - inicioMes) / DIA_MS));
    pedacos.push([dias * 24, ate]);
    ate -= dias * DIA_MS;
  }

  const [chuva24, chuva72, doMes, situacao, coordenadas, contorno, malha, municipios, reservatorios, sabesp] = await Promise.all([
    chuvaEstado(24, fim),
    chuvaEstado(72, fim),
    Promise.all(pedacos.map(([horas, ate]) => chuvaEstado(horas, ate))),
    situacaoRios(atualizar),
    coordenadasPostos(),
    contornoSP(),
    malhaMunicipiosSP(),
    municipiosSP(),
    painelReservatorios(hoje),
    resumoRecente(hoje, 5),
  ]);
  if (chuva24.falhou || chuva72.falhou) falhas.push('chuva acumulada (SIBH)');
  if (doMes.some((p) => p.falhou)) falhas.push('chuva acumulada do mês (SIBH)');

  // ---- Acumulado do mês: soma, pedaço a pedaço, da média dos postos do município (e da UGRHI)
  const mesCidade = new Map<string, number>();
  const mesUgrhi = new Map<number, number>();
  for (const pedaco of doMes) {
    for (const c of porMunicipio(pedaco.postos)) mesCidade.set(c.cidade, (mesCidade.get(c.cidade) ?? 0) + c.media);
    const porU = new Map<number, number[]>();
    for (const p of pedaco.postos) porU.set(p.u, [...(porU.get(p.u) ?? []), p.v]);
    for (const [u, vs] of porU) mesUgrhi.set(u, (mesUgrhi.get(u) ?? 0) + vs.reduce((a, b) => a + b, 0) / vs.length);
  }
  falhas.push(...situacao.falhas);
  if (!malha.ok || !contorno.ok) falhas.push('malha de municípios (IBGE)');
  if (!reservatorios.ok) falhas.push('sistemas produtores (SABESP)');

  // ---- Pluviometria (24 h)
  const postos = chuva24.postos;
  const cidades24 = porMunicipio(postos);
  const ugrhis = Object.entries(UGRHIS).map(([cod, nome]) => {
    const vs = postos.filter((p) => p.u === Number(cod)).map((p) => p.v);
    const mes = mesUgrhi.get(Number(cod));
    return { codigo: Number(cod), nome, media: vs.length ? r1(vs.reduce((a, b) => a + b, 0) / vs.length) : null, mes: mes === undefined ? null : r1(mes), postos: vs.length };
  });

  // ---- Malha: nome e valor interpolado de cada município
  const nomes = new Map((municipios.ok ? municipios.dados : []).map((m) => [m.codigoIbge, m.nome]));
  const max72 = new Map(porMunicipio(chuva72.postos).map((c) => [normalizar(c.cidade), c.maxima]));
  const municipiosMapa = (malha.ok ? malha.dados : []).map((m) => {
    const c = centro(m.aneis[0] ?? []);
    const nome = nomes.get(m.codigo) ?? '';
    return {
      codigo: m.codigo,
      nome,
      aneis: m.aneis.map((a) => a.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as [number, number])),
      idw: idw(c.lat, c.lng, postos),
      chuva72: max72.get(normalizar(nome)) ?? null,
    };
  });

  // ---- Fluviometria
  const contagem = Object.fromEntries(Object.keys(SITUACOES).map((k) => [k, 0])) as Record<Situacao, number>;
  for (const p of situacao.postos) contagem[p.situacao]++;
  const pontos = situacao.postos.flatMap((p) => {
    const c = coordenadas[p.id];
    return c ? [{ id: p.id, nome: p.nome, cidade: p.cidade, situacao: p.situacao, lat: c.lat, lng: c.lng }] : [];
  });
  const emExtravasamento = situacao.postos.filter((p) => p.situacao === 'extravasamento').slice(0, MAX_EXTRAVASAMENTOS);
  const extravasamentos = await Promise.all(
    emExtravasamento.map((p) =>
      extravasamento(p, fim - DIA_MS, fim).catch(() => {
        falhas.push('nível dos postos em extravasamento (SIBH)');
        return null;
      }),
    ),
  );

  // ---- Sistemas produtores
  const r = reservatorios.ok ? reservatorios.dados : null;
  const brutos = sabesp.ok ? sabesp.dados.sistemas : [];
  const sistemas = (r?.sistemas ?? []).map((s) => {
    const b = brutos.find((x) => x.id === s.id);
    return {
      id: s.id,
      nome: s.nome,
      sim: s.id === ID_SIM,
      volume: s.volume,
      volumeAnoAnterior: s.volumeAnoAnterior,
      difAno: s.difAno,
      chuvaDia: s.id === ID_SIM ? null : s.chuvaDia,
      chuvaMes: s.id === ID_SIM ? null : s.chuvaMes,
      chuvaMediaHistorica: s.id === ID_SIM ? null : s.chuvaMediaHistorica,
      afluente: b?.vazaoAfluente ?? b?.vazaoNatural ?? null,
      // defluente = captada + liberada a jusante (aproximação com os campos da SABESP; o boletim original usa o SSD)
      defluente: b && (b.vazaoCaptada !== null || b.vazaoJusante !== null) ? r2((b.vazaoCaptada ?? 0) + (b.vazaoJusante ?? 0)) : null,
    };
  });

  return {
    gerado_em: horaSp(agora),
    periodo: { inicio: horaSp(fim - DIA_MS), fim: horaSp(fim) },
    idw: IDW,
    contorno: contorno.ok ? contorno.dados.flat() : [],
    municipios: municipiosMapa,
    chuva: {
      postos: postos.map((p) => ({ id: p.id, nome: p.n, cidade: p.c, lat: p.lat, lng: p.lng, v: p.v })),
      cidades: cidades24.slice(0, 10).map((c) => ({ ...c, mes: mesCidade.has(c.cidade) ? r1(mesCidade.get(c.cidade)!) : null })),
      ugrhis,
    },
    fluviometria: {
      contagem,
      pontos,
      graves: situacao.postos.filter((p) => p.situacao === 'extravasamento' || p.situacao === 'emergencia').map((p) => ({ nome: p.nome, situacao: p.situacao })),
      situacoes: SITUACOES,
    },
    extravasamentos: extravasamentos.filter((e) => e !== null),
    sistemas: { data: r?.dataUsada ?? null, anoComparacao: r?.anoComparacao ?? null, lista: sistemas },
    ppdc: { cidades: porMunicipio(chuva72.postos).slice(0, 10) },
    falhas: [...new Set(falhas)],
  };
}

export type DadosDiario = Awaited<ReturnType<typeof dadosDiario>>;
