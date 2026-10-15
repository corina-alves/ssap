import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { SENHA } from '../config';

// argon2id com os parâmetros recomendados pela OWASP (19 MiB, t=2, p=1).
const OPCOES = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES);
}

export async function conferirSenha(hashGuardado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, senha);
  } catch {
    return false; // hash em formato desconhecido
  }
}

/** true quando o hash foi gerado com parâmetros mais fracos que os atuais. */
export function precisaRehash(hashGuardado: string): boolean {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(hashGuardado);
  if (!m) return true;
  return Number(m[1]) < OPCOES.memoryCost || Number(m[2]) < OPCOES.timeCost;
}

let hashFalso: Promise<string> | undefined;

/**
 * Hash de uma senha aleatória: usado quando o usuário não existe ou está
 * bloqueado, para que a resposta demore o mesmo tempo e não revele contas.
 */
export function hashParaIgualarTempo(): Promise<string> {
  return (hashFalso ??= hashSenha(randomBytes(16).toString('hex')));
}

/** Regras da referência (PoliticaSenha.php). Lista vazia = senha aceita. */
export function validarSenha(senha: string, dadosPessoais: string[] = []): string[] {
  const erros: string[] = [];
  if ([...senha].length < SENHA.min) {
    erros.push(`A senha deve ter pelo menos ${SENHA.min} caracteres.`);
  }
  if (senha.length > SENHA.max) {
    erros.push('A senha é longa demais.');
  }
  if (!/\p{L}/u.test(senha) || !/\d/.test(senha)) {
    erros.push('A senha deve conter letras e números.');
  }
  const minuscula = senha.toLocaleLowerCase('pt-BR');
  const contemDado = dadosPessoais
    .map((d) => d.trim().toLocaleLowerCase('pt-BR'))
    .some((d) => [...d].length >= 4 && minuscula.includes(d));
  if (contemDado) {
    erros.push('A senha não pode conter o seu nome, login ou e-mail.');
  }
  return erros;
}

/** Nome, login e a parte do e-mail antes do @ — o que a senha não pode conter. */
export function dadosPessoais(u: { nome?: string; login?: string; email?: string }): string[] {
  return [u.nome ?? '', u.login ?? '', (u.email ?? '').split('@')[0] ?? ''];
}
