import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cache, Suspense } from 'react';
import '@/styles/acesso/climatologia.css';
import { Cabecalho } from '@/components/acesso/pecas';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { FONTE_CLIMATOLOGIA, FONTE_TELEMETRIA, METODOLOGIA } from '@/conteudo/climatologia-metodologia';
import { acl } from '@/lib/auth/acl';
import { COBERTURA_MIN, RAIO_KM } from '@/lib/climatologia/espacial';
import { mapaUgrhis } from '@/lib/climatologia/mapa';
import { anosPorFonte, atualizacao, climatologias, comparacoesLocais, municipios, postosDoMes, redePorAno, resumoUgrhis, serieRegional, type ResumoUgrhi } from '@/lib/climatologia/painel';
import { ANOS_NORMAL, PERIODO_PADRAO, type Estatistica } from '@/lib/climatologia/regras';
import {
  ACUMULADOS,
  comparar,
  corDesvio,
  faixaDesvio,
  fonteDoAno,
  lerSelecao,
  maisRecente,
  MESES,
  MESES_LONGOS,
  mesesDoAcumulado,
  parametros,
  periodosReferencia,
  ROTULO_FONTE,
  ROTULO_TIPO,
  rotuloReferencia,
  type Comparacao,
  type ComparacaoLocal,
  type Fonte,
  type MesLocal,
  type Selecao,
} from '@/lib/climatologia/selecao';
import { UGRHIS } from '@/lib/hidrologia/situacao-rios';
import { Abas } from './abas';
import { GraficoAnual, GraficoMatriz, GraficoMensal, GraficoRede } from './graficos';
import { TabelaComparacao, type LinhaComparacao } from './tabela-comparacao';
import { TabelaLocal, type LinhaLocal } from './tabela-local';

export const metadata: Metadata = { title: 'Climatologia de precipitação' };

const BASE = '/acesso/climatologia';
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const mm = (v: number | null, casas = 1) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} mm`);
const pct = (v: number | null, sinal = false) => (v === null ? '—' : `${sinal && v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const dataHora = (d: Date | null) => (d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');
const data = (d: string) => d.split('-').reverse().join('/');

// Uma leitura do banco por requisição, dividida entre os blocos da página.
const dadosSerie = cache((criterio: Selecao['criterio'], metodo: Selecao['metodo'], fonte: Fonte) => serieRegional({ criterio, metodo, fonte }));
const dadosAtualizacao = cache(() => atualizacao());
const dadosAnos = cache(() => anosPorFonte());
const dadosMunicipios = cache(() => municipios());
const fonteDe = async (s: Selecao): Promise<Fonte> => s.fonte ?? fonteDoAno(s.ano, await dadosAnos());

export default async function Climatologia({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await acl();
  if (!a.podeEmAlguma('visualizar_climatologia')) redirect('/acesso/sem-acesso');
  const sp = await searchParams;
  const s = lerSelecao(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, um(v)])));

  return (
    <>
      <Cabecalho
        titulo="Climatologia de precipitação"
        subtitulo="Chuva observada por UGRHI, município e estação, comparada à média climatológica calculada com o acervo histórico de pluviômetros do SIBH/SP Águas."
        trilha={[
          ['Painel', '/acesso'],
          ['Climatologia de precipitação', null],
        ]}
      />
      <Abas atual="painel" />
      <Suspense fallback={<Carregando texto="Carregando filtros…" />}>
        <Filtros s={s} />
      </Suspense>
      <Suspense key={parametros(s)} fallback={<Carregando texto="Carregando dados processados…" />}>
        <Conteudo s={s} />
      </Suspense>
    </>
  );
}

function Carregando({ texto }: { texto: string }) {
  return (
    <div className="clima-carregando" role="status">
      <span className="spinner-border spinner-border-sm" /> {texto}
    </div>
  );
}

