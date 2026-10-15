import { centroArea } from '@/components/graficos/mapa-pontos';
import areas from '@/conteudo/sistemas-produtores-areas.json';
import { dataBr } from '@/lib/formato';
import { ESTAGIOS, painelReservatorios } from '@/lib/hidrologia/reservatorios';
import { contornoSP, type Contorno } from '@/lib/integracoes/ibge';
import { ID_SIM } from '@/lib/integracoes/sabesp';

const PAINEL =
  'https://app.powerbi.com/view?r=eyJrIjoiNzE3NGY2ZGQtYjc1OC00ZThiLTgxZDgtMDhlZDQ1OTM0YmI2IiwidCI6IjNhNzhiMGNkLTdjOGUtNDkyOS04M2Q1LTE5MGE2Y2MwMTM2NSJ9';

/** Faixa de volume útil de cada estágio (lib/hidrologia/reservatorios: LIMITES_ESTAGIO). */
const FAIXAS: Record<string, string> = { E0: '≥ 60%', E1: '40% – 60%', E2: '30% – 40%', E3: '20% – 30%', E4: '< 20%' };

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

/** Página inicial — "Acompanhamento das FAIXAS de atuação": chamada do painel e situação dos sistemas. */
export async function FaixasAtuacao() {
  const [r, c] = await Promise.all([painelReservatorios(), contornoSP()]);
  const sistemas = r.ok ? r.dados.sistemas.filter((s) => s.id !== ID_SIM) : [];
  const classes = new Map(sistemas.map((s) => [s.nome, s.estagio.classe]));

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

      <MapaSistemas contorno={c.ok ? c.dados : null} classes={classes} />

      <div className="fx-situacao">
        <div className="fx-situacao__cabeca">
          <i className="bi bi-calendar3" />
          <h4>Situação dos Sistemas</h4>
          {r.ok && <small>Atualizado em {dataBr(r.dados.dataUsada)}</small>}
        </div>
        {r.ok ? (
          <div className="fx-contagem">
            {ESTAGIOS.map((e) => (
              <div key={e.codigo} className={`fx-contagem__item fx-cor--${e.classe}`}>
                <strong>{sistemas.filter((s) => s.estagio.codigo === e.codigo).length}</strong>
                <span>{e.nome}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="fx-situacao__erro">{r.mensagem}</p>
        )}
        <h5>Faixas de atuação dos sistemas (volume útil)</h5>
        <ol className="fx-escala">
          {ESTAGIOS.map((e) => (
            <li key={e.codigo} className={`fx-cor--${e.classe}`}>
              <strong>{e.nome}</strong>
              <span>{FAIXAS[e.codigo]}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
