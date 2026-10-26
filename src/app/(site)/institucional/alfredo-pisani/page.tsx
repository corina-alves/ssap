import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import '@/styles/legado/pagina-homenagem.css';
import {
  ASSINATURA,
  CHAMADA,
  COMPROMISSO,
  CONTRIBUICAO,
  DEPOIMENTOS,
  ENCERRAMENTO,
  FOTOS,
  INTRODUCAO,
  LEGADO,
  LEMA,
  MARCOS,
  MEMORIA,
  RETRATO,
} from '@/conteudo/homenagem-alfredo-pisani';

export const metadata: Metadata = {
  title: 'Homenagem a Alfredo Pisani',
  description: CHAMADA,
};

/** Parágrafo com os trechos entre ** em negrito. */
function Paragrafo({ texto }: { texto: string }) {
  return <p>{texto.split('**').map((parte, i) => (i % 2 ? <strong key={i}>{parte}</strong> : parte))}</p>;
}

export default function Pagina() {
  return (
    <>
      <section className="hm-hero">
        <div className="container">
          <div className="sssp-breadcrumb">
            <Link href="/">Início</Link>
            <i className="bi bi-chevron-right" />
            <span>Institucional</span>
            <i className="bi bi-chevron-right" />
            <span>Homenagem a Alfredo Pisani</span>
          </div>
          <div className="hm-hero__grade">
            <div>
              <span className="hm-hero__kicker">Homenagem</span>
              <h1>Alfredo Pisani</h1>
              <p className="hm-hero__lema">{LEMA}</p>
              <p>{CHAMADA}</p>
              <p className="hm-hero__nota">
                <i className="bi bi-star-fill" /> {MEMORIA}
              </p>
            </div>
            {RETRATO ? (
              <figure className="hm-hero__retrato">
                <div className="hm-hero__imagem">
                  <Image src={RETRATO.src} alt={RETRATO.legenda} fill sizes="(max-width: 991px) 90vw, 520px" priority />
                </div>
                <figcaption>{RETRATO.legenda}</figcaption>
              </figure>
            ) : (
              <div className="hm-hero__cartao">
                <i className="bi bi-water" />
                <strong>Sala de Situação</strong>
                <span>Alfredo Pisani</span>
                <small>SP-Águas</small>
              </div>
            )}
          </div>
        </div>
      </section>

      <main className="sssp-main hm-main">
        <div className="container">
          <div className="hm-duas">
            <section>
              <h2 className="hm-titulo">Sua trajetória</h2>
              {INTRODUCAO.map((t) => (
                <Paragrafo key={t} texto={t} />
              ))}
            </section>
            <aside className="hm-legado">
              <h2>
                <i className="bi bi-water" /> Sua contribuição para a Sala de Situação
              </h2>
              {CONTRIBUICAO.map((t) => (
                <Paragrafo key={t} texto={t} />
              ))}
            </aside>
          </div>

          <section className="hm-secao">
            <h2 className="hm-titulo">Linha do tempo</h2>
            <p className="hm-sub">Marcos da sua contribuição para a Sala de Situação</p>
            <ol className="hm-linha">
              {MARCOS.map((m) => (
                <li key={m.titulo}>
                  <div className="hm-linha__cabeca">
                    <i className={`bi ${m.icone}`} />
                    {m.ano && <strong>{m.ano}</strong>}
                  </div>
                  <h3>{m.titulo}</h3>
                  <p>{m.texto}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="hm-secao hm-texto">
            <h2 className="hm-titulo">Conhecimento, dedicação e compromisso público</h2>
            {COMPROMISSO.map((t) => (
              <Paragrafo key={t} texto={t} />
            ))}
          </section>

          {FOTOS.length > 0 && (
            <section className="hm-secao">
              <h2 className="hm-titulo">Registros e memórias</h2>
              <p className="hm-sub">Imagens da sua trajetória e da Sala de Situação</p>
              <div className="hm-fotos">
                {FOTOS.map((f) => (
                  <figure key={f.src}>
                    <div className="hm-fotos__imagem">
                      <Image src={f.src} alt={f.legenda} fill sizes="(max-width: 575px) 100vw, (max-width: 991px) 50vw, 25vw" />
                    </div>
                    <figcaption>{f.legenda}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {DEPOIMENTOS.length > 0 && (
            <section className="hm-secao">
              <h2 className="hm-titulo">Depoimentos</h2>
              <p className="hm-sub">Mensagens de colegas que trabalharam com ele</p>
              <div className="hm-depoimentos">
                {DEPOIMENTOS.map((d) => (
                  <blockquote key={d.texto}>
                    <p>{d.texto}</p>
                    <footer>{d.autor}</footer>
                  </blockquote>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <section className="hm-final">
        <div className="container hm-final__grade">
          <i className="bi bi-droplet-fill hm-final__gota" />
          <div>
            <h2>Um legado que permanece</h2>
            {LEGADO.map((t) => (
              <Paragrafo key={t} texto={t} />
            ))}
          </div>
          <blockquote className="hm-final__frase">
            <i className="bi bi-quote" />
            {ENCERRAMENTO.map((t) => (
              <p key={t}>{t}</p>
            ))}
            <footer>
              {ASSINATURA}
              <br />
              {MEMORIA}.
            </footer>
          </blockquote>
        </div>
      </section>
    </>
  );
}
