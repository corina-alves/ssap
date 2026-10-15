import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { acl } from '@/lib/auth/acl';
import { dataHora } from '@/lib/formato';
import { verificarFontes } from '@/lib/integracoes/status';
import { VerificarAgora } from './verificar';

export const metadata: Metadata = { title: 'Integrações' };

const ROTULO = { online: 'Online', instavel: 'Instável', offline: 'Fora do ar' } as const;
const CLASSE = { online: 'status-ativo', instavel: 'bol-em_revisao', offline: 'status-bloqueado' } as const;

/** Situação das fontes externas (SABESP, ANA, SSD, SIBH, Open-Meteo, IBGE). */
export default async function PaginaIntegracoes({ searchParams }: { searchParams: Promise<{ agora?: string }> }) {
  const a = await acl();
  if (!a.podeEmAlguma('visualizar_dashboard')) redirect('/acesso/sem-acesso');
  const { agora } = await searchParams;
  const { fontes, verificadoEm } = await verificarFontes(agora === '1');
  const fora = fontes.filter((f) => f.situacao !== 'online').length;

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Integrações</h1>
          <p className="suave">
            Fontes externas usadas pelo painel e pelos boletins. Verificado em {dataHora(verificadoEm)}.
          </p>
        </div>
        <VerificarAgora />
      </div>
      {fora > 0 ? (
        <div className="alerta alerta-aviso">
          {fora} fonte(s) com problema. As telas continuam mostrando o último dado obtido, marcado como desatualizado.
        </div>
      ) : (
        <div className="alerta alerta-ok">Todas as fontes respondendo normalmente.</div>
      )}
      <section className="cartao">
        <table className="tabela">
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Situação</th>
              <th>Tempo de resposta</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {fontes.map((f) => (
              <tr key={f.id}>
                <td>{f.nome}</td>
                <td>
                  <span className={`etiqueta ${CLASSE[f.situacao]}`}>{ROTULO[f.situacao]}</span>
                </td>
                <td>{f.ms} ms</td>
                <td>
                  <small className="suave">{f.detalhe ?? (f.http ? `HTTP ${f.http}` : '')}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
