/**
 * Conteúdo da página de homenagem a Alfredo Pisani (/institucional/alfredo-pisani),
 * no texto aprovado pela equipe. Trechos entre ** saem em negrito.
 *
 * Fotos e depoimentos ficam vazios até chegarem os reais: a seção
 * correspondente só aparece quando a lista tiver itens. Fotos vão em
 * public/institucional/alfredo-pisani/.
 */

export type Marco = {
  /** Ano ou período; sem ele, o marco aparece sem data. */
  ano?: string;
  icone: string;
  titulo: string;
  texto: string;
};

export type Foto = { src: string; legenda: string };

export type Depoimento = { texto: string; autor: string };

/** Foto ao lado do texto "Conhecimento, dedicação e compromisso público" (caminho em public/). Sem ela, o texto ocupa a largura toda. */
export const FOTO_SALA: Foto | null = {
  src: '/legado/img/sssp-daee.png',
  legenda: 'Alfredo Pisani apresentando na Sala de Situação, ainda no DAEE',
};

export const LEMA = 'Uma vida dedicada à água, à ciência e à proteção da sociedade';

export const CHAMADA = 'Uma homenagem da Sala de Situação São Paulo a um dos profissionais que ajudaram a construir sua história.';

export const MEMORIA = 'Em memória de Alfredo Pisani († 2025)';

export const INTRODUCAO = [
  '**Alfredo Pisani**, cujo percurso é exemplo de dedicação, rigor e serviço em prol da sociedade. Com formação sólida — graduado em Engenharia Civil pela Fundação Armando Álvares Penteado (1979); mestre (1988) e doutor (1996) em Engenharia Hidráulica e Sanitária pela Escola Politécnica da USP, ele sempre uniu teoria e prática com maestria.',
  'Pioneiro em pesquisas como sensoriamento remoto, uso de satélites em bacias hidrográficas, medição de chuvas por radar e sistemas de alerta de inundações, Alfredo contribuiu para tornar real o monitoramento em tempo real e o alerta civil, salvaguardando vidas diante dos desafios meteorológicos e hidrológicos.',
  'No serviço público, sua atuação como Engenheiro VI no DAEE-SP, onde foi o precursor da Sala de Situação, e essencial na aquisição do Radar Meteorológico de Biritiba-Mirim, responsável pela coordenação da SSSP do DAEE durante anos e permanecia como Coordenador Regional de Defesa Civil, assim demonstrando compromisso concreto: planejamento, prevenção e resposta. Ele não apenas projetava sistemas técnicos, mas fortalecia redes de proteção comunitária, preparava equipes, orientava políticas e ensinava as gerações que vêm atrás.',
];

export const CONTRIBUICAO = [
  'Alfredo Pisani participou da construção e da consolidação da Sala de Situação São Paulo, contribuindo para o desenvolvimento de uma estrutura voltada ao acompanhamento das condições hidrológicas, à análise de dados e ao fornecimento de informações estratégicas para a tomada de decisões.',
  'Ao longo de sua atuação como coordenador, acompanhou a evolução dos instrumentos de monitoramento e a integração de informações provenientes de estações hidrológicas, radares meteorológicos e sistemas de alerta.',
  'Seu trabalho ajudou a fortalecer a capacidade institucional de acompanhar eventos hidrológicos, subsidiar ações preventivas e apoiar órgãos envolvidos na gestão de riscos e na proteção da população.',
];

export const COMPROMISSO = [
  'Mais do que sua contribuição técnica, Alfredo Pisani deixou uma trajetória marcada pelo compromisso com o serviço público, pela valorização do conhecimento e pela colaboração entre instituições.',
  'Sua experiência ultrapassou os limites da Sala de Situação, alcançando atividades de ensino, debates técnicos, projetos de monitoramento e iniciativas voltadas à segurança hídrica e à redução de riscos de desastres.',
  'Como professor e profissional experiente, também contribuiu para a formação e a orientação de outros profissionais, compartilhando conhecimentos construídos ao longo de décadas de trabalho.',
];

export const LEGADO = [
  'A Sala de Situação São Paulo, hoje SP-Águas, continua evoluindo, incorporando novas tecnologias, ferramentas de análise e sistemas de informação.',
  'Essa evolução também é resultado do trabalho daqueles que ajudaram a estabelecer suas bases.',
  'O legado de Alfredo Pisani permanece presente na missão de monitorar os recursos hídricos, produzir informações confiáveis e contribuir para a prevenção de eventos críticos no Estado de São Paulo.',
  '**Homenagear Alfredo Pisani é reconhecer não apenas sua trajetória profissional, mas também a importância das pessoas que dedicam suas vidas à ciência, à gestão das águas e ao bem-estar da sociedade.**',
  'A equipe da Sala de Situação São Paulo expressa seu reconhecimento e sua gratidão pela dedicação, pelos ensinamentos e pelas contribuições deixadas por Alfredo Pisani.',
];

/** Frase de encerramento, uma linha por item. */
export const ENCERRAMENTO = ['Seu conhecimento abriu caminhos.', 'Seu trabalho construiu uma história.', 'Seu legado permanece.'];

export const ASSINATURA = 'Sala de Situação São Paulo — SP-Águas';

export const MARCOS: Marco[] = [
  {
    icone: 'bi-building',
    titulo: 'DAEE',
    texto: 'Décadas de atuação no Departamento de Águas e Energia Elétrica, instituição que antecedeu a SP-Águas.',
  },
  {
    icone: 'bi-display',
    titulo: 'Sala de Situação São Paulo',
    texto: 'Participou da construção e da consolidação da Sala de Situação, onde atuou como coordenador.',
  },
  {
    icone: 'bi-broadcast',
    titulo: 'Radar de Ponte Nova',
    texto: 'Participou da implantação do radar meteorológico de Ponte Nova, em Salesópolis.',
  },
  {
    ano: 'Hoje',
    icone: 'bi-heart',
    titulo: 'Sala de Situação Alfredo Pisani',
    texto: 'A Sala de Situação da SP-Águas leva o seu nome.',
  },
];

export const FOTOS: Foto[] = [];

export const DEPOIMENTOS: Depoimento[] = [];
