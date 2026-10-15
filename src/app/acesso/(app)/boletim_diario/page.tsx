import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecalho } from '@/components/acesso/pecas';
import { idTipoBoletim } from '@/lib/acesso/api';
import { acl, exigirSala } from '@/lib/auth/acl';
import { PERMISSAO_DIARIO, SALA_DIARIO } from '@/lib/boletins-sala/diario';
import { dataBr } from '@/lib/formato';
import { hojeSp } from '@/lib/integracoes/comum';
import { TelaDiario } from './tela';
import '@/styles/acesso/boletim-diario.css';

export const metadata: Metadata = { title: 'Boletim Diário — SSAP' };

/**
 * Boletim Diário da Sala de Situação Alfredo Pisani: a página fica dentro da
 * área administrativa; as folhas, a edição e o "Gerar PDF" (que imprime só o
 * boletim, sem a moldura da área) ficam em ./tela.tsx.
 */
export default async function BoletimDiario() {
  await acl();
  const sala = await exigirSala(SALA_DIARIO, PERMISSAO_DIARIO);
  const idTipo = await idTipoBoletim(sala.id, 'diario');
  const hoje = hojeSp();
  const hrefSala = `/acesso/salas/sala?s=${sala.slug}`;

  return (
    <div className="bd-area">
      <Cabecalho
        titulo="Boletim Diário"
        subtitulo={`Sala de Situação Alfredo Pisani · ${dataBr(hoje)}`}
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, hrefSala],
          ['Boletins', `/acesso/boletins?sala=${sala.id}`],
          ['Boletim Diário', null],
        ]}
        acoes={
          <>
            <Link className="btn btn-outline-secondary" href={hrefSala}>
              <i className="bi bi-arrow-left me-1" /> Voltar para a sala
            </Link>
            <Link className="btn btn-outline-secondary" href={`/acesso/boletins?sala=${sala.id}`}>
              <i className="bi bi-journal-text me-1" /> Boletins da sala
            </Link>
            {idTipo > 0 && (
              <Link className="btn btn-outline-secondary" href={`/acesso/boletins/novo?tipo=${idTipo}`}>
                <i className="bi bi-upload me-1" /> Cadastrar PDF como boletim
              </Link>
            )}
            <Link className="btn btn-outline-secondary" href="/acesso">
              <i className="bi bi-speedometer2 me-1" /> Painel
            </Link>
          </>
        }
      />
      <TelaDiario hoje={hoje} />
    </div>
  );
}
