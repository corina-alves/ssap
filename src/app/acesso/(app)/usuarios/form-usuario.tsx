'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { DadosUsuario, Perfil, SalaResumo } from '@/lib/admin/usuarios';
import { salvarUsuario, type EstadoUsuario } from './actions';

const ROTULO_STATUS = { ativo: 'Ativo', inativo: 'Inativo', bloqueado: 'Bloqueado' } as const;

export function Mensagens({ estado }: { estado: EstadoUsuario }) {
  return (
    <>
      {estado.erros.length > 0 && (
        <div className="alerta alerta-erro" role="alert">
          <ul>
            {estado.erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {estado.mensagem && (
        <div className="alerta alerta-ok" role="status">
          {estado.mensagem}
        </div>
      )}
      {estado.link && <PainelLink link={estado.link} />}
    </>
  );
}

function PainelLink({ link }: { link: NonNullable<EstadoUsuario['link']> }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <section className="cartao destaque">
      <h2>Link para {link.novo ? 'definir' : 'redefinir'} a senha</h2>
      <p className="suave">
        Uso único, válido por {link.horas} horas. Ele <strong>não será exibido de novo</strong>: copie e envie ao
        usuário por um canal seguro (e-mail institucional, Teams).
      </p>
      <div className="linha">
        <input className="mono" value={link.url} readOnly aria-label="Link de senha" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="botao botao-secundario"
          onClick={() => navigator.clipboard.writeText(link.url).then(() => setCopiado(true))}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </section>
  );
}

export function FormUsuario({
  id,
  inicial,
  perfis,
  salas,
  ehEuMesmo,
}: {
  id: number | null;
  inicial: DadosUsuario;
  perfis: Perfil[];
  salas: SalaResumo[];
  ehEuMesmo: boolean;
}) {
  const [estado, acao, pendente] = useActionState(salvarUsuario, { erros: [], versao: 0 });
  const v = estado.valores ?? inicial;
  const globais = perfis.filter((p) => p.escopo === 'global');
  const deSala = perfis.filter((p) => p.escopo === 'sala');

  // Cadastro concluído: mostra só o link (uma vez) e o caminho para o cadastro.
  if (estado.idCriado) {
    return (
      <>
        <Mensagens estado={estado} />
        <p>
          <Link href={`/acesso/usuarios/${estado.idCriado}`}>Abrir o cadastro</Link> ·{' '}
          <Link href="/acesso/usuarios">Voltar à lista</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <Mensagens estado={estado} />
      {/* key: remonta com os valores devolvidos pela ação (o React limpa o form após enviar). */}
      <form key={estado.versao} action={acao} className="formulario" noValidate>
        {id && <input type="hidden" name="id" value={id} />}
        <div className="colunas">
          <section className="cartao">
            <h2>Dados</h2>
            <label>
              Nome completo
              <input name="nome" defaultValue={v.nome} maxLength={150} required />
            </label>
            <label>
              E-mail
              <input name="email" type="email" defaultValue={v.email} maxLength={190} required />
            </label>
            <label>
              Login
              <input name="login" defaultValue={v.login} maxLength={60} pattern="[a-z0-9._\-]{3,60}" required />
              <small className="suave">
                Letras minúsculas, números, ponto, hífen e sublinhado. O usuário também pode entrar com o e-mail.
              </small>
            </label>
            {id ? (
              <>
                <label>
                  Situação
                  <select name="status" defaultValue={v.status} disabled={ehEuMesmo}>
                    {Object.entries(ROTULO_STATUS).map(([k, r]) => (
                      <option key={k} value={k}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {ehEuMesmo && <small className="suave">Você não pode alterar a situação da própria conta.</small>}
                </label>
                {ehEuMesmo && <input type="hidden" name="status" value="ativo" />}
                <label className="check">
                  <input type="checkbox" name="deve_trocar_senha" value="1" defaultChecked={v.deveTrocarSenha} />
                  Exigir troca de senha no próximo acesso
                </label>
              </>
            ) : (
              <p className="suave">
                Você não define a senha: ao salvar, o sistema gera um link de uso único para o próprio usuário
                cadastrá-la.
              </p>
            )}
          </section>

          <section className="cartao">
            <h2>Acesso</h2>
            {globais.length > 0 && (
              <fieldset>
                <legend>Perfis globais (valem em todas as salas)</legend>
                {globais.map((p) => (
                  <label key={p.id} className="check">
                    <input
                      type="checkbox"
                      name="perfis_globais"
                      value={p.id}
                      defaultChecked={v.perfisGlobais.includes(p.id)}
                    />
                    <span>
                      {p.nome} {p.descricao && <small className="suave">— {p.descricao}</small>}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <fieldset>
              <legend>Perfil em cada sala</legend>
              <table className="tabela">
                <tbody>
                  {salas.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <label htmlFor={`sala-${s.id}`}>{s.nome}</label>
                        {s.status !== 'ativa' && <span className="etiqueta">Inativa</span>}
                      </td>
                      <td>
                        <select id={`sala-${s.id}`} name={`sala_${s.id}`} defaultValue={v.salas[s.id] ?? 0}>
                          <option value={0}>Sem acesso</option>
                          {deSala.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </fieldset>
          </section>
        </div>

        <div className="acoes">
          <Link href="/acesso/usuarios" className="botao botao-secundario">
            Voltar
          </Link>
          <button type="submit" className="botao" disabled={pendente}>
            {pendente ? 'Salvando…' : id ? 'Salvar alterações' : 'Cadastrar usuário'}
          </button>
        </div>
      </form>
    </>
  );
}
