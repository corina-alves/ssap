import { COBERTURA_MIN, PASSO_GRAUS, RAIO_KM } from '@/lib/climatologia/espacial';
import { FRACAO_NORMAL, MAX_DIAS_ACUMULO, MIN_ANOS_MEDIA, PERIODO_PADRAO } from '@/lib/climatologia/regras';
import { MAX_CHUVA_DIA_MM, MAX_REGISTRO_MM } from '@/lib/climatologia/regras-telemetria';
import { INICIO_RECENTE } from '@/lib/climatologia/selecao';

/**
 * Metodologia do Painel de Climatologia por UGRHI — o texto que o painel e o
 * relatório em PDF mostram. Os números vêm das mesmas constantes do cálculo
 * (src/lib/climatologia), então texto e conta não se separam.
 */

export const FONTE_CLIMATOLOGIA =
  'SIBH/SP Águas — acervo histórico de chuva diária dos pluviômetros (Banco de Dados Hidrológicos), API pública v1 "historical_measurements"';
export const FONTE_TELEMETRIA = 'SIBH/SP Águas — rede telemétrica de pluviômetros (SP Águas, CEMADEN, ANA, IAC, SABESP, SAISP, INMET), API pública v2 "measurements"';

const [ini, fim] = PERIODO_PADRAO;
const anosNormal = Math.ceil(FRACAO_NORMAL * (fim - ini + 1));

