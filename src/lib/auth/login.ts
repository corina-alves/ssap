import 'server-only';
import { auditar } from '../auditoria';
import { LOGIN, SENHA } from '../config';
import { query, queryOne, transacao } from '../db';
import type { Origem } from '../requisicao';
import {
  conferirSenha,
  dadosPessoais,
  hashParaIgualarTempo,
  hashSenha,
  precisaRehash,
  validarSenha,
} from './senha';
import { criarSessao, limparSessoesAntigas, revogarSessoes, type UsuarioSessao } from './sessao';

export const MSG_FALHA =
  `Usuário ou senha inválidos. Após ${LOGIN.maxFalhasConta} tentativas seguidas, ` +
  `a conta fica bloqueada por ${LOGIN.bloqueioSeg / 60} minutos.`;

export type ResultadoLogin = { ok: true; trocarSenha: boolean } | { ok: false; mensagem: string };

type LinhaUsuario = {
  id: number;
  nome: string;
  email: string;
  login: string;
  senha_hash: string;
  status: 'ativo' | 'inativo' | 'bloqueado';
  deve_trocar_senha: boolean;
  bloqueado: boolean;
};

/**
 * Login por login ou e-mail. Mesmo tempo de resposta com ou sem usuário,
 * bloqueio temporário da conta após falhas seguidas e recusa do IP após
 * muitas falhas na janela. Mensagem genérica para não revelar contas.
 */
export async function login(identificador: string, senha: string, origem: Origem): Promise<ResultadoLogin> {
  identificador = identificador.trim();
  if (!identificador || !senha) {
    return { ok: false, mensagem: 'Informe o usuário e a senha.' };
  }
  if (identificador.length > 190 || senha.length > SENHA.max) {
    return { ok: false, mensagem: MSG_FALHA };
  }

  if (await ipBloqueado(origem.ip)) {
    await registrarTentativa(identificador, origem.ip, false);
    await auditar({ modulo: 'auth', acao: 'login_ip_bloqueado', descricao: `IP recusado: ${identificador}`, ...origem });
    return {
      ok: false,
      mensagem: `Muitas tentativas a partir deste endereço. Aguarde ${LOGIN.janelaSeg / 60} minutos.`,
    };
  }

  const u = await queryOne<LinhaUsuario>(
    `SELECT id, nome, email, login, senha_hash, status, deve_trocar_senha,
            coalesce(bloqueado_ate > now(), false) AS bloqueado
       FROM usuarios
      WHERE excluido_em IS NULL AND (lower(login) = lower($1) OR lower(email) = lower($1))`,
    [identificador],
  );

  // Conta em bloqueio temporário: nem confere a senha (mas gasta o mesmo tempo).
  if (u?.bloqueado) {
    await conferirSenha(await hashParaIgualarTempo(), senha);
    await registrarTentativa(identificador, origem.ip, false);
    return { ok: false, mensagem: MSG_FALHA };
  }

  // Sempre confere uma senha, mesmo sem usuário: o tempo não revela se a conta existe.
  const senhaOk = await conferirSenha(u ? u.senha_hash : await hashParaIgualarTempo(), senha);

  if (!u || !senhaOk) {
    await registrarTentativa(identificador, origem.ip, false);
    if (u) await contarFalha(u, origem);
    else await auditar({ modulo: 'auth', acao: 'login_falha', descricao: `Usuário inexistente: ${identificador}`, ...origem });
    return { ok: false, mensagem: MSG_FALHA };
  }

  // Senha certa, mas conta desativada ou bloqueada pelo administrador.
  if (u.status !== 'ativo') {
    await registrarTentativa(identificador, origem.ip, false);
    await auditar({
      modulo: 'auth', acao: 'login_conta_inativa', entidade: 'usuarios', entidadeId: u.id,
      descricao: `Conta com status ${u.status}`, usuario: u, ...origem,
    });
    return { ok: false, mensagem: 'Esta conta está desativada. Procure o administrador do sistema.' };
  }

  const novoHash = precisaRehash(u.senha_hash) ? await hashSenha(senha) : null;

  await transacao(async (c) => {
    await c.query(
      `UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL, ultimo_acesso = now(),
              senha_hash = coalesce($2, senha_hash)
        WHERE id = $1`,
      [u.id, novoHash],
    );
    await c.query('INSERT INTO login_tentativas (login, ip, sucesso) VALUES ($1, $2, true)', [
      identificador.slice(0, 190), origem.ip,
    ]);
    await criarSessao(u.id, origem, c);
    await auditar(
      { modulo: 'auth', acao: 'login', entidade: 'usuarios', entidadeId: u.id, descricao: 'Login', usuario: u, ...origem },
      c,
    );
  });

  if (Math.random() < 0.05) await limparSessoesAntigas();

  return { ok: true, trocarSenha: u.deve_trocar_senha };
}

