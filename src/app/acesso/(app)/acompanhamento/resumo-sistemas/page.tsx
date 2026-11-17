import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Cabecalho, Mensagem } from '@/components/acesso/pecas';
import { Esqueleto } from '@/components/carregamento';
import { AvisoData, dataDaUrl, FiltroData } from '@/components/hidrologia/filtro-data';
import { exigirSala } from '@/lib/auth/acl';
import { PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { ORDEM, resumoSistemas, textoAnalise, type LinhaResumo } from '@/lib/hidrologia/resumo-sistemas';
import { textoReserva } from '@/lib/integracoes/comum';
import { AnaliseResumo } from './analise';
import '@/styles/acesso/acompanhamento.css';

export const metadata: Metadata = { title: 'Resumo dos sistemas produtores' };

const num = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const sinal = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), 1)}`;

/** Um sistema: volume, estágio (cor da borda e texto), variação no ano e no dia. */
function Cartao({ s, ano }: { s: LinhaResumo; ano: number }) {
  const d = s.difAno;
  const tipo = d === null ? 'sem' : d > 0 ? 'sobe' : d < 0 ? 'desce' : 'igual';
  const icone = { sobe: 'bi-arrow-up', desce: 'bi-arrow-down', igual: 'bi-arrow-right', sem: 'bi-dash' }[tipo];
  // Cantareira: volume da ANA; a comparação que caiu para a SABESP (ANA sem a outra data) fica indicada.
  const pelaSabesp = s.fonteVolume === 'ANA' ? [s.fonteDifDia === 'SABESP' && 'no dia', s.fonteDifAno === 'SABESP' && `vs ${ano}`].filter(Boolean) : [];
  return (
    <article className={`rsm-cartao est-${s.estagio.classe}`}>
      <h2 className="rsm-cartao__nome">{s.curto}</h2>
      <strong className="rsm-cartao__volume">{num(s.volume, 2)}%</strong>
      <span className="rsm-cartao__estagio">
        {s.estagio.codigo} · {s.estagio.nome}
      </span>
      <span className={`rsm-variacao rsm-variacao--${tipo}`}>
        <i className={`bi ${icone}`} aria-hidden /> {d === null ? `sem dado de ${ano}` : `${sinal(d)} p.p. vs ${ano}`}
      </span>
      <span className="rsm-cartao__nota">No dia: {s.difDia === null ? '—' : `${sinal(s.difDia)} p.p.`}</span>
      {s.fonteVolume === 'ANA' && (
        <span className="rsm-cartao__nota">
          Fonte: ANA{pelaSabesp.length ? ` (${pelaSabesp.join(' e ')}: SABESP)` : ''}
        </span>
      )}
    </article>
  );
}

/** Enquanto a SABESP e a ANA respondem: os 8 cartões e o texto em esqueleto. */
function Carregando() {
  return (
    <div role="status" aria-label="Carregando os dados dos reservatórios…">
      <div className="rsm-cartoes">
        {ORDEM.map((id) => (
          <div key={id} className="rsm-cartao">
            <Esqueleto largura="70%" />
            <Esqueleto className="esq-valor" />
            <Esqueleto largura="55%" />
            <Esqueleto largura="45%" />
          </div>
        ))}
      </div>
      <div className="acesso-card rsm-analise">
        {Array.from({ length: 9 }, (_, i) => (
          <Esqueleto key={i} largura={i === 0 ? '60%' : `${40 + ((i * 13) % 35)}%`} />
        ))}
      </div>
    </div>
  );
}

async function Conteudo({ data }: { data: string }) {
  const r = await resumoSistemas(data);
  if (!r.ok) return <Mensagem tipo="erro">{r.mensagem}</Mensagem>;
  const d = r.dados;
  return (
    <>
      {r.desatualizado && <Mensagem tipo="aviso">{textoReserva(r.fonte, r.obtidoEm)}</Mensagem>}
      <AvisoData pedida={data} usada={d.data} />
      <div className="rsm-cartoes">
        {d.linhas.map((s) => (
          <Cartao key={s.id} s={s} ano={d.anoComparacao} />
        ))}
      </div>
      <AnaliseResumo texto={textoAnalise(d)} />
      <p className="acp-nota">
        Volume útil e variações: SABESP — Mananciais. Cantareira: volume útil da ANA (SAR) quando publicado no dia; cada variação compara a mesma
        fonte nas duas datas. Variações em pontos percentuais (p.p.): no dia, em relação a {d.dataOntem.split('-').reverse().join('/')}; no ano,
        em relação a {d.dataAnoAnterior.split('-').reverse().join('/')}.
      </p>
    </>
  );
}

/**
 * Acompanhamento — resumo dos sistemas produtores da RMSP (porte do
 * boletim-dos-reservatorios.php do SSSP): cartões por sistema e o texto da
 * análise para copiar. A data vem da URL (?data=). Mesmo acesso do Painel
 * interativo: visualizar_dashboard na Sala Alfredo Pisani.
 */
export default async function ResumoSistemas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSala(SALA_PAINEL, PERMISSAO_PAINEL);
  const data = dataDaUrl((await searchParams).data);

  return (
    <>
      <Cabecalho
        titulo="Resumo dos sistemas produtores"
        subtitulo="Boletim diário dos reservatórios da RMSP: volume útil, variação no dia e comparação com o mesmo dia do ano anterior, com o texto da análise pronto para copiar."
        trilha={[
          ['Início', '/acesso'],
          ['Acompanhamento', null],
          ['Resumo dos sistemas', null],
        ]}
      />
      <section className="cartao mb-3 rsm-filtro">
        <FiltroData data={data} />
      </section>
      <Suspense key={data} fallback={<Carregando />}>
        <Conteudo data={data} />
      </Suspense>
    </>
  );
}