export const METODOLOGIA: { titulo: string; itens: string[] }[] = [
  {
    titulo: 'Dados',
    itens: [
      `Chuva diária (mm) de cada pluviômetro, como está no acervo histórico do SIBH: um valor por dia; dia sem leitura fica sem valor — nunca é tratado como chuva zero.`,
      'Os dados são importados uma vez para o banco da Sala e atualizados só no que mudar; o painel não consulta o SIBH.',
      'O mesmo mês trazido mais de uma vez com valores diferentes é marcado como conflito e não entra no cálculo.',
      'Alguns postos (sobretudo da bacia do Rio Grande) vêm do acervo com um valor a menos que os dias do mês. Pela comparação com os postos vizinhos, os valores são os dias 2 ao fim do mês: o dia 1 não está no acervo e a chuva dele não foi somada a outra leitura. Esses meses não entram no cálculo, em nenhum dos critérios.',
    ],
  },
  {
    titulo: 'Mês válido de um posto do acervo',
    itens: [
      'Critério estrito: todos os dias do mês com leitura.',
      `Critério padrão: também aceita até ${MAX_DIAS_ACUMULO} dias sem leitura quando cada falha termina numa leitura dentro do próprio mês — no pluviômetro convencional, a leitura depois de dias sem observação acumula a chuva desses dias, e o total do mês fica correto.`,
      'Nos dois critérios o mês é descartado se terminar sem leitura (a chuva pode ter sido somada no mês seguinte) ou se o mês anterior terminou sem leitura (a primeira leitura pode carregar chuva dele).',
      `Referência: a OMM (Guide to Climatological Practices, 2011) descarta o mês com 11 ou mais dias faltando ou 5 seguidos, e lembra que o total de chuva é mais sensível a falhas que as médias; por isso o critério de chuva aqui é mais exigente.`,
    ],
  },
  {
    titulo: 'Chuva média da UGRHI',
    itens: [
      'Cada posto pertence à UGRHI pelo limite geográfico oficial (ponto no polígono). Só os postos do litoral que caem fora de todos os polígonos (por causa da simplificação da linha da costa) ficam com a UGRHI do cadastro do SIBH; nos demais, ela fica registrada só para conferência.',
      'Média aritmética (padrão do painel): soma da chuva do mês dos postos da UGRHI com o mês válido, dividida pelo número desses postos. A média climatológica do mês é a média desses valores nos anos válidos do período.',
      `Média ponderada por área (Thiessen), para comparação: a UGRHI é dividida em células de ${PASSO_GRAUS.toLocaleString('pt-BR')}° (~2 km); cada célula fica com o posto válido mais próximo — também de fora da UGRHI — e o peso de cada posto é a área das suas células. Dá menos peso a postos próximos entre si e cobre as áreas sem posto.`,
      'Os pesos do Thiessen são refeitos a cada mês, só com os postos que têm aquele mês válido, porque a rede muda ao longo dos anos. Os pesos usados ficam guardados com cada mês.',
      `Cobertura: % da área da UGRHI a até ${RAIO_KM} km de um posto válido. Nos dois métodos, o mês da UGRHI entra na climatologia com cobertura de ${COBERTURA_MIN}% ou mais — com poucos postos concentrados num canto, a média não representa a UGRHI. Na chuva observada, um mês com cobertura menor aparece com a média dos postos que há, marcado como "cobertura baixa".`,
    ],
  },
  {
    titulo: 'Chuva observada pela rede telemétrica (API v2)',
    itens: [
      'A API v2 do SIBH não tem série longa: a rede telemétrica começa em ~2016 no CEMADEN e em 2025 na maior parte das outras redes (nada antes de 2012). Por isso a média climatológica vem do acervo, e a v2 dá a chuva observada recente.',
      'Uma consulta por dia de Brasília traz todos os pluviômetros (total, número de registros, primeiro e último horário). A janela termina 5 min depois da meia-noite para o registro da meia-noite não entrar em dois dias. Agrupar por dia (group_type=day) não alivia o servidor: custa o mesmo que por minuto ou por hora, e janelas de 3 meses passam do tempo limite.',
      'Dia completo: todos os registros esperados (1.440 ÷ intervalo de transmissão; mais, se o posto manda mais), o primeiro na primeira hora e o último na última. Registro que falta é chuva desconhecida: na telemetria não há acúmulo na leitura seguinte.',
      'Mês válido — estrito: todos os dias completos. Padrão: dias com no máximo 1 h sem registro e, no mês, no máximo 1% dos registros esperados faltando (~7 h).',
      `Valor impossível descarta o dia (e o mês do posto): total negativo, mais de ${MAX_CHUVA_DIA_MM} mm no dia (o recorde do estado é ~683 mm em 24 h) ou um único registro acima de ${MAX_REGISTRO_MM.ateMeiaHora} mm (intervalo de até 30 min) ou de ${MAX_REGISTRO_MM.hora} mm (1 h). É falha do posto, não chuva: em outubro de 2026, por exemplo, um posto em Angatuba marcou 190,6 mm em 10 min e 439 mm no dia, com os vizinhos entre 24 e 54 mm.`,
      'Cada dia é consultado uma vez e fica guardado no banco; o servidor confere os 3 últimos dias a cada hora até 30 h depois do fim do dia (transmissões atrasadas). O painel não consulta o SIBH.',
      'A média da UGRHI e a do município usam as mesmas contas do acervo, com os postos telemétricos que têm o mês válido.',
      'Mês em andamento: a chuva acumulada vai do dia 1 até o último dia encerrado e é comparada com a média do mês inteiro (o painel indica até que dia). O posto entra se tiver todos esses dias aceitos.',
    ],
  },
  {
    titulo: 'Municípios e estações',
    itens: [
      'O município de cada posto é o do cadastro v2 do SIBH (código IBGE).',
      'Chuva do município: média, mês a mês, dos postos do município com o mês válido. A média histórica do município é a mesma conta com o acervo, com as mesmas regras de normal (24 de 30 anos) e de média histórica (10 anos ou mais).',
      'Média histórica da estação: a da própria série no acervo. Posto telemétrico sem série no acervo é comparado com a média histórica do município, e isso fica indicado.',
    ],
  },
  {
    titulo: 'Chuva do mês por UGRHI (formato do boletim)',
    itens: [
      'Chuva máxima: o maior acumulado do mês entre os postos da UGRHI com o mês válido. Média mensal: a soma dos acumulados desses postos dividida pelo número deles.',
      `Média histórica mensal: a média do mês de cada posto da UGRHI no acervo, com todos os anos que ele tem (desde o início da série, mínimo de ${MIN_ANOS_MEDIA} anos válidos), somadas e divididas pelo número de postos. Não depende do período de referência nem da cobertura da UGRHI, por isso todas as UGRHIs com posto no acervo têm valor.`,
      'Os postos da média histórica (acervo) não são os mesmos da chuva do mês quando ela vem da telemetria. Onde há poucos postos no acervo (Sapucaí-Mirim/Grande e Baixo Pardo/Grande, em que a maior parte dos meses vem sem o dia 1), a média histórica é a de 1 posto — a tabela mostra quantos postos entraram.',
    ],
  },
  {
    titulo: 'Médias climatológicas',
    itens: [
      'Média de cada mês: MC(m) = Σ P(m, ano) / N, com P a chuva média da UGRHI no mês e N os anos com o mês válido no período.',
      'Média anual: soma das 12 médias mensais, quando os 12 meses têm média.',
      `Normal climatológica ${ini}–${fim}: só quando o mês tem dado válido em pelo menos ${Math.round(FRACAO_NORMAL * 100)}% dos anos (${anosNormal} de ${fim - ini + 1}), como recomenda a OMM (WMO-No. 1203); a anual é normal só se os 12 meses forem.`,
      `Com menos anos — e pelo menos ${MIN_ANOS_MEDIA} — o valor aparece como "média histórica do período disponível", com a lista dos anos usados. Abaixo de ${MIN_ANOS_MEDIA} anos não há média.`,
      `Outros períodos de referência: 1981–2010 e 1961–1990 (normais anteriores da OMM) e ${INICIO_RECENTE} até hoje. O período recente tem menos de 30 anos, então nunca é chamado de normal: é a média histórica dos anos que o acervo tem (hoje, ${INICIO_RECENTE} a 2023; 2024 tem poucos meses), com as mesmas regras de mês válido e de ${MIN_ANOS_MEDIA} anos no mínimo. Os anos seguintes entram quando o acervo for atualizado; a rede telemétrica não entra na média.`,
      `No período recente a rede do acervo é menor (~500 postos por ano, contra ~1.000 nos anos 1990): menos municípios têm média. A UGRHI 14 fica sem média (de 67 postos sobram 19, e a cobertura não chega a ${COBERTURA_MIN}% na maioria dos meses), e a 18 também (a maior parte dos meses dos postos dela vem sem o dia 1).`,
    ],
  },
  {
    titulo: 'Limitações',
    itens: [
      'O acervo é a rede de pluviômetros da SP Águas/DAEE; a quantidade de postos muda bastante entre as décadas e entre as UGRHIs (o painel mostra quantos foram usados em cada mês).',
      'O acervo termina entre 2023 e 2024. Os meses seguintes vêm da rede telemétrica, que é outra rede: outros postos e sensores, e o dia de 00h a 24h em vez da leitura das 7h. Só 21 postos telemétricos da SP Águas também têm série no acervo. O % da média compara duas redes: trate como indicação até a comparação no período em que as duas se sobrepõem.',
      'No CEMADEN chegam registros extras de 10 min quando chove: num dia chuvoso, uma hora sem registro pode não baixar a contagem abaixo do esperado.',
      'Dias com acúmulo (critério padrão) mantêm o total do mês, mas a chuva diária desses dias fica concentrada no dia da leitura.',
      'O horário de corte do dia no pluviômetro convencional (normalmente 7h) não vem no dado.',
      'Onde a maior parte dos postos vem do acervo sem o dia 1 de cada mês (bacia do Rio Grande), a cobertura não chega ao mínimo e a UGRHI fica sem média até o acervo ser corrigido ou complementado por outra fonte oficial.',
      'Nas UGRHIs de serra (Mantiqueira, Litoral Norte e Baixada Santista) a chuva varia muito em poucos quilômetros e os postos ficam sobretudo nas partes baixas: a média por postos tende a ficar abaixo da precipitação de longo período estimada pelo DAEE com isoietas, que considera os máximos da encosta.',
    ],
  },
];