async function contarFalha(u: LinhaUsuario, origem: Origem): Promise<void> {
  // Incremento atômico: tentativas simultâneas não se perdem.
  const r = await queryOne<{ falhas: number }>(
    `UPDATE usuarios SET tentativas_falhas = tentativas_falhas + 1 WHERE id = $1
     RETURNING tentativas_falhas AS falhas`,
    [u.id],
  );
  const falhas = r?.falhas ?? 0;
  if (falhas >= LOGIN.maxFalhasConta) {
    await query(
      `UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = now() + make_interval(secs => $2) WHERE id = $1`,
      [u.id, LOGIN.bloqueioSeg],
    );
    await auditar({
      modulo: 'auth', acao: 'conta_bloqueada', entidade: 'usuarios', entidadeId: u.id,
      descricao: `Conta bloqueada por ${falhas} tentativas inválidas`, usuario: u, ...origem,
    });
    return;
  }
  await auditar({
    modulo: 'auth', acao: 'login_falha', entidade: 'usuarios', entidadeId: u.id,
    descricao: `Senha incorreta (${falhas}/${LOGIN.maxFalhasConta})`, usuario: u, ...origem,
  });
}

async function ipBloqueado(ip: string): Promise<boolean> {
  const r = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM login_tentativas
      WHERE ip = $1 AND NOT sucesso AND criado_em > now() - make_interval(secs => $2)`,
    [ip, LOGIN.janelaSeg],
  );
  return (r?.n ?? 0) >= LOGIN.maxFalhasIp;
}

async function registrarTentativa(login: string, ip: string, sucesso: boolean): Promise<void> {
  await query('INSERT INTO login_tentativas (login, ip, sucesso) VALUES ($1, $2, $3)', [
    login.slice(0, 190), ip, sucesso,
  ]);
}

/**
 * Troca a senha do próprio usuário. Encerra as outras sessões dele e mantém
 * a atual. Lista vazia = senha trocada.
 */
export async function trocarSenha(
  u: UsuarioSessao,
  atual: string,
  nova: string,
  confirmacao: string,
  origem: Origem,
): Promise<string[]> {
  const linha = await queryOne<{ senha_hash: string }>('SELECT senha_hash FROM usuarios WHERE id = $1', [u.id]);
  if (!linha || !(await conferirSenha(linha.senha_hash, atual))) {
    await auditar({
      modulo: 'auth', acao: 'senha_troca_falha', entidade: 'usuarios', entidadeId: u.id,
      descricao: 'Senha atual incorreta na troca de senha', usuario: u, ...origem,
    });
    return ['A senha atual está incorreta.'];
  }
  if (nova !== confirmacao) return ['A confirmação não confere com a nova senha.'];

  const erros = validarSenha(nova, dadosPessoais(u));
  if (erros.length) return erros;
  if (await conferirSenha(linha.senha_hash, nova)) return ['A nova senha deve ser diferente da atual.'];

  const hash = await hashSenha(nova);
  await transacao(async (c) => {
    await c.query(
      `UPDATE usuarios SET senha_hash = $2, senha_alterada_em = now(), deve_trocar_senha = false WHERE id = $1`,
      [u.id, hash],
    );
    await revogarSessoes(u.id, 'senha_alterada', u.tokenHash, c);
    await auditar(
      { modulo: 'auth', acao: 'senha_alterada', entidade: 'usuarios', entidadeId: u.id,
        descricao: 'Senha alterada pelo próprio usuário', usuario: u, ...origem },
      c,
    );
  });
  return [];
}
