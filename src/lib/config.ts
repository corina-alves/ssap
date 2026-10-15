/** Parâmetros de segurança — os mesmos da referência (acesso/config/config.php). */
export const SESSAO = {
  cookie: 'ssap_sessao',
  inatividadeSeg: 60 * 60, // 60 min sem uso
  absolutaSeg: 8 * 60 * 60, // 8 h desde o login
  toqueSeg: 60, // grava ultimo_uso_em no máximo uma vez por minuto
} as const;

export const LOGIN = {
  maxFalhasConta: 5, // falhas seguidas de uma conta → bloqueio da conta
  bloqueioSeg: 15 * 60,
  maxFalhasIp: 20, // falhas de um IP (qualquer conta) dentro da janela → IP recusado
  janelaSeg: 15 * 60,
} as const;

export const UPLOAD = {
  maxBytes: 30 * 1024 * 1024, // 30 MB, como na referência
} as const;

export const SENHA = {
  min: 10,
  max: 1024,
} as const;
