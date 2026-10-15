'use server';

import { redirect } from 'next/navigation';
import { auditar } from '@/lib/auditoria';
import { acl, exigirSala } from '@/lib/auth/acl';
import { anoMes, interpretarCargas, interpretarReservatorio, MESES, numeroBr, periodoBoletim, PERMISSAO_BOLETIM, SALA_BOLETIM } from '@/lib/boletins-sala/boletim-integrado';
import { lerCargas, lerReservatorio, salvarCargas, salvarReservatorio } from '@/lib/boletins-sala/boletim-integrado-armazenado';
import { hojeSp } from '@/lib/integracoes/comum';
import { origemRequisicao } from '@/lib/requisicao';

const RESERVATORIOS = { pedreira: 'Billings (Compartimento Pedreira)', pirapora: 'Pirapora' } as const;

/** Gravações do cadastro dos exutórios (o campo "acao" de cada formulário diz qual). */
export async function gravarExutoriosAcao(form: FormData): Promise<void> {
  const a = await acl();
  const sala = await exigirSala(SALA_BOLETIM, PERMISSAO_BOLETIM);
  const texto = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : '';
  };
  const hoje = hojeSp();
  const { ano, mes } = periodoBoletim(texto('ano'), texto('mes'), { ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) }, 2010);
  const comp = `${MESES[mes - 1]}/${ano}`;
  const usuario = { id: a.usuario.id, nome: a.usuario.nome };
  const slug = texto('reservatorio') as keyof typeof RESERVATORIOS;
  const acao = texto('acao');
  let mensagem = '';

  if (acao === 'reservatorio' && Object.hasOwn(RESERVATORIOS, slug)) {
    const novos = interpretarReservatorio(texto('linhas').slice(0, 200_000), ano, mes);
    await salvarReservatorio(slug, ano, mes, texto('substituir') ? novos : { ...(await lerReservatorio(slug, ano, mes)), ...novos }, usuario.id);
    mensagem = `${Object.keys(novos).length} dia(s) de ${RESERVATORIOS[slug]} gravado(s) em ${comp}.`;
  } else if (acao === 'limpar_reservatorio' && Object.hasOwn(RESERVATORIOS, slug) && texto('confirmar')) {
    await salvarReservatorio(slug, ano, mes, {}, usuario.id);
    mensagem = `Dados de ${RESERVATORIOS[slug]} em ${comp} removidos.`;
  } else if (acao === 'carga_mes') {
    const cargas = await lerCargas();
    cargas[anoMes(ano, mes)] = { q_pinheiros: numeroBr(texto('q_pinheiros')), q_tiete: numeroBr(texto('q_tiete')), dbo_pinheiros: numeroBr(texto('dbo_pinheiros')), dbo_tiete: numeroBr(texto('dbo_tiete')) };
    await salvarCargas(cargas, usuario.id);
    mensagem = `Vazão e DBO de ${comp} gravadas.`;
  } else if (acao === 'carga_historico') {
    const novos = interpretarCargas(texto('linhas').slice(0, 200_000));
    await salvarCargas({ ...(await lerCargas()), ...novos }, usuario.id);
    mensagem = `${Object.keys(novos).length} mês(es) de histórico de carga importado(s).`;
  } else if (acao === 'carga_remover' && /^\d{4}-\d{2}$/.test(texto('ym'))) {
    const cargas = await lerCargas();
    delete cargas[texto('ym')];
    await salvarCargas(cargas, usuario.id);
    mensagem = `Mês ${texto('ym')} removido do histórico de carga.`;
  }
  if (mensagem) {
    await auditar({ modulo: 'boletins', acao: `exutorios_${acao}`, entidade: 'boletim_integrado', salaId: sala.id, descricao: `Dados dos exutórios: ${mensagem}`, usuario, ...(await origemRequisicao()) });
  }
  redirect(`/acesso/boletim_integrado/exutorios?${new URLSearchParams({ ano: String(ano), mes: String(mes), ...(mensagem ? { ok: mensagem } : {}) })}`);
}
