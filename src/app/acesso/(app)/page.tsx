import type { Metadata } from 'next';
import Link from 'next/link';
import { Indicadores } from '@/components/acesso/indicadores';
import { Cabecalho, corSala, Mensagem } from '@/components/acesso/pecas';
import { salasPainel } from '@/lib/acesso/painel';
import { acl } from '@/lib/auth/acl';

export const metadata: Metadata = { title: 'Painel' };

export default async function Painel({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  const a = await acl();
  const salas = await salasPainel(a);
  const { senha } = await searchParams;

  return (
    <>
      {senha === 'alterada' && <Mensagem tipo="sucesso">Senha alterada.</Mensagem>}
      <Cabecalho
        titulo={`Olá, ${a.usuario.nome.split(' ')[0]}`}
        subtitulo={a.globais.size > 0 ? 'Visão geral de todas as Salas de Situação.' : 'Visão geral das suas Salas de Situação.'}
      />

      {salas.length === 0 ? (
        <div className="acesso-card">
          <p className="mb-0 text-secondary">
            <i className="bi bi-info-circle" /> Você ainda não tem acesso a nenhuma Sala de Situação. Procure o administrador do sistema.
          </p>
        </div>
      ) : (
        <>
          <div className="acesso-salas mb-4">
            {salas.map((s) => (
              <Link key={s.id} className="acesso-sala-card" style={corSala(s.cor)} href={`/acesso/salas/sala?s=${s.slug}`}>
                <span className="acesso-sala-card__sigla">{s.sigla || s.nome}</span>
                <strong>{s.nome}</strong>
                <small>{s.perfilNome}</small>
              </Link>
            ))}
          </div>
          <Indicadores a={a} salas={salas.map((s) => s.id)} salaId={null} />
        </>
      )}
    </>
  );
}
