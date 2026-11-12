import 'server-only';
import { CAPIVARI } from '@/conteudo/boletim-ribeira';
import { MAPA_PLANILHA, PENHA_JUSANTE, PENHA_MONTANTE } from '@/conteudo/sumario-automatico-tp';
import * as rb from '../boletins-sala/boletim-ribeira';
import { textoVolumeCopel } from '../boletins-sala/boletim-ribeira-regras';
import * as tp from '../boletins-sala/sumario-automatico-tp';
import type { Dado } from '../integracoes/comum';
import {
  CLASSE_SITUACAO,
  contarSituacoes,
  ordenarPontos,
  piorSituacao,
  TEXTO_SITUACAO,
  type EstruturaPainel,
  type IndicadorPainel,
  type OperacaoPainel,
  type PontoPainel,
  type SistemaPainel,
  type PainelMonitoramento,
} from './painel-monitoramento-regras';

/**
 * Painel de Monitoramento Hidrológico e Operacional (/acesso/painel_monitoramento):
 * resumo dos dois Sumários Executivos automáticos, Tietê-Pinheiros e Ribeira de
 * Iguape, com as mesmas fontes e regras deles (sumario-automatico-tp.ts e
 * boletim-ribeira.ts). Nada é calculado de novo aqui: só junta, conta e ordena.
 */

export * from './painel-monitoramento-regras';

