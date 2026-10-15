'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import type { ItemMenu, Menu } from '@/lib/acesso/painel';
import { BotaoTopo } from '@/components/site/botao-topo';

/**
 * Moldura das páginas logadas — mesma estrutura e classes de
 * includes/templates/app_inicio.php do PHP: barra superior + menu lateral.
 */

const corSala = (cor: string | null) => (cor ? ({ '--sala-cor': cor } as CSSProperties) : undefined);

function Item({ item, ativo }: { item: ItemMenu; ativo: boolean }) {
  return (
    <Link className={`acesso-menu__link${ativo ? ' ativo' : ''}`} href={item.href} aria-current={ativo ? 'page' : undefined}>
      <i className={`bi ${item.icone}`} />
      <span>{item.rotulo}</span>
    </Link>
  );
}

export function Moldura({
  menu,
  usuario,
  sair,
  children,
}: {
  menu: Menu;
  usuario: { nome: string; email: string };
  sair: () => Promise<void>;
  children: ReactNode;
}) {
  const caminho = usePathname();
  const busca = useSearchParams();

  // Comportamento do Bootstrap (menu no celular, menu do usuário), como no PHP.
  useEffect(() => {
    // @ts-expect-error — o pacote não publica tipos para o bundle
    void import('bootstrap/dist/js/bootstrap.bundle.min.js');
  }, []);

  const naVisaoGeral = caminho === '/acesso/salas/sala';
  const salaAtual = menu.salas.find((s) => (naVisaoGeral ? busca.get('s') === s.slug : busca.get('sala') === String(s.id))) ?? null;
  const dentro = (base: string) => caminho === base || caminho.startsWith(`${base}/`);
  // "Salas de Situação" (administração) não acende na visão geral de uma sala.
  const ativoAdmin = (i: ItemMenu) => dentro(i.caminho) && !(i.caminho === '/acesso/salas' && naVisaoGeral);

  return (
    <div className="acesso-app">
      <a className="visually-hidden-focusable acesso-pular" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className="acesso-topo">
        <div className="d-flex align-items-center gap-2">
          <button
            className="acesso-topo__menu d-lg-none"
            type="button"
            data-bs-toggle="offcanvas"
            data-bs-target="#acessoMenu"
            aria-controls="acessoMenu"
            aria-label="Abrir menu"
          >
            <i className="bi bi-list" />
          </button>
          <Link className="acesso-topo__marca" href="/acesso">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/acesso/img/spaguas_white.png" alt="SP-Águas" />
            <span>
              <strong>Salas de Situação</strong>
              <small>Área administrativa</small>
            </span>
          </Link>
          {salaAtual && (
            <span className="acesso-topo__sala" style={corSala(salaAtual.cor)}>
              <i className="bi bi-building" />
              {salaAtual.rotulo}
            </span>
          )}
        </div>
        <div className="dropdown">
          <button className="acesso-topo__usuario dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            <i className="bi bi-person-circle" />
            <span className="d-none d-sm-inline">{usuario.nome}</span>
          </button>
          <ul className="dropdown-menu dropdown-menu-end">
            <li>
              <span className="dropdown-item-text small text-secondary">{usuario.email}</span>
            </li>
            <li>
              <hr className="dropdown-divider" />
            </li>
            <li>
              <Link className="dropdown-item" href="/acesso/trocar-senha">
                <i className="bi bi-key me-2" />
                Trocar senha
              </Link>
            </li>
            <li>
              <form action={sair}>
                <button type="submit" className="dropdown-item">
                  <i className="bi bi-box-arrow-right me-2" />
                  Sair
                </button>
              </form>
            </li>
          </ul>
        </div>
      </header>

      <BotaoTopo classe="acesso-subir" />

      <div className="acesso-corpo">
        <nav className="acesso-menu offcanvas-lg offcanvas-start" id="acessoMenu" tabIndex={-1} aria-label="Menu principal">
          <div className="offcanvas-header d-lg-none">
            <strong>Menu</strong>
            <button type="button" className="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#acessoMenu" aria-label="Fechar" />
          </div>
          <div className="acesso-menu__rolagem">
            {menu.geral.map((i) => (
              <Item key={i.href} item={i} ativo={caminho === i.caminho} />
            ))}

            {menu.salas.length > 0 && (
              <>
                <p className="acesso-menu__titulo">Salas de Situação</p>
                {menu.salas.map((s) => {
                  const aberta = salaAtual?.id === s.id;
                  return (
                    <div key={s.id} className={`acesso-menu__sala${aberta ? ' aberta' : ''}`} style={corSala(s.cor)}>
                      <Link className={`acesso-menu__link acesso-menu__link--sala${aberta ? ' ativo' : ''}`} href={`/acesso/salas/sala?s=${s.slug}`}>
                        <i className="bi bi-building" />
                        <span>{s.rotulo}</span>
                      </Link>
                      {aberta && (
                        <div className="acesso-menu__sub">
                          {s.filhos.map((f) => (
                            <Item key={f.href} item={f} ativo={dentro(f.caminho)} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {menu.admin.length > 0 && (
              <>
                <p className="acesso-menu__titulo">Administração</p>
                {menu.admin.map((i) => (
                  <Item key={i.href} item={i} ativo={ativoAdmin(i)} />
                ))}
              </>
            )}
          </div>
        </nav>

        <main className="acesso-conteudo" id="conteudo">
          {children}
          <footer className="acesso-rodape">SP-Águas · Agência de Águas do Estado de São Paulo</footer>
        </main>
      </div>
    </div>
  );
}
