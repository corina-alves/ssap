'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Menu principal — mesmo markup e classes do components/header.php do site
 * PHP (Bootstrap 5 navbar + dropdowns), com os endereços do Next.
 */

type Item = { href: string; rotulo: string; icone: string; novaAba?: boolean };
type Grupo = { rotulo: string; icone: string; cabecalho: string; itens: (Item | 'divisor')[]; ativos: string[] };

const SIMPLES: (Item & { ativos: string[] })[] = [
  { href: '/reservatorios', rotulo: 'Reservatórios', icone: 'bi-water', ativos: ['/reservatorios'] },
  { href: '/precipitacao', rotulo: 'Precipitação', icone: 'bi-cloud-rain', ativos: ['/precipitacao'] },
  { href: '/vazao', rotulo: 'Vazões', icone: 'bi-activity', ativos: ['/vazao'] },
  { href: '/monitoramento_hidrologico', rotulo: 'Monitoramento', icone: 'bi-broadcast-pin', ativos: ['/monitoramento_hidrologico'] },
  { href: '/protocolo_escassez', rotulo: 'Escassez', icone: 'bi-exclamation-triangle', ativos: ['/protocolo_escassez'] },
];

const GRUPOS: Grupo[] = [
  {
    rotulo: 'Análises',
    icone: 'bi-graph-up-arrow',
    cabecalho: 'Cenários e tendências',
    ativos: ['/curva_contingencia', '/evolucao-sim-cant', '/previsao', '/previsao-reservatorios'],
    itens: [
      { href: '/curva_contingencia', rotulo: 'Curva de Contingência', icone: 'bi-bezier2' },
      { href: '/evolucao-sim-cant', rotulo: 'Evolução Histórica', icone: 'bi-clock-history' },
      { href: '/previsao', rotulo: 'Previsão para os Municípios', icone: 'bi-cloud-sun' },
      { href: '/previsao-reservatorios', rotulo: 'Previsão para os Sistemas Produtores', icone: 'bi-cloud-rain-heavy' },
      'divisor',
      // painel de parede: tela própria, sem o menu do site
      { href: '/painel', rotulo: 'Painel de Situação Hídrica', icone: 'bi-speedometer2', novaAba: true },
    ],
  },
  {
    rotulo: 'Boletins',
    icone: 'bi-journal-text',
    cabecalho: 'Publicações',
    ativos: ['/boletins'],
    itens: [
      { href: '/boletins', rotulo: 'Todos os Boletins', icone: 'bi-journals' },
      'divisor',
      { href: '/boletins/diario', rotulo: 'Boletim Diário', icone: 'bi-calendar2-day' },
      { href: '/boletins/mensal', rotulo: 'Chuvas Mensal', icone: 'bi-cloud-rain-heavy' },
      { href: '/boletins/spi', rotulo: 'Índice SPI', icone: 'bi-bar-chart' },
      { href: '/boletins/integrado', rotulo: 'Boletim Integrado', icone: 'bi-layers' },
      { href: '/boletins/alto-tiete-pinheiros', rotulo: 'Boletim Alto Tietê Pinheiros', icone: 'bi-layers' },
      { href: '/boletins/ribeira', rotulo: 'Boletim Vale do Ribeira', icone: 'bi-layers' },
    ],
  },
  {
    rotulo: 'Documentos',
    icone: 'bi-file-earmark-text',
    cabecalho: 'Categorias',
    ativos: ['/documentos', '/nota_informativa'],
    itens: [
      { href: '/documentos/resolucoes-cantareira', rotulo: 'Resoluções do Cantareira', icone: 'bi-file-earmark-ruled' },
      { href: '/protocolo_escassez', rotulo: 'Protocolo de Escassez', icone: 'bi-exclamation-triangle' },
      { href: '/documentos/deliberacoes', rotulo: 'Deliberações', icone: 'bi-file-earmark-check' },
      { href: '/documentos/atos-administrativos', rotulo: 'Atos Administrativos', icone: 'bi-file-earmark-text' },
      // { href: '/documentos/outros-documentos', rotulo: 'Outros Documentos', icone: 'bi-folder2-open' },
      'divisor',
      { href: '/nota_informativa', rotulo: 'Nota Informativa', icone: 'bi-info-circle' },
    ],
  },
  {
    rotulo: 'Outorgas',
    icone: 'bi-droplet',
    cabecalho: 'Outorgas',
    ativos: ['/situacao-outorgas', '/vazoes-outorgadas', '/atos-administrativos-outorga'],
    itens: [
      // { href: '/situacao-outorgas', rotulo: 'Outorgas', icone: 'bi-droplet' },
      { href: '/vazoes-outorgadas', rotulo: 'Vazões Outorgadas', icone: 'bi-graph-up-arrow' },
      { href: '/atos-administrativos-outorga', rotulo: 'Atos Administrativos de Outorga', icone: 'bi-file-earmark-text' },
    ],
  },
];

export function Cabecalho() {
  const caminho = usePathname();
  const ativo = (lista: string[]) => (lista.some((a) => caminho === a || caminho.startsWith(`${a}/`)) ? ' active' : '');

  // Comportamento do Bootstrap (abrir menu no celular, dropdowns), como no PHP.
  useEffect(() => {
    // @ts-expect-error — o pacote não publica tipos para o bundle
    void import('bootstrap/dist/js/bootstrap.bundle.min.js');
  }, []);

  return (
    <nav className="navbar navbar-expand-xl menu sticky-top" aria-label="Navegação principal">
      <div className="container sssp-nav-shell">
        <Link className="navbar-brand sssp-brand" href="/" aria-label="Sala de Situação Alfredo Pisani - Início">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/legado/logo/spaguas_white.png" alt="SP-Águas" className="sssp-brand-logo" />
          <span className="sssp-brand-copy d-none d-sm-flex">
            <strong>Sala de Situação</strong>
            <small>Alfredo Pisani</small>
          </span>
        </Link>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#menuPrincipal"
          aria-controls="menuPrincipal"
          aria-expanded="false"
          aria-label="Abrir menu principal"
        >
          <span className="navbar-toggler-icon" />
        </button>

        <div className="collapse navbar-collapse" id="menuPrincipal">
          <ul className="navbar-nav ms-auto align-items-xl-center sssp-nav-list">
            {SIMPLES.map((i) => (
              <li className="nav-item" key={i.href}>
                <Link className={`nav-link${ativo(i.ativos)}`} href={i.href}>
                  <i className={`bi ${i.icone} sssp-nav-icon`} />
                  {i.rotulo}
                </Link>
              </li>
            ))}
            {GRUPOS.map((g) => (
              <li className="nav-item dropdown" key={g.rotulo}>
                <a className={`nav-link dropdown-toggle${ativo(g.ativos)}`} href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                  <i className={`bi ${g.icone} sssp-nav-icon`} />
                  {g.rotulo}
                </a>
                <ul className="dropdown-menu dropdown-menu-end">
                  <li>
                    <span className="dropdown-header">{g.cabecalho}</span>
                  </li>
                  {g.itens.map((i, n) =>
                    i === 'divisor' ? (
                      <li key={`d${n}`}>
                        <hr className="dropdown-divider" />
                      </li>
                    ) : (
                      <li key={i.href}>
                        <Link className="dropdown-item" href={i.href} {...(i.novaAba ? { target: '_blank', rel: 'noopener' } : {})}>
                          <i className={`bi ${i.icone}`} />
                          <span>{i.rotulo}</span>
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