const tendencia = (v: number | null) => (v === null ? '—' : v > 0 ? '↑ Subida' : v < 0 ? '↓ Queda' : '→ Estável');
const fmt = (n: number | null | undefined, casas = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const maior = (...t: (number | null | undefined)[]) => Math.max(0, ...t.map((x) => x ?? 0)) || null;
const aviso = <T>(d: Dado<T>, o_que: string) => (d.ok ? [] : [`${o_que}: ${d.mensagem}`]);

/** O 1º ponto da lista ordenada: o mais grave ou, com todos normais, o mais perto da cota de extravasamento. */
const rotuloCritico = (p: PontoPainel | undefined) => (p?.situacao === 'NORMAL' ? 'Mais perto do extravasamento' : 'Ponto mais crítico');

function indicadorPonto(rotulo: string, p: PontoPainel | undefined): IndicadorPainel {
  return {
    rotulo,
    local: p?.nome ?? '—',
    valor: fmt(p?.nivel),
    unidade: 'm',
    detalhe: p?.rio ?? null,
    variacao: p?.variacao24h ?? null,
    selo: p?.situacao ? TEXTO_SITUACAO[p.situacao] : (p?.rotulo ?? 'Sem dado'),
    classe: p?.classe ?? 'semdado',
  };
}

function resumo(pontos: PontoPainel[]) {
  const s = pontos.map((p) => p.situacao);
  return { situacao: piorSituacao(s), contagem: contarSituacoes(s), semSituacao: s.filter((x) => x === null).length };
}

// ---------------------------------------------------------------- Tietê-Pinheiros

async function tietePinheiros(): Promise<SistemaPainel> {
  const ref = tp.referencias();
  const [n, c, ch, e] = await Promise.all([tp.niveis(ref), tp.comportas(), tp.chuva(), tp.emae(ref)]);

  const pontos = ordenarPontos(
    (n.ok ? n.dados.pontos : []).map((p): PontoPainel & { acima: number | null } => {
      const situacao = p.atual === null || !p.cotas ? null : p.situacao;
      return {
        id: p.id,
        nome: p.curto,
        rio: p.trecho,
        nivel: p.atual,
        em: p.atualEm,
        variacao24h: p.variacao24h,
        situacao,
        rotulo: p.atual === null ? 'Sem dado' : !p.cotas ? 'Sem cotas' : TEXTO_SITUACAO[p.situacao],
        classe: situacao ? CLASSE_SITUACAO[situacao] : 'semdado',
        acima: p.acima,
      };
    }),
    (p) => p.acima,
  );
  const ponto = (id: number) => pontos.find((p) => p.id === id);
  const mont = n.ok ? n.dados.pontos.find((p) => p.id === PENHA_MONTANTE) : undefined;
  const jus = n.ok ? n.dados.pontos.find((p) => p.id === PENHA_JUSANTE) : undefined;
  const penha = c.ok ? c.dados.penha : null;
  const movel = c.ok ? c.dados.movel : null;
  const op = e.ok ? e.dados.operacao : null;
  const est = (nome: string) => (e.ok ? e.dados.estruturas[nome] : undefined);
  const vazaoPenha = tp.vazaoBarragemPenha(mont?.atual ?? null, penha);

  const operacao: OperacaoPainel[] = [
    { nome: 'Barragem da Penha', estado: penha ? `${penha.abertas} de ${penha.total} comportas abertas` : 'Sem dado', classe: penha ? 'info' : 'semdado' },
    { nome: 'Barragem Móvel', estado: movel ? tp.textoMovel(movel).join('; ') : 'Sem dado', classe: movel ? 'info' : 'semdado' },
    { nome: 'Estrutura de Retiro', estado: op?.retiro ?? 'Sem dado', classe: op?.retiro ? 'info' : 'semdado' },
    { nome: 'Usina São Paulo (Traição)', estado: op?.usinaSp ?? 'Sem dado', classe: op?.usinaSp ? 'info' : 'semdado' },
    { nome: 'Usina Pedreira', estado: op?.pedreira ?? 'Sem dado', classe: op?.pedreira ? 'info' : 'semdado' },
  ];
  const estadoOp = (nome: string) => operacao.find((o) => o.nome === nome)?.estado ?? '—';

  // Estruturas: a Barragem da Penha pelo SIBH, as demais pela EMAE (SAISP), na ordem do sumário.
  const estruturas: EstruturaPainel[] = [
    {
      nome: 'Barragem da Penha',
      tipo: 'Barragem',
      local: 'Tietê',
      nivel: mont?.atual ?? null,
      vazao: vazaoPenha,
      variacao24h: mont?.variacao24h ?? null,
      estado: `${estadoOp('Barragem da Penha')} · jusante ${fmt(jus?.atual)} m`,
      classe: mont?.atual != null ? 'info' : 'semdado',
      fonte: 'SIBH',
    },
    ...MAPA_PLANILHA.map((m): EstruturaPainel => {
      const x = est(m.nome);
      const estado =
        m.nome === 'Barragem Móvel'
          ? estadoOp('Barragem Móvel')
          : m.nome === 'Estrutura de Retiro'
            ? estadoOp('Estrutura de Retiro')
            : m.nome === 'Pinheiros Inferior' || m.nome === 'Pinheiros Superior'
              ? `Usina São Paulo: ${estadoOp('Usina São Paulo (Traição)')}`
              : m.nome === 'Pedreira'
                ? estadoOp('Usina Pedreira')
                : x?.volumePct != null
                  ? `${fmt(x.volumePct)}% do volume útil`
                  : tendencia(x?.variacao24h ?? null);
      return {
        nome: m.nome,
        tipo: m.volumeUtil ? 'Reservatório' : /Pinheiros|Retiro|Móvel/.test(m.nome) ? 'Estrutura' : 'Usina / barragem',
        local: ['Barragem Móvel', 'Edgard de Souza', 'Pirapora', 'Rasgão', 'Porto Goés'].includes(m.nome) ? 'Tietê' : m.volumeUtil ? 'Reservatórios' : 'Pinheiros',
        nivel: x?.cota ?? null,
        vazao: x?.vazao ?? null,
        variacao24h: x?.variacao24h ?? null,
        estado,
        classe: x?.cota != null ? 'info' : 'semdado',
        fonte: 'EMAE (SAISP)',
      };
    }),
  ];

  const billings = est('Billings');
  const guarapiranga = est('Guarapiranga');
  const critico = pontos.find((p) => p.situacao !== null);
  const indicadores: IndicadorPainel[] = [
    indicadorPonto(rotuloCritico(critico), critico),
    indicadorPonto('Rio Tietê', ponto(33758)), // Ponte do Piqueri
    {
      rotulo: 'Barragem da Penha',
      local: 'Vazão pela curva de descarga',
      valor: fmt(vazaoPenha, vazaoPenha !== null && !Number.isInteger(vazaoPenha) ? 1 : 0),
      unidade: 'm³/s',
      detalhe: penha ? `${penha.abertas} de ${penha.total} comportas abertas` : null,
      variacao: null,
      selo: penha ? 'Operando' : 'Sem dado',
      classe: penha ? 'info' : 'semdado',
    },
    {
      rotulo: 'Billings e Guarapiranga',
      local: 'Volume útil (EMAE)',
      valor: `${fmt(billings?.volumePct, 1)}% · ${fmt(guarapiranga?.volumePct, 1)}%`,
      unidade: '',
      detalhe: `cotas ${fmt(billings?.cota)} m e ${fmt(guarapiranga?.cota)} m (IGG)`,
      variacao: null,
      selo: e.ok ? 'EMAE' : 'Sem dado',
      classe: e.ok ? 'info' : 'semdado',
    },
  ];

  return {
    chave: 'tiete-pinheiros',
    nome: 'Sistema Tietê–Pinheiros',
    descricao: 'Níveis do Tietê, do Pinheiros e afluentes na RMSP, barragens e estruturas da EMAE.',
    imagem: '/acesso/sumario_executivo_cheias/img/diagrama.png',
    publico: '/boletins/automatico/tiete-pinheiros',
    sumario: '/acesso/sumarios_cheias/tiete_pinheiros',
    ...resumo(pontos),
    pontos,
    estruturas,
    indicadores,
    operacao,
    chuva: ch.ok ? { regiao: 'RMSP', ...ch.dados } : null,
    atualizadoEm: maior(n.ok ? n.dados.atualizadoEm : null, e.ok ? e.dados.lidoEm : null),
    avisos: [...aviso(n, 'Níveis (SIBH)'), ...aviso(c, 'Comportas (SIBH)'), ...aviso(e, 'Estruturas (EMAE)'), ...aviso(ch, 'Chuva')],
  };
}

// ---------------------------------------------------------------- Ribeira de Iguape

async function ribeira(): Promise<SistemaPainel> {
  const ref = rb.referencias();
  const [n, e, ch, copel] = await Promise.all([rb.niveis(ref), rb.estruturas(ref), rb.chuva(ref), rb.volumeCopel(ref)]);

  const pontos = ordenarPontos(
    (n.ok ? n.dados.pontos : []).map((p): PontoPainel & { acima: number | null } => {
      const situacao = p.semDado || p.semCotas ? null : p.situacao;
      return {
        id: p.id,
        nome: p.curto,
        rio: p.trecho,
        nivel: p.atual,
        em: p.atualEm,
        variacao24h: p.variacao,
        situacao,
        rotulo: p.semDado ? 'Sem dado' : p.semCotas ? 'Sem cotas' : TEXTO_SITUACAO[p.situacao],
        classe: situacao ? CLASSE_SITUACAO[situacao] : 'semdado',
        acima: p.acima,
      };
    }),
    (p) => p.acima,
  );
  const ponto = (id: number) => pontos.find((p) => p.id === id);
  const cap = e.ok ? e.dados.capivari : null;
  const vol = textoVolumeCopel(copel);

  const estruturas: EstruturaPainel[] = [
    {
      nome: 'Barragem Capivari',
      tipo: 'UHE (Copel)',
      local: 'Rio Capivari',
      nivel: cap?.cota ?? null,
      vazao: cap?.vazao ?? null,
      variacao24h: cap?.variacaoCota ?? null,
      estado: `Volume útil ${vol.valor}`,
      classe: cap?.cota != null ? 'info' : 'semdado',
      fonte: 'SIBH / Copel',
    },
    ...(e.ok ? e.dados.barramentos : []).map(
      (b): EstruturaPainel => ({
        nome: b.nome.replace(/^[^(]*\((.*)\)$/, '$1').replace(' — Barramento', ''),
        tipo: /PCH/.test(b.nome) ? 'PCH' : 'UHE',
        local: b.nome.split(' (')[0]!,
        nivel: b.atual,
        vazao: b.jusante,
        variacao24h: b.variacao,
        estado: tendencia(b.variacao),
        classe: b.atual !== null ? 'info' : 'semdado',
        fonte: 'SIBH',
      }),
    ),
  ];

  const comLeitura = e.ok ? e.dados.barramentos.filter((b) => b.atual !== null).length : 0;
  const operacao: OperacaoPainel[] = [
    {
      nome: 'Barragem Capivari (Copel)',
      estado: cap?.vazao != null ? `Vazão ${fmt(cap.vazao, 1)} m³/s · cota ${fmt(cap.cota)} m` : 'Sem dado',
      classe: cap?.vazao != null ? 'info' : 'semdado',
    },
    { nome: 'Volume útil do Capivari', estado: vol.valor === '—' ? 'Aguardando a Copel' : vol.valor, classe: copel.estado === 'ok' ? 'info' : 'semdado' },
    { nome: 'Barramentos do Alto Juquiá', estado: e.ok ? `${comLeitura} de ${e.dados.barramentos.length} com leitura` : 'Sem dado', classe: comLeitura ? 'info' : 'semdado' },
  ];

  const critico = pontos.find((p) => p.situacao !== null);
  const indicadores: IndicadorPainel[] = [
    indicadorPonto(rotuloCritico(critico), critico),
    indicadorPonto('Rio Ribeira de Iguape', ponto(26243)), // Registro
    {
      rotulo: 'Reservatório Capivari',
      local: CAPIVARI.nome,
      valor: vol.valor.replace('%', ''),
      unidade: copel.estado === 'ok' ? '% vol. útil' : '',
      detalhe: vol.detalhe,
      variacao: null,
      selo: copel.estado === 'ok' ? 'Copel' : 'Sem dado',
      classe: copel.estado === 'ok' ? 'info' : 'semdado',
    },
  ];

  return {
    chave: 'ribeira',
    nome: 'Sistema Ribeira de Iguape',
    descricao: 'Níveis do Ribeira de Iguape e afluentes, Barragem Capivari e barramentos do Alto Juquiá.',
    imagem: '/acesso/sumario_executivo_cheias/img/diagrama_vale_do_ribeira.png',
    publico: '/boletins/automatico/vale-do-ribeira',
    sumario: '/acesso/sumarios_cheias/ribeira_iguape',
    ...resumo(pontos),
    pontos,
    estruturas,
    indicadores,
    operacao,
    chuva: ch.ok ? { regiao: 'UGRHI 11', ultimas3h: ch.dados.ultimas3h, ultimas24h: ch.dados.ultimas24h, previsao24h: ch.dados.previsao24h, postos: ch.dados.postos } : null,
    atualizadoEm: maior(n.ok ? n.dados.atualizadoEm : null, cap?.cotaEm),
    avisos: [...aviso(n, 'Níveis (SIBH)'), ...aviso(e, 'Estruturas (SIBH)'), ...aviso(ch, 'Chuva')],
  };
}

/** Os dois sistemas, buscados em paralelo (cada fonte falha sozinha). */
export async function painelMonitoramento(): Promise<PainelMonitoramento> {
  const sistemas = await Promise.all([tietePinheiros(), ribeira()]);
  return { sistemas, atualizadoEm: maior(...sistemas.map((s) => s.atualizadoEm)), geradoEm: Date.now() };
}
