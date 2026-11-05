import type { Metadata } from 'next';
import '@/styles/acesso/boletim-mensal.css';
import { Cabecalho } from '@/components/acesso/pecas';
import { SalvarTextos } from '@/components/boletim-mensal/barra';
import { FolhasBoletim } from '@/components/boletim-mensal/folhas';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { acl, exigirSala } from '@/lib/auth/acl';
import { dadosBoletim, mesExtenso, PERMISSAO_EDITAR, PERMISSAO_VER, SALA_BOLETIM_MENSAL } from '@/lib/boletins-sala/boletim-mensal';
import { opcoesFim } from '@/lib/hidrologia/sistemas-ssd';

export const metadata: Metadata = { title: 'Boletim mensal' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Boletim Mensal da Sala: os slides do boletim montados com as integrações
 * (volumes SABESP/ANA, sistemas do SSD, Protocolo de Escassez) e, onde não há
 * fonte automática, imagens e textos da equipe. "Gerar PDF" abre a versão de
 * impressão (um slide por página, 16:9).
 */
export default async function BoletimMensal({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const a = await acl();
  const sala = await exigirSala(um(sp.s) || SALA_BOLETIM_MENSAL, PERMISSAO_VER);
  const opcoes = opcoesFim();
  const mes = opcoes.find((o) => o.valor === um(sp.mes))?.valor ?? opcoes[0]!.valor;
  const editavel = a.pode(PERMISSAO_EDITAR, sala.id);
  const d = await dadosBoletim(sala.id, mes);
  const consulta = new URLSearchParams({ s: sala.slug, mes }).toString();

  return (
    <>
      <Cabecalho
        titulo={`Boletim mensal — ${mesExtenso(mes)}`}
        subtitulo="Slides montados com os dados das integrações; onde não há fonte automática, a equipe anexa as imagens e escreve os textos. O PDF sai com um slide por página."
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, `/acesso/salas/sala?s=${sala.slug}`],
          ['Boletim mensal', null],
        ]}
      />
      <div className="acesso-card mb-3 d-flex flex-wrap align-items-end gap-3">
        <form method="get" className="d-flex align-items-end gap-2 mb-0">
          <input type="hidden" name="s" value={sala.slug} />
          <div>
            <label className="form-label small mb-1" htmlFor="mes">
              Mês dos dados
            </label>
            <SelectAutoEnvio id="mes" name="mes" defaultValue={mes} className="form-select form-select-sm">
              {opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </SelectAutoEnvio>
          </div>
        </form>
        {editavel && <SalvarTextos salaId={sala.id} mes={mes} />}
        <a className="btn btn-sm btn-outline-primary" href={`/acesso/boletim_mensal_pdf?${consulta}`} target="_blank" rel="noopener">
          <i className="bi bi-file-earmark-pdf" /> Gerar PDF
        </a>
        <small className="text-secondary ms-auto">
          {d.conteudo.atualizadoEm
            ? `Textos e imagens atualizados em ${d.conteudo.atualizadoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}${d.conteudo.atualizadoPor ? ` por ${d.conteudo.atualizadoPor}` : ''}.`
            : 'Nenhum texto ou imagem deste mês ainda.'}
          {editavel && d.conteudo.herdados.length > 0 && ` ${d.conteudo.herdados.length} texto(s) vieram do mês anterior.`}
        </small>
      </div>
      {editavel && (
        <div className="alert alert-info small py-2">
          Salve os textos antes de gerar o PDF. As imagens são gravadas assim que escolhidas. Slides 10 a 19 e o mapa do Protocolo saem automáticos.
        </div>
      )}
      <div className="bm-zoom">
        <FolhasBoletim d={d} salaId={sala.id} editavel={editavel} />
      </div>
    </>
  );
}
