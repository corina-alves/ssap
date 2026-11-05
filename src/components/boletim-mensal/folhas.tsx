import type { ReactNode } from 'react';
import { DESCRICAO_SISTEMAS, OBSERVACAO_VAZOES, SLIDES_EDITAVEIS, TEXTO_PROTOCOLO, type SlideEditavel } from '@/conteudo/boletim-mensal';
import { mesExtenso, type DadosBoletim } from '@/lib/boletins-sala/boletim-mensal';
import { mapaUgrhis } from '@/lib/climatologia/mapa';
import { UGRHIS } from '@/lib/hidrologia/situacao-rios';
import type { LinhaVolumes } from '@/lib/hidrologia/volumes-mensais';
import { ESTAGIOS, LINK as LINK_PROTOCOLO } from '@/lib/integracoes/protocolo-escassez';
import { ImagemEditavel, TextoEditavel } from './editaveis';
import { GraficoComparativoVolumes, GraficoSistema } from './graficos';

/**
 * Slides do Boletim Mensal (16:9, 1280 × 720 px — o tamanho de um slide do
 * Google Slides), para a tela de edição e para a impressão em PDF.
 */

const num = (v: number | null | undefined, casas = 1) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const dataBr = (ymd: string) => `${ymd.slice(8)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const CORES_UGRHI = ['#f4a6a6', '#f6c38b', '#f7e08a', '#c9e48d', '#98d9a6', '#8fd3d1', '#94c1ea', '#b3a8e6', '#dba5dc', '#f2a7c4', '#e8c9a0'];

function Folha({ titulo, numero, children, classe }: { titulo?: string; numero: number; children: ReactNode; classe?: string }) {
  return (
    <section className={`bm-folha ${classe ?? ''}`} aria-label={`Slide ${numero}${titulo ? `: ${titulo}` : ''}`}>
      <header className="bm-topo">
        <span>Agência de Águas do Estado de São Paulo</span>
        <img src="/boletins/automatico/spaguas.png" alt="SP Águas" className="bm-logo" />
      </header>
      {titulo && <h2 className="bm-titulo">{titulo}</h2>}
      <div className="bm-corpo">{children}</div>
      <footer className="bm-rodape">
        <span className="bm-numero bm-so-tela">Slide {numero}</span>
      </footer>
    </section>
  );
}

function Fonte({ texto, link }: { texto?: string; link?: string }) {
  if (!texto) return null;
  return (
    <p className="bm-fonte">
      {texto}
      {link && (
        <>
          {' — '}
          <a href={link} target="_blank" rel="noopener noreferrer">
            {link.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        </>
      )}
    </p>
  );
}

type Comum = { d: DadosBoletim; salaId: number; editavel: boolean };

function SlideEditavelFolha({ s, numero, d, salaId, editavel }: Comum & { s: SlideEditavel; numero: number }) {
  const muitas = s.imagens.length > 2;
  return (
    <Folha titulo={s.titulo} numero={numero}>
      <div className={`bm-editavel ${s.texto ? 'bm-editavel--texto' : ''}`}>
        <div className={`bm-imagens bm-imagens--${Math.min(s.imagens.length, 4)} ${muitas ? 'bm-imagens--grade' : ''}`}>
          {s.imagens.map((i) => (
            <ImagemEditavel key={i.chave} salaId={salaId} mes={d.mes} chave={i.chave} legenda={i.legenda} arquivoId={d.conteudo.imagens[i.chave] ?? null} editavel={editavel} />
          ))}
        </div>
        {s.texto && (
          <div className="bm-lateral">
            <h3 className="bm-subtitulo">{s.texto}:</h3>
            <TextoEditavel chave={s.chave} inicial={d.conteudo.textos[s.chave] ?? ''} editavel={editavel} herdado={d.conteudo.herdados.includes(s.chave)} linhas={12} />
          </div>
        )}
      </div>
      <Fonte texto={s.fonte} link={s.link} />
    </Folha>
  );
}

function Capa({ d }: { d: DadosBoletim }) {
  return (
    <section className="bm-folha bm-capa" aria-label="Capa">
      <div className="bm-capa__texto">
        <h1>Boletim Mensal</h1>
        <p className="bm-capa__sala">Sala de Situação Alfredo Pisani - SSAP</p>
        <p className="bm-capa__ref">Referência: {mesExtenso(d.mes)}</p>
        <p className="bm-capa__sub">Acompanhamento Pluviométrico, Fluviométrico, Reservatórios e Previsão Climática.</p>
        <img src="/boletins/automatico/spaguas.png" alt="SP Águas" className="bm-capa__logo" />
      </div>
    </section>
  );
}

function MapaUgrhis() {
  const m = mapaUgrhis();
  return (
    <div className="bm-ugrhis">
      <svg viewBox={`0 0 ${m.largura} ${m.altura}`} className="bm-ugrhis__mapa" role="img" aria-label="Mapa das 22 UGRHIs do Estado de São Paulo">
        {m.formas.map((f) => (
          <g key={f.codigo}>
            <path d={f.d} fill={CORES_UGRHI[f.codigo % CORES_UGRHI.length]} stroke="#555" strokeWidth={0.8} />
            <text x={f.rotulo[0]} y={f.rotulo[1]} className="bm-ugrhis__rotulo">
              {f.codigo}
            </text>
          </g>
        ))}
      </svg>
      <ol className="bm-ugrhis__lista">
        {Object.entries(UGRHIS).map(([u, nome]) => (
          <li key={u}>
            <i style={{ background: CORES_UGRHI[Number(u) % CORES_UGRHI.length] }} />
            {u} - {nome}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Protocolo({ d, editavel }: Comum) {
  const p = d.protocolo;
  const total = p?.contagem ? Object.values(p.contagem).reduce((s, n) => s + n, 0) : 0;
  const resumo =
    p?.contagem && total
      ? `Em ${mesExtenso(`${p.ano}-${String(p.mes).padStart(2, '0')}`).toLowerCase()}, das ${total} subUGRHIs: ${ESTAGIOS.filter((e) => p.contagem![e.valor])
          .map((e) => `${p.contagem![e.valor]} no ${e.rotulo.toLowerCase()}`)
          .join(', ')}.`
      : null;
  return (
    <>
      <div className="bm-protocolo">
        <figure className="bm-figura">
          {p ? <img src={`/acesso/boletim_mensal/protocolo?ano=${p.ano}&mes=${p.mes}`} alt="Mapa de Escassez Hídrica da SP Águas" className="bm-imagem" /> : <div className="bm-sem-imagem">Mapa do Protocolo indisponível</div>}
          <figcaption>
            Figura 9: Mapa de Escassez Hídrica da SP Águas{p ? ` — mês de referência: ${mesExtenso(`${p.ano}-${String(p.mes).padStart(2, '0')}`)}` : ''}
          </figcaption>
          <div className="bm-legenda">
            {ESTAGIOS.map((e) => (
              <span key={e.valor}>
                <i style={{ background: e.cor }} />
                {e.rotulo}
                {p?.contagem ? ` (${p.contagem[e.valor] ?? 0})` : ''}
              </span>
            ))}
          </div>
        </figure>
        <div className="bm-lateral">
          {resumo && <p className="bm-destaque">{resumo}</p>}
          <TextoEditavel chave="protocolo" inicial={d.conteudo.textos.protocolo ?? TEXTO_PROTOCOLO.join('\n\n')} editavel={editavel} herdado={d.conteudo.herdados.includes('protocolo')} linhas={10} />
        </div>
      </div>
      <Fonte texto="Fonte: SP Águas — Protocolo de Escassez Hídrica" link={LINK_PROTOCOLO} />
    </>
  );
}

const nomeLinha = (l: LinhaVolumes) => (l.nome === 'SIM' ? 'Sistema Integrado Metropolitano (SIM)' : l.nome);

function TabelaVolumes({ d }: { d: DadosBoletim }) {
  const t = d.volumes;
  const r = t.rotulos;
  return (
    <>
      <table className="bm-tabela bm-tabela--volumes">
        <thead>
          <tr>
            <th colSpan={8} className="bm-tabela__titulo">
              VOLUMES SISTEMAS PRODUTORES (SABESP e ANA)
            </th>
          </tr>
          <tr>
            {['SISTEMA', `Vol. Atual ${r.atual} (%)`, `Vol. Mês Anterior ${r.mesAnterior} (%)`, `Vol. Ano Anterior ${r.anoAnterior} (%)`, `Dif. entre o Vol. Atual e Vol. Mês Anterior (${r.atual}) (p.p.)`, `Dif. entre o Vol. Atual e Vol. Ano Anterior (${r.anoAnteriorAno}) (p.p.)`, `Acumulado chuva no Mês ${r.atual} (mm)`, 'Média Histórica (mm)'].map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...t.sistemas, t.sim].map((l) => (
            <tr key={l.id} className={l.nome === 'SIM' ? 'bm-forte' : undefined}>
              <th>{nomeLinha(l)}</th>
              {[l.atual, l.mesAnterior, l.anoAnterior, l.difMes, l.difAno, l.chuvaMes, l.mediaHistorica].map((v, i) => (
                <td key={i}>{num(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {t.faltas.length > 0 && <p className="bm-aviso">A SABESP não publicou os volumes de {t.faltas.map(dataBr).join(', ')}: essas colunas ficam sem valor.</p>}
    </>
  );
}

function Sistema({ d, chave, numero, figura }: { d: DadosBoletim; chave: string; numero: number; figura: number }) {
  const g = d.sistemas.graficos.find((x) => x.chave === chave);
  const nome = chave === 'sim' ? 'Sistema Integrado Metropolitano (SIM)' : (g?.nome ?? chave);
  return (
    <Folha numero={numero}>
      <div className="bm-sistema">
        <div className="bm-sistema__esq">
          <p className="bm-descricao">{DESCRICAO_SISTEMAS[chave]}</p>
          {g ? (
            <div className="bm-grafico bm-grafico--sistema">
              <GraficoSistema nome={nome} rotulos={d.sistemas.rotulos} valores={g.valores} rotuloChuva={g.rotuloChuva} />
            </div>
          ) : (
            <div className="bm-sem-imagem">Sem dados do SSD para este sistema.</div>
          )}
          <p className="bm-legenda-figura">
            Figura {figura}: {nome}
          </p>
        </div>
        <table className="bm-tabela bm-tabela--sistema">
          <thead>
            <tr>
              <th colSpan={chave === 'sao-lourenco' ? 4 : 5} className="bm-tabela__titulo">
                {nome.toUpperCase()}
              </th>
            </tr>
            <tr>
              <th>Ano</th>
              <th>Volume Útil (%)</th>
              <th>Chuva Acumulada (mm)</th>
              <th>Vazão Afluente (m³/s)</th>
              {chave !== 'sao-lourenco' && <th>Vazão Defluente (m³/s)</th>}
            </tr>
          </thead>
          <tbody>
            {d.sistemas.rotulos.map((rot, i) => (
              <tr key={rot} className={i === d.sistemas.rotulos.length - 1 ? 'bm-forte' : undefined}>
                <th>{rot.replace(" '", '/')}</th>
                <td>{num(g?.valores.volume[i])}</td>
                <td>{num(g?.valores.chuva[i])}</td>
                <td>{num(g?.valores.afluente[i], 2)}</td>
                {chave !== 'sao-lourenco' && <td>{num(g?.valores.defluente[i], 2)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="bm-fonte">{OBSERVACAO_VAZOES} Fonte: SSD SP Águas.</p>
    </Folha>
  );
}

/** Todos os slides do boletim, na ordem do boletim manual. */
export function FolhasBoletim({ d, salaId, editavel }: Comum) {
  const c = { d, salaId, editavel };
  const ed = (chave: string, numero: number) => <SlideEditavelFolha {...c} s={SLIDES_EDITAVEIS[chave]!} numero={numero} />;
  const sistemas = ['cantareira', 'alto-tiete', 'guarapiranga', 'cotia', 'rio-grande', 'rio-claro', 'sao-lourenco', 'sim'];
  return (
    <div className="bm-folhas">
      <Capa d={d} />
      {ed('municipios', 2)}
      {ed('idw-municipios', 3)}
      <Folha titulo="Localização das Unidades de Gerenciamento de Recursos Hídricos (UGRHIs)" numero={4}>
        <MapaUgrhis />
        <p className="bm-legenda-figura">Figura 3: Localização das Unidades de Gerenciamento de Recursos Hídricos (UGRHIs).</p>
      </Folha>
      {ed('ugrhis', 5)}
      {ed('idw-ugrhis', 6)}
      {ed('hidroapp-mapas', 7)}
      {ed('hidroapp-tabela', 8)}
      <Folha titulo="Protocolo de Escassez Hídrica" numero={9}>
        <Protocolo {...c} />
      </Folha>
      <Folha titulo={`Dados referentes ao último dia do mês de ${mesExtenso(d.mes).split('/')[0]} (${dataBr(d.volumes.datas.atual)})`} numero={10}>
        <TabelaVolumes d={d} />
        <p className="bm-fonte">Fonte: SABESP (Mananciais) e ANA (SAR) — volume do Cantareira pela ANA.</p>
      </Folha>
      <Folha titulo={`Dados referentes ao último dia do mês de ${mesExtenso(d.mes).split('/')[0]} (${dataBr(d.volumes.datas.atual)})`} numero={11}>
        <div className="bm-volumes">
          <div>
            <p className="bm-legenda-figura">Figura 10: Comparativo dos volumes úteis (%) do ano e mês anterior com o ano e mês atual.</p>
            <div className="bm-grafico bm-grafico--volumes">
              <GraficoComparativoVolumes t={d.volumes} />
            </div>
          </div>
          <div className="bm-lateral">
            <h3 className="bm-subtitulo">Análise dos Sistemas Produtores:</h3>
            <div className="bm-texto">
              <p>{d.analiseVolumes ?? 'Sem dados de volume para montar a análise.'}</p>
            </div>
          </div>
        </div>
      </Folha>
      {sistemas.map((s, i) => (
        <Sistema key={s} d={d} chave={s} numero={12 + i} figura={11 + i} />
      ))}
      {ed('previsao-anomalia', 20)}
      {ed('previsao-sazonal', 21)}
      {ed('tsm', 22)}
      {ed('previsao-semanal', 23)}
    </div>
  );
}
