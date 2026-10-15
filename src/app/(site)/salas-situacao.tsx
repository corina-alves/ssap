import Link from 'next/link';
import mapa from '@/conteudo/ugrhi-mini.json';

type Sala = {
  href: string;
  externo?: boolean;
  img: string;
  cor: 'azul' | 'verde';
  icone: string;
  tag: string;
  titulo: [string, string];
  texto: string;
  /** Códigos das UGRHIs pintadas no mapinha (vazio: o Estado inteiro pintado). */
  ugrhis: number[];
  boletins: string;
};

const SALAS: Sala[] = [
  {
    href: '/',
    img: 'sssp.jpg',
    cor: 'azul',
    icone: 'bi-building',
    tag: 'Estadual',
    titulo: ['Sala de Situação', 'Alfredo Pisani'],
    texto: 'Monitoramento integrado do Estado de São Paulo, sistemas produtores e rede hidrometeorológica.',
    ugrhis: [],
    boletins: 'e relatórios',
  },
  {
    href: 'https://www.sspcj.org.br/',
    externo: true,
    img: 'piracicaba.jpg',
    cor: 'azul',
    icone: 'bi-droplet-fill',
    tag: 'Bacias PCJ',
    titulo: ['Sala de Situação', 'PCJ'],
    texto: 'Monitoramento das condições hidrológicas das bacias dos rios Piracicaba, Capivari e Jundiaí.',
    ugrhis: [5],
    boletins: 'e documentos',
  },
  {
    href: 'https://salasituacaohidrobs.com.br/agem-painel/mapa',
    externo: true,
    img: 'sala_nph.png',
    cor: 'azul',
    icone: 'bi-water',
    tag: 'Baixada Santista',
    titulo: ['Sala de Situação', 'Baixada Santista'],
    texto: 'A Sala de Situação de Recursos Hídricos da Baixada Santista monitora em tempo real chuvas, rios e variáveis oceanográficas.',
    ugrhis: [7],
    boletins: 'e alertas',
  },
  {
    href: '/boletins/ribeira',
    img: 'outorga.jpg',
    cor: 'verde',
    icone: 'bi-tree-fill',
    tag: 'Vale do Ribeira',
    titulo: ['Sala de Situação', 'Vale do Ribeira'],
    texto: 'Acompanhamento das condições hidrológicas da região do Vale do Ribeira.',
    ugrhis: [11],
    boletins: 'e relatórios',
  },
];

/** Página inicial — "Rede de Salas de Situação": um cartão por sala, com a bacia destacada no mapa do Estado. */
export function SalasSituacao() {
  return (
    <>
      {/* Contorno das UGRHIs, definido uma vez e reaproveitado em cada cartão (<use>). */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          {mapa.ugrhis.map((u) => (
            <path key={u.codigo} id={`ugrhi-${u.codigo}`} d={u.d} />
          ))}
        </defs>
      </svg>
      <div className="row row-cols-1 row-cols-md-2 row-cols-xxl-4 g-3">
        {SALAS.map((s) => {
          const conteudo = (
            <>
              <span className="rs-card__tag">
                <i className={`bi ${s.icone}`} />
                {s.tag}
              </span>
              <h3>
                {s.titulo[0]}
                <br />
                {s.titulo[1]}
              </h3>
              <div className="rs-card__meio">
                <p>{s.texto}</p>
                <svg viewBox={`0 0 ${mapa.largura} ${mapa.altura}`} className="rs-mapa" aria-hidden>
                  {mapa.ugrhis.map((u) => (
                    <use key={u.codigo} href={`#ugrhi-${u.codigo}`} className={!s.ugrhis.length || s.ugrhis.includes(u.codigo) ? 'rs-mapa__destaque' : undefined} />
                  ))}
                </svg>
              </div>
              <ul className="rs-card__itens">
                <li>
                  <i className="bi bi-bar-chart-fill" />
                  <span>
                    <strong>Chuvas</strong>em tempo real
                  </span>
                </li>
                <li>
                  <i className="bi bi-water" />
                  <span>
                    <strong>Níveis e</strong>vazões
                  </span>
                </li>
                <li>
                  <i className="bi bi-file-earmark-text" />
                  <span>
                    <strong>Boletins</strong>
                    {s.boletins}
                  </span>
                </li>
              </ul>
              <div className="rs-card__rodape">
                <span className="rs-card__botao">
                  Acessar sala <i className="bi bi-arrow-right" />
                </span>
                <span className="rs-card__estado">Operacional</span>
              </div>
            </>
          );
          const atributos = { className: `rs-card rs-card--${s.cor}`, style: { backgroundImage: `url('/legado/img/${s.img}')` } };
          return (
            <div className="col" key={s.tag}>
              {s.externo ? (
                <a href={s.href} target="_blank" rel="noopener" {...atributos}>
                  {conteudo}
                </a>
              ) : (
                <Link href={s.href} {...atributos}>
                  {conteudo}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
