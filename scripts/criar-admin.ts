/**
 * Cria um Administrador do Sistema pelo terminal.
 *   npm run admin:criar
 * A senha é digitada sem aparecer na tela e nunca é gravada em texto.
 */
import { auditar } from '../src/lib/auditoria';
import { dadosPessoais, hashSenha, validarSenha } from '../src/lib/auth/senha';
import { pool, queryOne, transacao } from '../src/lib/db';
import { carregarEnv, perguntar } from './_comum';

carregarEnv();

async function principal(): Promise<void> {
  const perfil = await queryOne<{ id: number }>("SELECT id FROM perfis WHERE slug = 'admin_sistema'");
  if (!perfil) throw new Error('Perfil admin_sistema não encontrado. Rode antes: npm run db:migrar');

  console.log('Novo Administrador do Sistema\n');
  const nome = await perguntar('Nome completo: ');
  const email = (await perguntar('E-mail: ')).toLowerCase();
  const login = (await perguntar('Login: ')).toLowerCase();

  const erros: string[] = [];
  if ([...nome].length < 3 || [...nome].length > 150) erros.push('Nome: informe de 3 a 150 caracteres.');
  if (email.length > 190 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) erros.push('E-mail inválido.');
  if (!/^[a-z0-9._-]{3,60}$/.test(login)) {
    erros.push('Login: use 3 a 60 caracteres entre a-z, 0-9, ponto, hífen e sublinhado.');
  }
  const repetido = await queryOne(
    'SELECT 1 FROM usuarios WHERE excluido_em IS NULL AND (lower(email) = $1 OR lower(login) = $2)',
    [email, login],
  );
  if (repetido) erros.push('Já existe um usuário com este e-mail ou login.');
  if (erros.length) throw new Error(erros.join('\n'));

  const senha = await perguntar('Senha (não aparece na tela): ', true);
  const confirmacao = await perguntar('Repita a senha: ', true);
  if (senha !== confirmacao) throw new Error('A confirmação não confere com a senha.');
  const errosSenha = validarSenha(senha, dadosPessoais({ nome, email, login }));
  if (errosSenha.length) throw new Error(errosSenha.join('\n'));

  const hash = await hashSenha(senha);
  const id = await transacao(async (c) => {
    const r = await c.query<{ id: number }>(
      `INSERT INTO usuarios (nome, email, login, senha_hash, status, senha_alterada_em)
       VALUES ($1, $2, $3, $4, 'ativo', now()) RETURNING id`,
      [nome, email, login, hash],
    );
    const novoId = r.rows[0]!.id;
    await c.query('INSERT INTO usuario_perfis (usuario_id, perfil_id) VALUES ($1, $2)', [novoId, perfil.id]);
    await auditar(
      { modulo: 'usuarios', acao: 'criar', entidade: 'usuarios', entidadeId: novoId,
        descricao: `Administrador criado pelo terminal: ${login}` },
      c,
    );
    return novoId;
  });
  console.log(`\nAdministrador criado (id ${id}). Entre em /acesso com o login "${login}".`);
}

principal()
  .catch((e) => {
    console.error(`\n${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
