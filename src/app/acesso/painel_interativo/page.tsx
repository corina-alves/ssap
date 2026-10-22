import type { Metadata } from 'next';
import { acl, exigirSala } from '@/lib/auth/acl';
import { PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';
import { sair } from '../actions';
import { TelaPainel } from './tela';
import '@/styles/acesso/painel-interativo.css';

export const metadata: Metadata = { title: 'Painel interativo — sistemas produtores' };

/**
 * Painel Interativo de Monitoramento e Análise Hidrológica dos sistemas
 * produtores da RMSP, com dados do SSD SP Águas. Página própria, fora da
 * moldura da área (sem menu lateral nem links para as outras telas): exige
 * login e visualizar_dashboard na Sala Alfredo Pisani. A barra aparece na
 * hora; cada cartão, gráfico e diagrama busca os seus dados (./tela.tsx).
 */
export default async function PainelInterativo() {
  const a = await acl();
  await exigirSala(SALA_PAINEL, PERMISSAO_PAINEL);
  return (
    <div className="pi-pagina">
      <header className="pi-barra">
        <div className="pi-marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/legado/logo/spaguas_white.png" alt="SP Águas" />
          <div>
            <h1>Painel interativo</h1>
            <span>Monitoramento e análise hidrológica dos sistemas produtores da RMSP - dados do SSD SP Águas</span>
          </div>
        </div>
        <form action={sair} className="pi-usuario">
          <span title={a.usuario.email}>
            <i className="bi bi-person-circle" /> {a.usuario.nome}
          </span>
          <button type="submit">
            <i className="bi bi-box-arrow-right" /> Sair
          </button>
        </form>
      </header>
      <main className="pi-conteudo">
        <TelaPainel hoje={hojeSp()} />
      </main>
    </div>
  );
}
