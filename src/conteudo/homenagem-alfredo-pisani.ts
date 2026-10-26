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

/** Foto do topo (caminho em public/). Sem ela, aparece o cartão com o nome da Sala. */
export const RETRATO: { src: string; legenda: string } | null = {
  src: '/legado/img/sssp-daee.png',
  legenda: 'Alfredo Pisani apresentando na Sala de Situação, ainda no DAEE',
};

export const LEMA = 'Uma vida dedicada à água, à ciência e à proteção da sociedade';

export const CHAMADA = 'Uma homenagem da Sala de Situação São Paulo a um dos profissionais que ajudaram a construir sua história.';

export const MEMORIA = 'Em memória de Alfredo Pisani († 2025)';

export const INTRODUCAO = [
  'A história da Sala de Situação São Paulo está profundamente ligada à dedicação de profissionais que compreenderam a importância da informação hidrológica, do conhecimento técnico e do monitoramento contínuo para a proteção da população. Entre esses profissionais, destaca-se o engenheiro **Alfredo Pisani**, cuja trajetória deixou contribuições significativas para a gestão dos recursos hídricos no Estado de São Paulo.',
  'Engenheiro civil, professor e servidor público de longa carreira, Alfredo Pisani dedicou décadas de sua vida ao Departamento de Águas e Energia Elétrica (DAEE), instituição que antecedeu a atual SP-Águas. Sua atuação esteve associada ao desenvolvimento e ao aperfeiçoamento de sistemas de monitoramento hidrometeorológico, à prevenção de enchentes e ao fortalecimento das ações de alerta e resposta a eventos críticos.',
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
