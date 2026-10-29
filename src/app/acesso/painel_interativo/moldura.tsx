import Form from 'next/form';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { dataDaUrl } from '@/components/hidrologia/filtro-data';
import { BotaoTopo } from '@/components/site/botao-topo';
import { acl, exigirSala } from '@/lib/auth/acl';
import { dataBr, dataHora } from '@/lib/formato';
import { PERMISSAO_PAINEL, SALA_PAINEL, SISTEMAS as LOCAIS } from '@/lib/hidrologia/painel-interativo';
import { hojeSp } from '@/lib/integracoes/comum';
import { SISTEMAS } from '@/lib/integracoes/sabesp';
import { Relogio } from '../../painel/ao-vivo';
import { DataReferencia } from '../../painel/corpo';
import { sair } from '../actions';
import { CamposDaUrl } from './campos-url';

/**
 * Moldura das páginas do painel interativo: topo (data de referência, relógio,
 * usuário) e as abas que levam a cada página. A data escolhida (?data=) passa
 * de uma página para outra pelos links das abas.
 */

const BASE = '/acesso/painel_interativo';

const PAGINAS = [
  { chave: 'geral', caminho: '', rotulo: 'Visão geral', icone: 'bi-grid-1x2-fill' },
  { chave: 'chuva-vazao', caminho: '/chuva-vazao', rotulo: 'Chuva e vazão', icone: 'bi-cloud-rain-heavy-fill' },
  { chave: 'paraiba-do-sul', caminho: '/paraiba-do-sul', rotulo: 'Paraíba do Sul', icone: 'bi-arrow-left-right' },
  { chave: 'acompanhamento', caminho: '/acompanhamento', rotulo: 'Acompanhamento', icone: 'bi-table' },
  { chave: 'sistemas', caminho: '/sistemas', rotulo: 'Análise por sistema', icone: 'bi-diagram-3-fill' },
] as const;

type Busca = Promise<Record<string, string | string[] | undefined>>;

/** Login, permissão e data de referência de uma página do painel. */
export async function abrirPainel(searchParams: Busca) {
  const a = await acl();
  await exigirSala(SALA_PAINEL, PERMISSAO_PAINEL);
  const busca = await searchParams;
  return { usuario: a.usuario, busca, data: dataDaUrl(busca.data), hoje: hojeSp() };
}

/** Endereço de uma página do painel, mantendo a data (quando não é hoje). */
export function endereco(caminho: string, data: string, hoje: string, extra: Record<string, string> = {}) {
  const q = new URLSearchParams(extra);
  if (data !== hoje) q.set('data', data);
  const s = q.toString();
  return `${BASE}${caminho}${s ? `?${s}` : ''}`;
}

/** Cards do topo → página de análise de cada sistema (id do sistema → endereço). */
export function linksSistemas(data: string, hoje: string): Record<number, string> {
  return Object.fromEntries(
    Object.entries(SISTEMAS).flatMap(([id, nome]) => {
      const l = LOCAIS.find((x) => x.nome === nome);
      return l ? [[Number(id), endereco('/sistemas', data, hoje, l.chave === 'sim' ? {} : { sistema: l.chave })]] : [];
    }),
  );
}

export function MolduraPainel({
  pagina,
  usuario,
  data,
  hoje,
  manter = [],
  children,
}: {
  pagina: (typeof PAGINAS)[number]['chave'];
  usuario: { nome: string; email: string };
  data: string;
  hoje: string;
  /** parâmetros da URL que a troca de data deve manter (ex.: sistema escolhido) */
  manter?: string[];
  children: ReactNode;
}) {
  return (
    <div className="pnl pi-pnl" id="pnl">
      <link rel="stylesheet" href="/acesso/vendor/leaflet/leaflet.css" precedence="default" />

      <header className="pnl-top">
        <div className="pnl-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/legado/logo/spaguas_white.png" alt="SP Águas" />
          <div>
            <h1>Painel de Segurança Hídrica</h1>
            <span>Situação hídrica e análise dos sistemas produtores da RMSP - Sala de Situação Alfredo Pisani</span>
          </div>
        </div>
        <Form action="" scroll={false} className="pnl-busca" key={data}>
          <label htmlFor="pnlDataInput">
            <i className="bi bi-calendar3" /> Data de referência
          </label>
          <div className="pnl-busca-campo">
            <input type="date" id="pnlDataInput" name="data" defaultValue={data} min="2010-01-01" max={hoje} />
            <button type="submit" title="Buscar" aria-label="Buscar">
              <i className="bi bi-search" />
            </button>
          </div>
          {manter.length > 0 && (
            <Suspense fallback={null}>
              <CamposDaUrl nomes={manter} />
            </Suspense>
          )}
        </Form>

        <div className="pnl-top-meta">
          <Relogio />
          <div className="pnl-data">
            Referência:{' '}
            <Suspense fallback={<strong>{dataBr(data)}</strong>}>
              <DataReferencia data={data} />
            </Suspense>
          </div>
          <div className="pnl-atualiza">
            <i className="bi bi-arrow-repeat" /> atualiza a cada hora · {dataHora(new Date())}
          </div>
          <form action={sair} className="pi-usuario">
            <span title={usuario.email}>
              <i className="bi bi-person-circle" /> {usuario.nome}
            </span>
            <button type="submit">
              <i className="bi bi-box-arrow-right" /> Sair
            </button>
          </form>
        </div>
      </header>

      <nav className="pi-abas" aria-label="Páginas do painel interativo">
        {PAGINAS.map((p) => (
          <Link
            key={p.chave}
            href={endereco(p.caminho, data, hoje)}
            className={`pi-aba${p.chave === pagina ? ' is-ativo' : ''}`}
            aria-current={p.chave === pagina ? 'page' : undefined}
          >
            <i className={`bi ${p.icone}`} /> {p.rotulo}
          </Link>
        ))}
      </nav>

      {children}
      <BotaoTopo classe="acesso-subir pi-subir" />
    </div>
  );
}