async function Filtros({ s }: { s: Selecao }) {
  const [anosF, muns, fonte] = await Promise.all([dadosAnos(), dadosMunicipios(), fonteDe(s)]);
  const serie = await dadosSerie(s.criterio, s.metodo, fonte);
  const recente = maisRecente(serie, s.ugrhi);
  const ano = s.ano ?? recente?.ano ?? new Date().getFullYear();
  const mes = s.mes ?? (s.ano ? 12 : (recente?.mes ?? 12));
  const anos = [...new Set([...anosF.acervo, ...anosF.telemetria, ano])].sort((a, b) => b - a);
  const munsUgrhi = muns.filter((m) => m.ugrhi === s.ugrhi);
  const automatica = fonteDoAno(s.ano, anosF);
  return (
    <form className="clima-filtros card card-body mb-3" method="get" action={BASE}>
      <div className="row g-2">
        <Campo rotulo="UGRHI" classe="col-md-4">
          <SelectAutoEnvio id="u" name="u" defaultValue={String(s.ugrhi)} className="form-select form-select-sm">
            {Object.entries(UGRHIS).map(([u, nome]) => (
              <option key={u} value={u}>
                {u} — {nome}
              </option>
            ))}
          </SelectAutoEnvio>
        </Campo>
        <Campo rotulo="Município" classe="col-md-4">
          <SelectAutoEnvio id="mun" name="mun" defaultValue={munsUgrhi.some((m) => m.codIbge === s.mun) ? String(s.mun) : ''} className="form-select form-select-sm">
            <option value="">Todos da UGRHI ({munsUgrhi.length})</option>
            {munsUgrhi.map((m) => (
              <option key={m.codIbge} value={m.codIbge}>
                {m.nome}
              </option>
            ))}
          </SelectAutoEnvio>
        </Campo>
        <Campo rotulo="Ano" classe="col-6 col-md-2">
          <SelectAutoEnvio id="ano" name="ano" defaultValue={String(ano)} className="form-select form-select-sm">
            {anos.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </SelectAutoEnvio>
        </Campo>
        <Campo rotulo="Mês" classe="col-6 col-md-2">
          <SelectAutoEnvio id="mes" name="mes" defaultValue={String(mes)} className="form-select form-select-sm">
            {MESES_LONGOS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </SelectAutoEnvio>
        </Campo>
        <Campo rotulo="Período acumulado" classe="col-md-4">
          <SelectAutoEnvio id="acum" name="acum" defaultValue={s.acumulado} className="form-select form-select-sm">
            {Object.entries(ACUMULADOS).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </SelectAutoEnvio>
        </Campo>
        <Campo rotulo="Chuva observada" classe="col-md-4">
          <SelectAutoEnvio id="fonte" name="fonte" defaultValue={s.fonte ?? ''} className="form-select form-select-sm">
            <option value="">Automática (agora: {automatica === 'acervo' ? 'acervo' : 'telemetria'})</option>
            <option value="acervo">Acervo — pluviômetros convencionais</option>
            <option value="telemetria">Telemetria — SIBH, API v2</option>
          </SelectAutoEnvio>
        </Campo>
        <Campo rotulo="Período de referência" classe="col-6 col-md-4">
          <SelectAutoEnvio id="ref" name="ref" defaultValue={s.referencia} className="form-select form-select-sm">
            {Object.entries(periodosReferencia()).map(([p, anos]) => (
              <option key={p} value={p}>
                {rotuloReferencia(p, anos)}
              </option>
            ))}
          </SelectAutoEnvio>
        </Campo>
        <Campo rotulo="Qualidade dos registros" classe="col-6 col-md-4">
          <SelectAutoEnvio id="crit" name="crit" defaultValue={s.criterio} className="form-select form-select-sm">
            <option value="padrao">Padrão (aceita pequenas falhas)</option>
            <option value="estrito">Estrito (todos os registros)</option>
          </SelectAutoEnvio>
        </Campo>
        <Campo rotulo="Média espacial da UGRHI" classe="col-6 col-md-4">
          <SelectAutoEnvio id="met" name="met" defaultValue={s.metodo} className="form-select form-select-sm">
            <option value="aritmetica">Aritmética (soma dos postos ÷ nº de postos)</option>
            <option value="thiessen">Thiessen (ponderada por área)</option>
          </SelectAutoEnvio>
        </Campo>
        <div className="col-6 col-md-4 d-flex align-items-end gap-2">
          {s.posto && <input type="hidden" name="posto" value={s.posto} />}
          <noscript>
            <button className="btn btn-sm btn-primary">Aplicar</button>
          </noscript>
          <Link href={BASE} className="btn btn-sm btn-outline-secondary">
            Limpar filtros
          </Link>
        </div>
      </div>
    </form>
  );
}

function Campo({ rotulo, classe, children }: { rotulo: string; classe: string; children: React.ReactNode }) {
  return (
    <div className={classe}>
      <label className="form-label small mb-1">{rotulo}</label>
      {children}
    </div>
  );
}

/** Chuva de cada mês do ano (null = mês sem dado válido). */
const porMes = (meses: readonly MesLocal[] | undefined) => Array.from({ length: 12 }, (_, i) => {
  const m = meses?.find((x) => x.mes === i + 1);
  return m?.valido ? m.chuva : null;
});

async function Conteudo({ s }: { s: Selecao }) {
  const fonte = await fonteDe(s);
  const [serie, serieAcervo, at, muns] = await Promise.all([dadosSerie(s.criterio, s.metodo, fonte), dadosSerie(s.criterio, s.metodo, 'acervo'), dadosAtualizacao(), dadosMunicipios()]);
  if (!serieAcervo.length) {
    return (
      <div className="alert alert-warning">
        Ainda não há dados processados. A importação do acervo (<code>npm run clima:importar</code>) e o cálculo (<code>npm run clima:calcular</code>) precisam rodar antes.
      </div>
    );
  }
  const f = { criterio: s.criterio, metodo: s.metodo, periodo: s.periodo, fonte };
  const recente = maisRecente(serie, s.ugrhi);
  const ano = s.ano ?? recente?.ano ?? Math.max(...serieAcervo.map((p) => p.ano));
  const mes = s.mes ?? (s.ano ? 12 : (recente?.mes ?? 12));
  const sel: Selecao = { ...s, ano, mes };
  const munSel = s.mun ? (muns.find((m) => m.codIbge === s.mun) ?? null) : null;
  // municípios da UGRHI (ou o escolhido) e postos: observado (fonte) × média histórica (acervo)
  const [clima, rede, locais, postosUsados, resumo] = await Promise.all([
    climatologias(f, serieAcervo),
    redePorAno(s.criterio),
    comparacoesLocais(f, { ugrhi: s.ugrhi, mun: munSel?.codIbge ?? null }, ano, mes, s.acumulado, muns),
    s.acumulado === 'mes' ? postosDoMes(f, s.ugrhi, ano, mes) : Promise.resolve([]),
    resumoUgrhis(f, ano, mes),
  ]);
  const { cmpMunicipios: cmpMun, cmpPostos, normaisMunicipios: normaisMun, normaisPostos, mesesMunicipios: mesesMun, periodos } = locais;
  const codigosMun = locais.municipios;
  const postoSel = s.posto ? (locais.postos.find((p) => p.id === s.posto) ?? null) : null;

  const comparacao = comparar(serie, clima, ano, mes, s.acumulado);
  const atual = comparacao.find((c) => c.ugrhi === s.ugrhi)!;
  const rotuloPeriodo = `${s.periodo[0]}–${s.periodo[1]}`;
  const periodoCurto = s.periodo[1] - s.periodo[0] + 1 < ANOS_NORMAL;
  const ultimoAnoAcervo = Math.max(...serieAcervo.filter((p) => p.valido).map((p) => p.ano));
  // mês em andamento (telemetria): a chuva vai do dia 1 até o último dia encerrado
  const ateDia = serie.find((p) => p.ano === ano && p.mes === mes && p.ateDia)?.ateDia ?? null;
  const ateData = ateDia ? `${String(ateDia).padStart(2, '0')}/${String(mes).padStart(2, '0')}` : null;
  const nomeMes = MESES_LONGOS[mes - 1]!;
  const intervalo =
    s.acumulado === 'mes'
      ? ateDia ? `1º a ${ateDia} de ${nomeMes} de ${ano}` : `${nomeMes} de ${ano}`
      : s.acumulado === 'ytd'
        ? ateDia ? `janeiro a ${ateDia} de ${nomeMes} de ${ano}` : `janeiro a ${nomeMes} de ${ano}`
        : ateDia ? `${ano} até ${ateData}` : `ano de ${ano}`;
  const rotuloObservado = ateData ? `Acumulado até ${ateData} (mm)` : 'Observado (mm)';
  const rotuloMedia = s.acumulado === 'mes' ? `Média de ${nomeMes} (mm)` : 'Média histórica (mm)';
  const mesSel = serie.find((p) => p.ugrhi === s.ugrhi && p.ano === ano && p.mes === mes);
  const rotuloTipo = (tipo: Estatistica['tipo'], anos: number) => (tipo === 'normal' ? `Normal ${rotuloPeriodo}` : tipo === 'media_historica' ? `Média histórica (${anos} anos)` : 'Média histórica');

  // foco dos indicadores e do gráfico mensal: estação, município ou UGRHI
  const daUgrhi = serie.filter((p) => p.ugrhi === s.ugrhi);
  const doAno = (m: number) => daUgrhi.find((p) => p.ano === ano && p.mes === m);
  const est = clima.get(s.ugrhi) ?? [];
  type Foco = { titulo: string; nota: string; c: ComparacaoLocal | Comparacao; est: Estatistica[]; observado: (number | null)[]; arquivo: string };
  let foco: Foco;
  if (postoSel) {
    const c = cmpPostos.get(postoSel.id)!;
    const estPosto = c.referencia === 'municipio' ? (normaisMun.get(postoSel.codIbge!) ?? []) : (normaisPostos.get(postoSel.id) ?? []);
    foco = { titulo: `${postoSel.prefixo} — ${postoSel.nome ?? 'posto'}`, nota: `${postoSel.dono ?? 'rede não informada'} · ${postoSel.municipio ?? 'município não informado'}`, c, est: estPosto, observado: porMes(locais.mesesPostos.get(postoSel.id)), arquivo: `climatologia-posto-${postoSel.prefixo}-${ano}` };
  } else if (munSel) {
    const c = cmpMun.get(munSel.codIbge)!;
    foco = { titulo: munSel.nome, nota: `município — UGRHI ${munSel.ugrhi ?? '?'}`, c, est: normaisMun.get(munSel.codIbge) ?? [], observado: porMes(mesesMun.get(munSel.codIbge)), arquivo: `climatologia-${munSel.codIbge}-${ano}` };
  } else {
    foco = { titulo: `UGRHI ${s.ugrhi} — ${UGRHIS[s.ugrhi]}`, nota: s.metodo === 'aritmetica' ? 'soma dos postos da UGRHI ÷ número de postos' : 'média ponderada por área (Thiessen)', c: atual, est, observado: Array.from({ length: 12 }, (_, i) => doAno(i + 1)?.chuva ?? null), arquivo: `climatologia-ugrhi${s.ugrhi}-${ano}` };
  }
  const rotuloClima = rotuloTipo(foco.c.tipo, foco.c.anosClimatologia);
  const referenciaMun = 'referencia' in foco.c && foco.c.referencia === 'municipio';

  // destaques: 3 maiores déficits e 3 maiores excedentes
  const comDesvio = comparacao.filter((c) => c.desvio !== null).sort((a, b) => a.desvio! - b.desvio!);
  const deficit = new Set(comDesvio.slice(0, 3).filter((c) => c.desvio! < 0).map((c) => c.ugrhi));
  const excedente = new Set(comDesvio.slice(-3).filter((c) => c.desvio! > 0).map((c) => c.ugrhi));
  const linhas: LinhaComparacao[] = comparacao.map((c) => ({
    ugrhi: c.ugrhi,
    nome: UGRHIS[c.ugrhi]!,
    href: `${BASE}?${parametros(sel, { ugrhi: c.ugrhi, mun: null, posto: null })}`,
    observado: c.observado,
    climatologia: c.climatologia,
    percentual: c.percentual,
    desvio: c.desvio,
    tipo: c.tipo === 'normal' ? 'normal' : ROTULO_TIPO[c.tipo],
    destaque: deficit.has(c.ugrhi) ? 'deficit' : excedente.has(c.ugrhi) ? 'excedente' : null,
    aviso: c.coberturaBaixa ? `cobertura baixa: ${c.postos ?? 0} postos, ${pct(c.cobertura)} da área` : null,
  }));

  const linhasMun: LinhaLocal[] = codigosMun.map((cod) => {
    const c = cmpMun.get(cod)!;
    const m = muns.find((x) => x.codIbge === cod)!;
    const media = c.climatologia === null ? 'sem média histórica no acervo' : c.tipo === 'normal' ? null : rotuloTipo(c.tipo, c.anosClimatologia).toLowerCase();
    return { chave: cod, nome: m.nome, href: `${BASE}?${parametros(sel, { ugrhi: m.ugrhi ?? s.ugrhi, mun: cod, posto: null })}`, detalhe: [`UGRHI ${m.ugrhi ?? '?'}`, media].filter(Boolean).join(' · '), grupo: m.ugrhi, postos: c.postos, observado: c.observado, climatologia: c.climatologia, percentual: c.percentual, desvio: c.desvio };
  });
  const linhasPostos: LinhaLocal[] = locais.postos.map((p) => {
    const c = cmpPostos.get(p.id)!;
    const per = periodos.get(p.id);
    const ref = c.referencia === 'municipio' ? 'média do município' : c.referencia === null ? 'sem média histórica' : c.tipo === 'normal' ? null : rotuloTipo(c.tipo, c.anosClimatologia).toLowerCase();
    const detalhe = [p.dono, p.municipio, ref, per ? `telemetria desde ${data(per.ini)}` : null].filter(Boolean).join(' · ');
    return { chave: p.id, nome: `${p.prefixo} — ${p.nome ?? 'posto'}`, href: `${BASE}?${parametros(sel, { posto: p.id })}`, detalhe, postos: null, observado: c.observado, climatologia: c.climatologia, percentual: c.percentual, desvio: c.desvio };
  });

  // histórico (sempre do acervo): totais anuais, extremos e rede
  const historico = serieAcervo.filter((p) => p.ugrhi === s.ugrhi);
  const anuais = [...new Set(historico.map((p) => p.ano))]
    .map((y) => ({ ano: y, meses: historico.filter((p) => p.ano === y && p.valido && p.chuva !== null) }))
    .filter((x) => x.meses.length === 12)
    .map((x) => ({ ano: x.ano, chuva: Math.round(x.meses.reduce((t, p) => t + p.chuva!, 0) * 10) / 10 }));
  const matriz = Array.from({ length: 22 }, (_, i) => i + 1).map((u) => ({
    rotulo: `${u} — ${UGRHIS[u]}`,
    // só meses encerrados: o mês em andamento ainda não se compara com a média do mês
    desvios: Array.from({ length: 12 }, (_, m) => {
      const c = comparar(serie, clima, ano, m + 1, 'mes')[u - 1]!;
      return c.ateDia ? null : c.desvio;
    }),
  }));
  const redeUgrhi = rede.filter((r) => r.ugrhi === s.ugrhi);
  const extremos = (lista: { ano: number; chuva: number }[]) => {
    const ref = lista.filter((x) => x.ano >= s.periodo[0] && x.ano <= s.periodo[1]).sort((a, b) => a.chuva - b.chuva);
    return { secos: ref.slice(0, 5), chuvosos: ref.slice(-5).reverse() };
  };
  const extAno = extremos(anuais);
  const extMes = extremos(historico.filter((p) => p.mes === mes && p.valido && p.chuva !== null).map((p) => ({ ano: p.ano, chuva: p.chuva! })));
  const consulta = parametros(sel);
  const escopo = munSel ? munSel.nome : `UGRHI ${s.ugrhi}`;
  const meses = mesesDoAcumulado(s.acumulado, mes);

  return (
    <>
      <p className="clima-foco small mb-2">
        <i className="bi bi-geo-alt me-1" aria-hidden="true" />
        <strong>{foco.titulo}</strong> <span className="text-secondary">— {foco.nota}. Chuva observada: {ROTULO_FONTE[fonte]}.</span>
        {(postoSel || munSel) && (
          <Link className="ms-2" href={`${BASE}?${parametros(sel, postoSel && munSel ? { posto: null } : { mun: null, posto: null })}`} scroll={false}>
            {postoSel && munSel ? `voltar para ${munSel.nome}` : `voltar para a UGRHI ${s.ugrhi}`}
          </Link>
        )}
      </p>
      <section className="clima-cards" aria-label="Indicadores principais">
        <Cartao
          rotulo={`${ateDia ? 'Acumulado' : 'Observado'} — ${intervalo}`}
          valor={mm(foco.c.observado)}
          nota={foco.c.observado === null ? 'sem dado válido em todos os meses do intervalo' : 'coberturaBaixa' in foco.c && foco.c.coberturaBaixa ? `cobertura baixa: ${foco.c.postos ?? 0} postos` : foco.titulo}
        />
        <Cartao rotulo={rotuloClima} valor={mm(foco.c.climatologia)} nota={referenciaMun ? 'do município (o posto não tem série no acervo)' : foco.c.tipo === 'normal' ? `${foco.c.anosClimatologia} anos válidos de 30` : ROTULO_TIPO[foco.c.tipo]} />
        <Cartao rotulo="% da média histórica" valor={pct(foco.c.percentual)} nota={faixaDesvio(foco.c.desvio)} cor={corDesvio(foco.c.desvio)} />
        <Cartao rotulo="Desvio" valor={pct(foco.c.desvio, true)} nota={foco.c.desvioMm === null ? '—' : `${foco.c.desvioMm > 0 ? '+' : ''}${mm(foco.c.desvioMm)}`} />
        {postoSel ? (
          <Cartao rotulo="Rede" valor={postoSel.dono ?? '—'} nota={periodos.get(postoSel.id) ? `telemetria de ${data(periodos.get(postoSel.id)!.ini)} a ${data(periodos.get(postoSel.id)!.fim)}` : fonte === 'acervo' ? 'acervo histórico' : '—'} />
        ) : (
          <Cartao rotulo="Estações consideradas" valor={foco.c.postos === null ? '—' : String(foco.c.postos)} nota={s.acumulado === 'mes' ? 'postos com o mês válido' : 'menor número entre os meses'} />
        )}
        {!postoSel && !munSel ? (
          <Cartao rotulo="Cobertura" valor={atual.cobertura === null ? '—' : pct(atual.cobertura)} nota={`área a até ${RAIO_KM} km de um posto (mín. ${COBERTURA_MIN}%)`} />
        ) : (
          <Cartao rotulo="Fonte do observado" valor={fonte === 'acervo' ? 'Acervo' : 'Telemetria'} nota={fonte === 'acervo' ? 'pluviômetros convencionais' : 'SIBH, API v2'} />
        )}
      </section>

      {foco.c.climatologia === null ? (
        <div className="alert alert-warning py-2 small">
          <i className="bi bi-exclamation-triangle me-1" />
          {postoSel || munSel
            ? `Não há média histórica no acervo para ${postoSel ? 'este posto nem para o município dele' : 'este município'} no período ${rotuloPeriodo} (mínimo de 10 anos com o mês válido).`
            : `Não há anos válidos suficientes no período ${rotuloPeriodo} para calcular a média deste intervalo nesta UGRHI.`}
        </div>
      ) : periodoCurto ? (
        <div className="alert alert-info py-2 small">
          <i className="bi bi-info-circle me-1" />
          Período recente ({rotuloPeriodo}): o valor é a média histórica de {foco.c.anosClimatologia} anos, não a normal climatológica (que é de 30 anos). A média vem do acervo, que tem dados até {ultimoAnoAcervo}; os anos seguintes entram quando o acervo for atualizado — a rede telemétrica não entra na média.
        </div>
      ) : (
        foco.c.tipo !== 'normal' && (
          <div className="alert alert-warning py-2 small">
            <i className="bi bi-exclamation-triangle me-1" />
            Menos de 80% dos anos do período {rotuloPeriodo} têm dado válido: o valor é a média histórica do período disponível ({foco.c.anosClimatologia} anos), não a normal climatológica.
          </div>
        )
      )}
      {referenciaMun && (
        <div className="alert alert-info py-2 small">
          <i className="bi bi-info-circle me-1" />
          Este posto não tem série longa no acervo: a comparação usa a média histórica do município, calculada com os pluviômetros convencionais dele. Em relevo acidentado a chuva varia em poucos quilômetros — trate como indicação.
        </div>
      )}
      {ateDia && (
        <div className="alert alert-info py-2 small">
          <i className="bi bi-calendar-event me-1" />
          Mês em andamento: chuva acumulada de 1º a {ateData} (dias já encerrados), comparada com a média de {nomeMes} inteiro. Até o fim do mês é natural ficar abaixo da média.
        </div>
      )}
      {!postoSel && !munSel && mesSel && mesSel.chuva !== null && !mesSel.valido && s.acumulado === 'mes' && (
        <div className="alert alert-secondary py-2 small">
          Cobertura baixa nesta UGRHI em {nomeMes} de {ano}: {mesSel.postos} postos, {pct(mesSel.cobertura)} da área a até {RAIO_KM} km de um posto (mínimo {COBERTURA_MIN}%). O valor é a média desses postos e pode não representar a UGRHI; meses assim não entram na média histórica.
        </div>
      )}
      {fonte === 'telemetria' && !serie.length && (
        <div className="alert alert-secondary py-2 small">
          A chuva da rede telemétrica ainda está sendo carregada (<code>npm run clima:telemetria</code>). Os meses aparecem conforme os dias chegam.
        </div>
      )}

      <div className="row g-3">
        <div className="col-lg-5">
          <section className="card card-body h-100">
            <h2 className="h6">Desvio por UGRHI — {intervalo}</h2>
            <MapaDesvio comparacao={comparacao} selecionada={s.ugrhi} href={(u) => `${BASE}?${parametros(sel, { ugrhi: u, mun: null, posto: null })}`} />
          </section>
        </div>
        <div className="col-lg-7">
          <section className="card card-body h-100">
            <h2 className="h6">
              Média histórica mensal e chuva de {ano} — {foco.titulo}
            </h2>
            <GraficoMensal clima={Array.from({ length: 12 }, (_, i) => foco.est[i + 1]?.media ?? null)} ano={ano} observado={foco.observado} rotuloClima={rotuloClima} arquivo={foco.arquivo} />
            <TabelaMeses est={foco.est} observado={foco.observado} ano={ano} />
          </section>
        </div>
      </div>

      <section className="card card-body mt-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h2 className="h6 mb-0">
            Chuva de {nomeMes} de {ano} por UGRHI{ateDia ? ` (1º a ${ateData})` : ''}
          </h2>
          <BotoesExportar consulta={consulta} tabela="resumo_ugrhis" />
        </div>
        <TabelaResumo linhas={resumo} selecionada={s.ugrhi} href={(u) => `${BASE}?${parametros(sel, { ugrhi: u, mun: null, posto: null })}`} />
        <p className="small text-secondary mb-0 mt-1">
          Chuva máxima: maior acumulado do mês entre os postos da UGRHI com o mês válido ({fonte === 'acervo' ? 'acervo' : 'telemetria'}). Média mensal: soma dos acumulados desses postos ÷ número de postos. Média histórica mensal: média de {nomeMes} de cada posto da UGRHI no acervo, com todos os anos que ele tem (mínimo de 10), somadas e divididas pelo número de postos — não depende do período de referência. Passe o mouse para ver o posto da máxima e os anos da média histórica.
        </p>
      </section>

      <section className="card card-body mt-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h2 className="h6 mb-0">Todas as UGRHIs — {intervalo}</h2>
          <BotoesExportar consulta={consulta} tabela="comparacao" />
        </div>
        <TabelaComparacao linhas={linhas} selecionada={s.ugrhi} rotuloObservado={rotuloObservado} rotuloMedia={rotuloMedia} />
        <p className="small text-secondary mb-0 mt-1">
          {s.metodo === 'aritmetica' ? 'Soma da chuva dos postos da UGRHI com o período válido ÷ número desses postos' : 'Média ponderada por área (Thiessen)'}. Média histórica: a mesma conta com o acervo, no período {rotuloPeriodo}.
        </p>
      </section>

      <section className="card card-body mt-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h2 className="h6 mb-0">Todos os municípios — {intervalo}</h2>
          <div className="d-flex flex-wrap gap-2">
            <BotoesExportar consulta={consulta} tabela="municipios" />
            <a className="btn btn-sm btn-outline-secondary" href={`${BASE}/exportar?${consulta}&tabela=medias_municipios&formato=xlsx`}>
              <i className="bi bi-table" /> Médias mensais dos municípios (Excel)
            </a>
          </div>
        </div>
        <TabelaLocal
          linhas={linhasMun}
          selecionada={munSel?.codIbge ?? null}
          rotuloNome="Município"
          rotuloPostos="Postos"
          rotuloObservado={rotuloObservado}
          rotuloMedia={rotuloMedia}
          grupos={{ rotulo: 'UGRHI', opcoes: Object.entries(UGRHIS).map(([u, nome]) => [Number(u), `${u} — ${nome}`]) }}
          ordemInicial="nome"
        />
        <p className="small text-secondary mb-0 mt-1">
          Chuva do município: soma dos postos do município com o período válido ÷ número de postos ({fonte === 'acervo' ? 'acervo' : 'telemetria'}). Média histórica: a mesma conta com o acervo, no período {rotuloPeriodo}. Clique no município para ver a série dele.
        </p>
      </section>

      <div className="row g-3 mt-0">
        <div className="col-lg-5">
          <section className="card card-body h-100">
            <h2 className="h6">
              Mapa das estações — {escopo}
            </h2>
            <MapaPostos
              ugrhi={munSel?.ugrhi ?? s.ugrhi}
              pontos={locais.postos.map((p) => ({ ...p, desvio: cmpPostos.get(p.id)?.desvio ?? null, href: `${BASE}?${parametros(sel, { posto: p.id })}`, rotulo: `${p.prefixo} — ${p.nome ?? ''}` }))}
              selecionado={postoSel?.id ?? null}
              aproximar={Boolean(munSel)}
            />
            <p className="small text-secondary mb-0 mt-1">Cor: desvio em relação à média histórica do posto (ou do município). Cinza: sem período válido ou sem média. Clique num posto para ver a série dele.</p>
          </section>
        </div>
        <div className="col-lg-7">
          <section className="card card-body h-100">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <h2 className="h6 mb-0">
                Estações — {escopo}, {intervalo} ({linhasPostos.length})
              </h2>
              <BotoesExportar consulta={consulta} tabela="postos" />
            </div>
            {linhasPostos.length ? (
              <TabelaLocal linhas={linhasPostos} selecionada={postoSel?.id ?? null} rotuloNome="Estação" rotuloPostos={null} rotuloObservado={rotuloObservado} rotuloMedia={rotuloMedia} />
            ) : (
              <p className="small text-secondary mb-0">Nenhum posto com dado de {ano} nesta fonte.</p>
            )}
            <p className="small text-secondary mb-0 mt-1">
              {meses.length > 1 ? 'Observado só quando todos os meses do intervalo são válidos. ' : ''}A média histórica é a do próprio posto (série no acervo); para posto telemétrico, a do município.
            </p>
          </section>
        </div>
      </div>

      <section className="card card-body mt-3">
        <h2 className="h6">Precipitação anual — UGRHI {s.ugrhi} (acervo; anos com os 12 meses válidos)</h2>
        <GraficoAnual anos={anuais} media={est[0]?.media ?? null} rotuloMedia={est[0]?.tipo === 'normal' ? `Normal ${rotuloPeriodo}` : 'Média'} periodo={s.periodo} arquivo={`chuva-anual-ugrhi${s.ugrhi}`} />
        <p className="small text-secondary mb-0">Barras em vermelho e azul: ano mais seco e mais chuvoso do período {rotuloPeriodo}; barras claras: fora do período de referência.</p>
      </section>

      <div className="row g-3 mt-0">
        <div className="col-lg-6">
          <section className="card card-body h-100">
            <h2 className="h6">Períodos mais secos e mais chuvosos ({rotuloPeriodo}, acervo)</h2>
            <Extremos titulo="Anos" e={extAno} />
            <Extremos titulo={`Meses de ${MESES_LONGOS[mes - 1]}`} e={extMes} />
          </section>
        </div>
        <div className="col-lg-6">
          <section className="card card-body h-100">
            <h2 className="h6">Rede de postos do acervo ao longo do tempo — UGRHI {s.ugrhi}</h2>
            <GraficoRede anos={redeUgrhi} arquivo={`rede-ugrhi${s.ugrhi}`} />
            <p className="small text-secondary mb-0">Postos com pelo menos um mês válido em cada ano. Mudanças grandes na rede afetam a comparação entre décadas.</p>
          </section>
        </div>
      </div>

      <section className="card card-body mt-3">
        <h2 className="h6">Matriz mensal de {ano}: desvio (%) em relação à média histórica (meses encerrados)</h2>
        <GraficoMatriz linhas={matriz} ano={ano} arquivo={`matriz-desvios-${ano}`} />
      </section>

      {s.acumulado === 'mes' && (
        <details className="card card-body mt-3">
          <summary className="h6 mb-0">
            Postos usados na média da UGRHI {s.ugrhi} — {MESES_LONGOS[mes - 1]} de {ano} ({postosUsados.length})
          </summary>
          {postosUsados.length ? (
            <div className="table-responsive clima-postos mt-2">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Prefixo</th>
                    <th>Posto</th>
                    <th>Rede</th>
                    <th>Município</th>
                    <th className="text-end">UGRHI</th>
                    <th className="text-end">Chuva (mm)</th>
                    {s.metodo === 'thiessen' && <th className="text-end">Peso (Thiessen)</th>}
                  </tr>
                </thead>
                <tbody>
                  {postosUsados.map((p) => (
                    <tr key={p.id}>
                      <td>{p.prefixo}</td>
                      <td>{p.nome ?? '—'}</td>
                      <td>{p.dono ?? '—'}</td>
                      <td>{p.municipio ?? '—'}</td>
                      <td className="text-end">{p.ugrhi ?? 'fora de SP'}</td>
                      <td className="text-end">{p.chuva === null ? '—' : p.chuva.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}</td>
                      {s.metodo === 'thiessen' && <td className="text-end">{p.peso === null ? '—' : `${(p.peso * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small text-secondary mb-0 mt-2">Nenhum posto com o mês válido.</p>
          )}
        </details>
      )}

      <section className="card card-body mt-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h2 className="h6 mb-0">Relatório e dados</h2>
          <div className="btn-group btn-group-sm flex-wrap">
            <a className="btn btn-primary" href={`${BASE}/relatorio?${consulta}`} target="_blank" rel="noopener">
              <i className="bi bi-file-earmark-pdf" /> Relatório em PDF
            </a>
            <a className="btn btn-outline-secondary" href={`${BASE}/exportar?${consulta}&tabela=serie&formato=csv`}>
              Série mensal da UGRHI (CSV)
            </a>
            <a className="btn btn-outline-secondary" href={`${BASE}/exportar?${consulta}&tabela=climatologia&formato=xlsx`}>
              Climatologia das 22 UGRHIs (Excel)
            </a>
          </div>
        </div>
        <p className="small text-secondary mt-2 mb-0">Os gráficos têm o botão &quot;Baixar PNG&quot; no canto superior direito.</p>
      </section>

      <details className="card card-body mt-3 clima-metodologia">
        <summary className="h6 mb-0">Metodologia, critérios de qualidade e limitações</summary>
        {METODOLOGIA.map((sec) => (
          <div key={sec.titulo} className="mt-3">
            <h3 className="h6">{sec.titulo}</h3>
            <ul className="small mb-0">
              {sec.itens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </details>

      <p className="small text-secondary mt-3">
        Média histórica: {FONTE_CLIMATOLOGIA}. Acervo no banco: {at.postos} postos, {at.meses.toLocaleString('pt-BR')} meses
        {at.anos ? ` (${at.anos[0]}–${at.anos[1]})` : ''}. Última importação: {dataHora(at.importacao)}; último cálculo: {dataHora(at.calculo)}. Período de referência padrão: {PERIODO_PADRAO.join('–')}.
        <br />
        Chuva observada recente: {FONTE_TELEMETRIA}.{' '}
        {at.telemetria.periodo
          ? `No banco: ${at.telemetria.dias.toLocaleString('pt-BR')} dias (${data(at.telemetria.periodo[0])} a ${data(at.telemetria.periodo[1])}), ${at.telemetria.postos.toLocaleString('pt-BR')} postos; última coleta: ${dataHora(at.telemetria.coleta)}.`
          : 'Ainda não carregada.'}
      </p>
    </>
  );
}

const dec = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

/** Tabela no formato do boletim: todas as UGRHIs com chuva máxima, média mensal e média histórica mensal. */
function TabelaResumo({ linhas, selecionada, href }: { linhas: ResumoUgrhi[]; selecionada: number; href: (u: number) => string }) {
  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle clima-tabela clima-resumo mb-0">
        <thead>
          <tr>
            <th scope="col">UGRHIs</th>
            <th scope="col" className="text-end">Chuva máxima (mm)</th>
            <th scope="col" className="text-end">Média mensal (mm)</th>
            <th scope="col" className="text-end">Média histórica mensal (mm)</th>
            <th scope="col" className="text-end">Postos (mês · histórico)</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((r) => (
            <tr key={r.ugrhi} className={r.ugrhi === selecionada ? 'clima-linha-sel' : ''}>
              <td>
                <Link href={href(r.ugrhi)} scroll={false}>
                  {r.ugrhi} - {UGRHIS[r.ugrhi]}
                </Link>
              </td>
              <td className="text-end" title={r.postoMaxima ? `${r.postoMaxima.prefixo} — ${r.postoMaxima.nome ?? ''}${r.postoMaxima.municipio ? ` (${r.postoMaxima.municipio})` : ''}` : undefined}>
                {dec(r.maxima)}
              </td>
              <td className="text-end">{dec(r.media)}</td>
              <td className="text-end fw-semibold" title={r.anosHistorica ? `${r.postosHistorica} postos do acervo, anos de ${r.anosHistorica[0]} a ${r.anosHistorica[1]}` : 'nenhum posto com 10 anos válidos neste mês'}>
                {dec(r.historica)}
              </td>
              <td className="text-end text-secondary small">
                {r.postos} · {r.postosHistorica}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BotoesExportar({ consulta, tabela }: { consulta: string; tabela: string }) {
  return (
    <div className="btn-group btn-group-sm">
      <a className="btn btn-outline-secondary" href={`${BASE}/exportar?${consulta}&tabela=${tabela}&formato=csv`}>
        <i className="bi bi-filetype-csv" /> CSV
      </a>
      <a className="btn btn-outline-secondary" href={`${BASE}/exportar?${consulta}&tabela=${tabela}&formato=xlsx`}>
        <i className="bi bi-file-earmark-excel" /> Excel
      </a>
    </div>
  );
}

function Cartao({ rotulo, valor, nota, cor }: { rotulo: string; valor: string; nota: string; cor?: string }) {
  return (
    <div className="clima-card" style={cor ? { borderTopColor: cor } : undefined}>
      <div className="clima-card__rotulo">{rotulo}</div>
      <div className="clima-card__valor">{valor}</div>
      <div className="clima-card__nota">{nota}</div>
    </div>
  );
}

function Legenda() {
  return (
    <div className="clima-legenda small">
      {[-60, -30, -10, 0, 10, 30, 60].map((d) => (
        <span key={d}>
          <i style={{ background: corDesvio(d) }} />
          {d > 0 ? '+' : ''}
          {d}%
        </span>
      ))}
      <span>
        <i style={{ background: corDesvio(null) }} />
        sem dado
      </span>
    </div>
  );
}

function MapaDesvio({ comparacao, selecionada, href }: { comparacao: ReturnType<typeof comparar>; selecionada: number; href: (u: number) => string }) {
  const m = mapaUgrhis();
  const por = new Map(comparacao.map((c) => [c.ugrhi, c]));
  return (
    <>
      <svg viewBox={`0 0 ${m.largura} ${m.altura}`} className="clima-mapa" role="group" aria-label="Mapa das UGRHIs: clique para selecionar">
        {m.formas.map((f) => {
          const c = por.get(f.codigo);
          return (
            <Link key={f.codigo} href={href(f.codigo)} scroll={false} aria-label={`UGRHI ${f.codigo} — ${UGRHIS[f.codigo]}: ${pct(c?.desvio ?? null, true)}`}>
              <path d={f.d} fill={corDesvio(c?.desvio ?? null)} className={f.codigo === selecionada ? 'sel' : ''}>
                <title>{`UGRHI ${f.codigo} — ${UGRHIS[f.codigo]}\nObservado: ${mm(c?.observado ?? null)}\nMédia histórica: ${mm(c?.climatologia ?? null)}\nDesvio: ${pct(c?.desvio ?? null, true)}`}</title>
              </path>
              <text x={f.rotulo[0]} y={f.rotulo[1]} className="clima-mapa__rotulo">
                {f.codigo}
              </text>
            </Link>
          );
        })}
      </svg>
      <Legenda />
    </>
  );
}

/** Mapa aproximado da UGRHI com os postos: cor = desvio; clique = série do posto. Desenhado no servidor (SVG), sem biblioteca de mapa. */
function MapaPostos({ ugrhi, pontos, selecionado, aproximar }: { ugrhi: number; pontos: { id: number; lat: number; lon: number; desvio: number | null; href: string; rotulo: string }[]; selecionado: number | null; aproximar: boolean }) {
  const m = mapaUgrhis();
  const forma = m.formas.find((f) => f.codigo === ugrhi);
  const xy = pontos.map((p) => ({ ...p, xy: m.projetar(p.lon, p.lat) }));
  // caixa: a UGRHI inteira, ou só os postos do município (com folga)
  let [x, y, w, h] = forma?.caixa ?? [0, 0, m.largura, m.altura];
  if (aproximar && xy.length) {
    const xs = xy.map((p) => p.xy[0]);
    const ys = xy.map((p) => p.xy[1]);
    [x, y, w, h] = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    const lado = Math.max(w, h, 12);
    [x, y, w, h] = [x - (lado - w) / 2, y - (lado - h) / 2, lado, lado];
  }
  const folga = Math.max(w, h) * 0.06;
  const caixa = [x - folga, y - folga, w + 2 * folga, h + 2 * folga];
  const r = Math.max(caixa[2]!, caixa[3]!) * 0.012;
  const ordem = [...xy].sort((a, b) => Number(a.desvio !== null) - Number(b.desvio !== null) || Number(a.id === selecionado) - Number(b.id === selecionado));
  return (
    <>
      <svg viewBox={caixa.map((v) => v.toFixed(1)).join(' ')} className="clima-mapa clima-mapa-postos" role="group" aria-label={`Postos da UGRHI ${ugrhi}: clique para ver a série`}>
        {m.formas.map((f) => (
          <path key={f.codigo} d={f.d} className={f.codigo === ugrhi ? 'clima-mapa__ugrhi' : 'clima-mapa__vizinha'} />
        ))}
        {ordem.map((p) => (
          <Link key={p.id} href={p.href} scroll={false} aria-label={`${p.rotulo}: ${pct(p.desvio, true)}`}>
            <circle cx={p.xy[0]} cy={p.xy[1]} r={p.id === selecionado ? r * 1.7 : p.desvio === null ? r * 0.7 : r} fill={corDesvio(p.desvio)} className={p.id === selecionado ? 'sel' : ''}>
              <title>{`${p.rotulo}\nDesvio: ${pct(p.desvio, true)}`}</title>
            </circle>
          </Link>
        ))}
      </svg>
      <Legenda />
    </>
  );
}

function TabelaMeses({ est, observado, ano }: { est: Estatistica[]; observado: (number | null)[]; ano: number }) {
  return (
    <div className="table-responsive mt-2">
      <table className="table table-sm clima-meses mb-0">
        <thead>
          <tr>
            <th />
            {MESES.map((m) => (
              <th key={m} className="text-end">
                {m}
              </th>
            ))}
            <th className="text-end">Ano</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Média</th>
            {Array.from({ length: 12 }, (_, i) => est[i + 1]).map((e, i) => (
              <td key={i} className={`text-end ${e?.tipo === 'normal' ? '' : 'text-warning-emphasis'}`} title={e ? `${e.anosValidos} anos válidos` : undefined}>
                {e?.media?.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) ?? '—'}
              </td>
            ))}
            <td className="text-end fw-semibold">{est[0]?.media?.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) ?? '—'}</td>
          </tr>
          <tr>
            <th scope="row">{ano}</th>
            {observado.map((v, i) => (
              <td key={i} className="text-end">
                {v?.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) ?? '—'}
              </td>
            ))}
            <td className="text-end fw-semibold">{observado.every((v) => v !== null) ? Math.round(observado.reduce((t, v) => t + v!, 0)).toLocaleString('pt-BR') : '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Extremos({ titulo, e }: { titulo: string; e: { secos: { ano: number; chuva: number }[]; chuvosos: { ano: number; chuva: number }[] } }) {
  const lista = (l: { ano: number; chuva: number }[]) => (l.length ? l.map((x) => `${x.ano} (${mm(x.chuva, 0)})`).join(', ') : '—');
  return (
    <div className="small mb-2">
      <strong>{titulo}:</strong>
      <div>
        <span className="clima-seco">mais secos</span> — {lista(e.secos)}
      </div>
      <div>
        <span className="clima-chuvoso">mais chuvosos</span> — {lista(e.chuvosos)}
      </div>
    </div>
  );
}
