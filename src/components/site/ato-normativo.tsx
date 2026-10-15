import Link from 'next/link';
import type { ReactNode } from 'react';
import '@/styles/legado/pagina-resolucao-ana-daee.css';

const ARTIGO = /^Art(?:\.|igo) (\d+)[º°]?/;
const ROTULO = /^(Art\. \d+º|Artigo \d+[º°]? -|§ \d+[º°.](?: -)?|Parágrafo único(?:\.| -)|[IVX]+ [-–]|[a-z]\)) /;
const URL = /(https?:\/\/\S*[\w/])/;

/** Título de capítulo ou seção, entre os dispositivos. */
export type Titulo = { titulo: string; subtitulo: string };
type Artigo = { numero: number; titulos: Titulo[]; itens: string[] };

/** Agrupa os dispositivos por artigo ("Art. Nº" ou "Artigo Nº" abre um grupo). */
function artigos(dispositivos: (string | Titulo)[]): Artigo[] {
  const lista: Artigo[] = [];
  let titulos: Titulo[] = [];
  for (const t of dispositivos) {
    if (typeof t !== 'string') {
      titulos.push(t);
      continue;
    }
    const m = ARTIGO.exec(t);
    if (m) {
      lista.push({ numero: Number(m[1]), titulos, itens: [t] });
      titulos = [];
    } else lista.at(-1)?.itens.push(t);
  }
  return lista;
}

/** Um parágrafo do ato, com o rótulo ("Art. 1º", "§ 2º", "I -", "a)") em destaque. */
export function Dispositivo({ texto }: { texto: string }) {
  const rotulo = ROTULO.exec(texto)?.[1] ?? '';
  const tipo = rotulo.startsWith('Art') ? 'artigo' : /^[IVX]/.test(rotulo) ? 'inciso' : /^[a-z]\)/.test(rotulo) ? 'alinea' : 'paragrafo';
  return (
    <p className={`res-${tipo}`}>
      <strong>{rotulo}</strong>
      {texto
        .slice(rotulo.length)
        .split(URL)
        .map((parte, i) =>
          i % 2 ? (
            <a key={i} href={parte} target="_blank" rel="noopener noreferrer">
              {parte}
            </a>
          ) : (
            parte
          ),
        )}
    </p>
  );
}

/**
 * Página padrão de ato normativo (resolução, deliberação): faixa de título com
 * os dados da publicação, índice lateral por artigo e o texto em coluna de leitura.
 */
export function AtoNormativo({
  trilha,
  kicker,
  titulo,
  ementa,
  dados,
  orgaos,
  destaque,
  preambulo,
  verbo,
  dispositivos,
  assuntos,
  anexo,
  assinaturas = [],
  anexos = [],
}: {
  /** Último item da trilha (depois de Início › Documentos). */
  trilha: string;
  kicker: string;
  titulo: string;
  ementa: string;
  dados: { icone: string; texto: string }[];
  /** Logos dos órgãos que assinam o ato. */
  orgaos?: ReactNode;
  /** Cartão de resumo antes do texto (entra no índice). */
  destaque?: { id: string; rotulo: string; conteudo: ReactNode };
  preambulo: string[];
  /** "Resolvem:", "Delibera:"... */
  verbo: string;
  dispositivos: (string | Titulo)[];
  /** Assunto de cada artigo, só para o índice lateral (não faz parte do texto oficial). */
  assuntos: Record<number, string>;
  /** Quadro ou figura a mostrar logo depois de um dispositivo. */
  anexo?: (dispositivo: string) => ReactNode;
  assinaturas?: { nome: string; cargo: string }[];
  /** Anexos do ato, cada um num cartão depois do texto (entram no índice). */
  anexos?: { id: string; rotulo: string; conteudo: ReactNode }[];
}) {
  const lista = artigos(dispositivos);
  return (
    <>
      <section className="sssp-page-hero">
        <div className="container">
          <div className="res-hero">
            <div className="sssp-page-hero__inner">
              <div className="sssp-breadcrumb">
                <Link href="/">Início</Link>
                <i className="bi bi-chevron-right" />
                <Link href="/documentos">Documentos</Link>
                <i className="bi bi-chevron-right" />
                <span>{trilha}</span>
              </div>
              <span className="sssp-page-kicker">
                <i className="bi bi-file-text" />
                {kicker}
              </span>
              <h1>{titulo}</h1>
              <p>{ementa}</p>
              <ul className="res-hero__dados">
                {dados.map((d) => (
                  <li key={d.texto}>
                    <i className={`bi ${d.icone}`} /> {d.texto}
                  </li>
                ))}
              </ul>
            </div>
            {orgaos && <div className="res-hero__orgaos">{orgaos}</div>}
          </div>
        </div>
      </section>

      <main className="sssp-main">
        <div className="container">
          <div className="res-grade">
            <aside className="res-indice">
              <nav className="sssp-section-card" aria-label="Índice do documento">
                <div className="sssp-section-card__body">
                  <h2>Nesta página</h2>
                  <ol>
                    {destaque && (
                      <li>
                        <a href={`#${destaque.id}`}>{destaque.rotulo}</a>
                      </li>
                    )}
                    <li>
                      <a href="#preambulo">Preâmbulo</a>
                    </li>
                    {lista.map((a) => (
                      <li key={a.numero}>
                        <a href={`#art-${a.numero}`}>
                          <strong>Art. {a.numero}º</strong> {assuntos[a.numero]}
                        </a>
                      </li>
                    ))}
                    {anexos.map((x) => (
                      <li key={x.id}>
                        <a href={`#${x.id}`}>{x.rotulo}</a>
                      </li>
                    ))}
                  </ol>
                </div>
              </nav>
            </aside>

            <div className="res-conteudo">
              {destaque?.conteudo}

              <article className="sssp-section-card res-texto">
                <div className="sssp-section-card__body">
                  <section id="preambulo">
                    {preambulo.map((t) => (
                      <p key={t}>{t}</p>
                    ))}
                  </section>

                  <h2 className="res-resolvem">{verbo}</h2>

                  {lista.map((a) => (
                    <section key={a.numero} id={`art-${a.numero}`}>
                      {a.titulos.map((t) => (
                        <h3 key={t.titulo + t.subtitulo} className="res-capitulo">
                          <small>{t.titulo}</small>
                          {t.subtitulo}
                        </h3>
                      ))}
                      {a.itens.map((t) => (
                        <div key={t}>
                          <Dispositivo texto={t} />
                          {anexo?.(t)}
                        </div>
                      ))}
                    </section>
                  ))}

                  {assinaturas.length > 0 && (
                    <div className="res-assinaturas">
                      {assinaturas.map((a) => (
                        <p key={a.nome}>
                          <strong>{a.nome}</strong>
                          {a.cargo}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </article>

              {anexos.map((x) => (
                <article key={x.id} id={x.id} className="sssp-section-card res-texto">
                  <div className="sssp-section-card__body">{x.conteudo}</div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
