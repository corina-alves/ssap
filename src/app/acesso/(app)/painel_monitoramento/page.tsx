import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AtualizacaoAutomatica } from '@/app/(site)/boletins/automatico/tiete-pinheiros/ao-vivo';
import { painelMonitoramento } from '@/lib/acesso/painel-monitoramento';
import { acl } from '@/lib/auth/acl';
import { ConteudoPainel, vistaDe } from './conteudo';
import '@/styles/acesso/painel-monitoramento.css';

export const metadata: Metadata = { title: 'Painel de Monitoramento Hidrológico e Operacional' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Painel de Monitoramento Hidrológico e Operacional: resumo dos Sumários
 * Executivos de Cheias (Tietê-Pinheiros e Ribeira de Iguape) para o
 * acompanhamento — situação dos pontos de nível, estruturas e chuva, com os
 * dados dos sumários automáticos. Atualiza sozinho a cada 5 min.
 * ?v=tiete-pinheiros | ribeira mostra um sistema com todos os pontos.
 */
export default async function PainelMonitoramento({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await acl();
  if (!a.podeEmAlguma('visualizar_dashboard')) redirect('/acesso/sem-acesso');
  const vista = vistaDe(um((await searchParams).v));
  const p = await painelMonitoramento();
  return (
    <>
      <AtualizacaoAutomatica />
      <ConteudoPainel p={p} vista={vista} />
    </>
  );
}
