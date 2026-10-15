/** Acumula mensagens de validação para devolver todas de uma vez ao formulário. */
export class Validador {
  readonly erros: string[] = [];

  se(condicao: boolean, mensagem: string): this {
    if (condicao) this.erros.push(mensagem);
    return this;
  }

  tamanho(valor: string, campo: string, min: number, max: number): this {
    const n = [...valor].length;
    return this.se(n < min || n > max, min > 0 ? `${campo}: informe de ${min} a ${max} caracteres.` : `${campo}: no máximo ${max} caracteres.`);
  }

  formato(valor: string, re: RegExp, mensagem: string): this {
    return this.se(!re.test(valor), mensagem);
  }

  emLista(valor: string, lista: readonly string[], campo: string): this {
    return this.se(!lista.includes(valor), `${campo}: valor inválido.`);
  }

  get ok(): boolean {
    return this.erros.length === 0;
  }
}

/** Slug de URL: letras minúsculas sem acento, números e hífen (ex.: baixada-santista). */
export const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lê um campo de texto de um FormData. */
export function campo(form: FormData, nome: string): string {
  const v = form.get(nome);
  return typeof v === 'string' ? v.trim() : '';
}

/** Lê um id numérico positivo de um FormData (0 se ausente ou inválido). */
export function campoId(form: FormData, nome = 'id'): number {
  const v = campo(form, nome);
  return /^\d{1,9}$/.test(v) ? Number(v) : 0;
}
