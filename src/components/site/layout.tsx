import Link from 'next/link';
import type { ReactNode } from 'react';
import { BotaoTopo } from './botao-topo';

/** Peças do layout público — mesmas classes de components/ui.php e footer.php do site PHP. */

export function Hero({ kicker, titulo, texto, icone = 'bi-droplet-half' }: { kicker: string; titulo: string; texto: string; icone?: string }) {
  return (
    <section className="sssp-page-hero">
      <div className="container">
        <div className="sssp-page-hero__inner">
          <div>
            <div className="sssp-breadcrumb">
              <Link href="/">Início</Link>
              <i className="bi bi-chevron-right" />
              <span>{titulo}</span>
            </div>
            <span className="sssp-page-kicker">
              <i className={`bi ${icone}`} />
              {kicker}
            </span>
            <h1>{titulo}</h1>
            <p>{texto}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Secao({
  titulo,
  subtitulo,
  icone = 'bi-graph-up',
  id,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  icone?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className="sssp-section-card" id={id}>
      <div className="sssp-section-card__head">
        <div className="sssp-section-card__title">
          <span>
            <i className={`bi ${icone}`} />
          </span>
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
        </div>
      </div>
      <div className="sssp-section-card__body">{children}</div>
    </section>
  );
}

/** Conteúdo da página: <main class="sssp-main"><div class="container">. */
export function Principal({ children }: { children: ReactNode }) {
  return (
    <main className="sssp-main">
      <div className="container">{children}</div>
    </main>
  );
}

/** Contato institucional (valores da tabela "configuracoes" do PHP). */
const CONTATO = {
  email: 'salasituacaosp@spaguas.sp.gov.br',
  telefone: '(11) 3293-8200',
  endereco: 'Rua Boa Vista, 175 — Centro, São Paulo/SP · 1º andar, bloco B',
};

export function Rodape() {
  return (
    <>
      <footer className="sssp-footer" id="contato">
        <div className="sssp-footer__main">
          <div className="container">
            <div className="sssp-footer__grid">
              <div className="sssp-footer__brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/legado/logo/spaguas_white.png" alt="SP Águas" />
                <strong>Sala de Situação São Paulo</strong>
                <span>Alfredo Pisani — SP Águas, Agência de Águas do Estado de São Paulo</span>
              </div>
              <div>
                <h4>Institucional</h4>
                <ul>
                  <li>
                    <i className="bi bi-geo-alt" />
                    <span>{CONTATO.endereco}</span>
                  </li>
                  <li>
                    <i className="bi bi-envelope" />
                    <a href={`mailto:${CONTATO.email}`}>{CONTATO.email}</a>
                  </li>
                  <li>
                    <i className="bi bi-telephone" />
                    <span>{CONTATO.telefone}</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4>Links úteis</h4>
                <ul>
                  <li>
                    <i className="bi bi-house-door" />
                    <Link href="/">Início</Link>
                  </li>
                  <li>
                    <i className="bi bi-water" />
                    <Link href="/reservatorios">Reservatórios</Link>
                  </li>
                  <li>
                    <i className="bi bi-cloud-rain" />
                    <Link href="/precipitacao">Precipitação</Link>
                  </li>
                  <li>
                    <i className="bi bi-journal-text" />
                    <Link href="/boletins">Boletins</Link>
                  </li>
                  <li>
                    <i className="bi bi-box-arrow-up-right" />
                    <a href="https://www.spaguas.sp.gov.br/" target="_blank" rel="noopener">
                      Portal SP Águas
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        <div className="sssp-footer__bottom">
          &copy; {new Date().getFullYear()} SP Águas — Sala de Situação São Paulo · Alfredo Pisani
        </div>
      </footer>
      <BotaoTopo />
    </>
  );
}
