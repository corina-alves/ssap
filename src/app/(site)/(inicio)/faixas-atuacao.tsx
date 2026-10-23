import Link from 'next/link';
import { Suspense } from 'react';
import { centroArea } from '@/components/graficos/mapa-pontos';
import areas from '@/conteudo/sistemas-produtores-areas.json';
import { contornoSP, type Contorno } from '@/lib/integracoes/ibge';
import { ID_SIM } from '@/lib/integracoes/sabesp';
import { painelHoje } from './dados-inicio';

const PAINEL =
  'https://app.powerbi.com/view?r=eyJrIjoiNzE3NGY2ZGQtYjc1OC00ZThiLTgxZDgtMDhlZDQ1OTM0YmI2IiwidCI6IjNhNzhiMGNkLTdjOGUtNDkyOS04M2Q1LTE5MGE2Y2MwMTM2NSJ9';

/** Publicações oferecidas ao lado do mapa. */
const PUBLICACOES = [
  {
    href: '/boletins/integrado',
    icone: 'bi-layers',
    titulo: 'Boletim Integrado',
    texto: 'Boletins integrados entre as agências.',
  },
  {
    href: '/nota_informativa',
    icone: 'bi-info-circle',
    titulo: 'Nota Informativa',
    texto: 'Nota Informativa Conjunta SP-Águas e Arsesp.',
  },
];

/** Deslocamento do rótulo no mapa, em unidades do viewBox, para os nomes não se sobreporem. */
const AJUSTE_ROTULO: Record<string, [number, number]> = {
  'Alto Tietê': [34, -16],
  'Rio Grande': [28, 24],
  'Rio Claro': [14, 20],
  Cotia: [-30, -30],
  Guarapiranga: [-12, 4],
  'São Lourenço': [-16, 16],
};

/** Áreas de drenagem dos sistemas produtores, coloridas pelo estágio de cada um. */
function MapaSistemas({ contorno, classes }: { contorno: Contorno | null; classes: Map<string, string> }) {
  const sistemas = areas.features.map((f) => ({ nome: f.properties.sistema, area: f.geometry.coordinates as Contorno }));
  const coords = sistemas.flatMap((s) => s.area.flat(2));
  const margem = 0.14;
  const latMin = Math.min(...coords.map((p) => p[1])) - margem;
  const latMax = Math.max(...coords.map((p) => p[1])) + margem;
  const lonMin = Math.min(...coords.map((p) => p[0])) - margem;
  const lonMax = Math.max(...coords.map((p) => p[0])) + margem;
  const k = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  const L = 420;
  const escala = L / ((lonMax - lonMin) * k);
  const A = Math.round((latMax - latMin) * escala);
  const x = (lon: number) => (lon - lonMin) * k * escala;
  const y = (lat: number) => (latMax - lat) * escala;
  const tracar = (c: Contorno) =>
    c.map((pol) => pol.map((anel) => anel.map(([lo, la], i) => `${i ? 'L' : 'M'}${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join('') + 'Z').join('')).join('');
  const titulo = `Áreas de drenagem dos sistemas produtores: ${sistemas.map((s) => `${s.nome} (${classes.get(s.nome) ?? 'sem dado'})`).join(', ')}`;

  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="fx-mapa" role="img" aria-label={titulo}>
      {contorno && <path d={tracar(contorno)} className="fx-mapa__estado" />}
      {sistemas.map((s) => (
        <path key={s.nome} d={tracar(s.area)} fillRule="evenodd" className={`fx-mapa__area fx-cor--${classes.get(s.nome) ?? 'vazio'}`} />
      ))}
      {sistemas.map((s) => {
        const c = centroArea(s.area);
        if (!c) return null;
        const [dx, dy] = AJUSTE_ROTULO[s.nome] ?? [0, 0];
        return (
          <text key={s.nome} x={x(c[0]) + dx} y={y(c[1]) + dy + 5} textAnchor="middle" className="fx-mapa__rotulo">
            {s.nome}
          </text>
        );
      })}
    </svg>
  );
}

/** Estágio de cada produtor (sem o SIM), pelo nome. */
async function situacao() {
  const r = await painelHoje();
  const sistemas = r.ok ? r.dados.sistemas.filter((s) => s.id !== ID_SIM) : [];
  return new Map(sistemas.map((s) => [s.nome, s.estagio.classe]));
}

/** Mapa colorido: espera a SABESP (cores) e o IBGE (contorno do Estado), em paralelo. */
async function MapaColorido() {
  const [classes, c] = await Promise.all([situacao(), contornoSP()]);
  return <MapaSistemas contorno={c.ok ? c.dados : null} classes={classes} />;
}

/**
 * Página inicial — "Acompanhamento das FAIXAS de atuação": chamada do painel,
 * mapa dos sistemas e atalhos para o Boletim Integrado e a Nota Informativa.
 * O mapa surge sem cores e é pintado quando a SABESP responder.
 */
export function FaixasAtuacao() {
  return (
    <div className="fx-banner">
      <div className="fx-banner__texto">
        <span className="fx-banner__tag">
          <i className="bi bi-geo-alt" />
          SP-Águas e Arsesp
        </span>
        <h3>
          Faixas de Atuação dos <span>Sistemas de Abastecimento</span>
        </h3>
        <p>Acompanhe o enquadramento das faixas de atuação e a evolução das condições hidrológicas dos principais sistemas monitorados.</p>
        <a href={PAINEL} target="_blank" rel="noopener" className="fx-banner__botao">
          <i className="bi bi-bar-chart-line" />
          Acessar Painel de Faixas
          <i className="bi bi-arrow-right" />
        </a>
      </div>

      <Suspense fallback={<MapaSistemas contorno={null} classes={new Map()} />}>
        <MapaColorido />
      </Suspense>

      <div className="fx-situacao">
        <div className="fx-situacao__cabeca">
          <i className="bi bi-journal-text" />
          <h4>Publicações</h4>
        </div>
        <ul className="fx-links">
          {PUBLICACOES.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="fx-link">
                <i className={`bi ${p.icone} fx-link__icone`} />
                <span>
                  <strong>{p.titulo}</strong>
                  <small>{p.texto}</small>
                </span>
                <i className="bi bi-arrow-right fx-link__seta" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
