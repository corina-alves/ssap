/** Estado devolvido pelas Server Actions dos formulários administrativos. */
export type EstadoAdmin<V = unknown> = {
  erros: string[];
  mensagem?: string;
  /** Valores enviados, para reexibir o formulário após erro. */
  valores?: V;
  /** Muda a cada resposta; usado como `key` do formulário. */
  versao: number;
};

export const ESTADO_INICIAL: EstadoAdmin<never> = { erros: [], versao: 0 };
