import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import '@/styles/acesso/climatologia.css';
import { Cabecalho } from '@/components/acesso/pecas';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { FONTE_CLIMATOLOGIA, FONTE_TELEMETRIA } from '@/conteudo/climatologia-metodologia';
import { acl } from '@/lib/auth/acl';
import { chuvaDoMes, INICIO_HISTORICO, mesesDisponiveis, type LinhaMes } from '@/lib/climatologia/chuva-mes';
import { municipios } from '@/lib/climatologia/painel';
import { anoAtual, MESES_LONGOS, rotuloAnos } from '@/lib/climatologia/selecao';
import { UGRHIS } from '@/lib/hidrologia/situacao-rios';
import { Abas } from '../abas';
import { TabelaMes, type LinhaTabelaMes } from '../tabela-mes';

export const metadata: Metadata = { title: 'Chuva do mês — UGRHIs e municípios' };

const BASE = '/acesso/climatologia/mes';
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const inteiro = (v: string | undefined, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export default async function ChuvaDoMes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await acl();
  if (!a.podeEmAlguma('visualizar_climatologia')) redirect('/acesso/sem-acesso');
  const sp = await searchParams;
  const pedido = { ano: inteiro(um(sp.ano), INICIO_HISTORICO, 2100), mes: inteiro(um(sp.mes), 1, 12) };

  return (
    <>
      <Cabecalho
        titulo="Chuva do mês — UGRHIs e municípios"
        subtitulo={`Acumulado do mês, chuva máxima e média histórica do mesmo mês (${INICIO_HISTORICO} até hoje) em todas as UGRHIs e municípios com pluviômetro.`}
        trilha={[
          ['Painel', '/acesso'],
          ['Climatologia de precipitação', '/acesso/climatologia'],
          ['Chuva do mês', null],
        ]}
      />
      <Abas atual="mes" />
      <Suspense key={`${pedido.ano}-${pedido.mes}`} fallback={<div className="clima-carregando" role="status"><span className="spinner-border spinner-border-sm" /> Carregando…</div>}>
        <Conteudo pedido={pedido} />
      </Suspense>
    </>
  );
}

const ateData = (dia: number, mes: number) => `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;

function paraTabela(l: LinhaMes | undefined, chave: number, nome: string, grupo?: number | null): LinhaTabelaMes {
  const p = l?.postoMaxima;
  return {
    chave,
    nome,
    grupo,
    acumulado: l?.acumulado ?? null,
    maxima: l?.maxima ?? null,
    postoMaxima: p ? `${p.prefixo} — ${p.nome ?? ''}${p.municipio ? ` (${p.municipio})` : ''}` : null,
    historica: l?.historica ?? null,
    percentual: l?.percentual ?? null,
    postos: l?.postos ?? 0,
    anos: l?.anos.length ?? 0,
    rotuloAnos: rotuloAnos(l?.anos ?? []),
  };
}

async function Conteudo({ pedido }: { pedido: { ano: number | null; mes: number | null } }) {
  const disp = await mesesDisponiveis();
  const ano = pedido.ano ?? disp.recente?.ano ?? anoAtual();
  const mes = pedido.mes ?? (pedido.ano ? 12 : (disp.recente?.mes ?? 1));
  const [ugrhis, munsDados, muns] = await Promise.all([chuvaDoMes('ugrhi', ano, mes), chuvaDoMes('municipio', ano, mes), municipios()]);

  const nomeMes = MESES_LONGOS[mes - 1]!;
  const ateDia = Math.max(0, ...[...ugrhis.values()].map((l) => l.ateDia ?? 0)) || null;
  const rotuloAcumulado = ateDia ? `Acumulado até ${ateData(ateDia, mes)} (mm)` : 'Acumulado do mês (mm)';
  const rotuloHistorica = `Média histórica de ${nomeMes} (mm)`;
  const consulta = `ano=${ano}&mes=${mes}`;
  const anos = [...new Set([...disp.anos, ano])].sort((x, y) => y - x);

  const linhasUgrhi = Object.entries(UGRHIS).map(([u, nome]) => paraTabela(ugrhis.get(Number(u)), Number(u), `${u} - ${nome}`));
  const linhasMun = muns.map((m) => paraTabela(munsDados.get(m.codIbge), m.codIbge, m.nome, m.ugrhi));
  const comAcumulado = linhasMun.filter((l) => l.acumulado !== null).length;
  const comMedia = linhasMun.filter((l) => l.historica !== null).length;

  return (
    <>
      <form className="clima-filtros card card-body mb-3" method="get" action={BASE}>
        <div className="row g-2 align-items-end">
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1" htmlFor="ano">
              Ano
            </label>
            <SelectAutoEnvio id="ano" name="ano" defaultValue={String(ano)} className="form-select form-select-sm">
              {anos.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </SelectAutoEnvio>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1" htmlFor="mes">
              Mês
            </label>
            <SelectAutoEnvio id="mes" name="mes" defaultValue={String(mes)} className="form-select form-select-sm">
              {MESES_LONGOS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </SelectAutoEnvio>
          </div>
          <div className="col-md-7">
            <noscript>
              <button type="submit" className="btn btn-sm btn-primary">
                Aplicar
              </button>
            </noscript>
            <small className="text-secondary">
              Média histórica: {nomeMes} de cada ano de {INICIO_HISTORICO} até hoje que tem dado (acervo até 2023, telemetria depois). Passe o mouse na média para ver os anos usados e na máxima para ver o posto.
            </small>
          </div>
        </div>
      </form>

      {ateDia && (
        <div className="alert alert-info py-2 small">
          <i className="bi bi-calendar-event me-1" />
          Mês em andamento: acumulado de 1º a {ateData(ateDia, mes)} (dias já encerrados), comparado com a média de {nomeMes} inteiro. Até o fim do mês é natural ficar abaixo da média.
        </div>
      )}

      <section className="card card-body mb-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h2 className="h6 mb-0">
            UGRHIs — {nomeMes} de {ano}
            {ateDia ? ` (1º a ${ateData(ateDia, mes)})` : ''}
          </h2>
          <Exportar consulta={`${consulta}&escala=ugrhi`} />
        </div>
        <TabelaMes linhas={linhasUgrhi} rotuloNome="UGRHI" rotuloAcumulado={rotuloAcumulado} rotuloHistorica={rotuloHistorica} />
      </section>

      <section className="card card-body mb-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h2 className="h6 mb-0">
            Municípios — {nomeMes} de {ano}
            {ateDia ? ` (1º a ${ateData(ateDia, mes)})` : ''}
          </h2>
          <Exportar consulta={`${consulta}&escala=municipio`} />
        </div>
        <TabelaMes
          linhas={linhasMun}
          rotuloNome="Município"
          rotuloAcumulado={rotuloAcumulado}
          rotuloHistorica={rotuloHistorica}
          grupos={{ rotulo: 'UGRHI', opcoes: Object.entries(UGRHIS).map(([u, nome]) => [Number(u), `${u} - ${nome}`]) }}
          ordemInicial="nome"
          alturaMaxima
        />
        <p className="small text-secondary mb-0 mt-1">
          {linhasMun.length} municípios com pluviômetro; {comAcumulado} com acumulado neste mês e {comMedia} com média histórica. Onde não há posto com o mês completo, aparece “—”.
        </p>
      </section>

      <section className="card card-body small text-secondary">
        <h2 className="h6 text-body">Como cada valor é calculado</h2>
        <ul className="mb-2">
          <li>
            <b>Acumulado do mês</b>: soma da chuva do mês de cada posto da UGRHI (ou do município) ÷ número de postos. Só entram postos com o mês completo — sem falta de registro e sem valor impossível (falha do posto).
          </li>
          <li>
            <b>Chuva máxima</b>: o maior acumulado do mês entre esses postos.
          </li>
          <li>
            <b>Média histórica</b>: a mesma conta do acumulado, feita para {nomeMes} de cada ano de {INICIO_HISTORICO} até hoje com dado; a média é a desses anos. Usa os dados que houver, sem mínimo de anos — a coluna “Anos na média” mostra quantos entraram. Não entram o próprio mês avaliado nem o mês em andamento.
          </li>
          <li>
            <b>% da média</b>: acumulado ÷ média histórica × 100. Abaixo de 100%, choveu menos que o normal do mês.
          </li>
        </ul>
        <p className="mb-0">
          Dados: {FONTE_CLIMATOLOGIA} (até 2023) e {FONTE_TELEMETRIA} (a partir de nov./2025). São duas redes diferentes. 2024 (o acervo tem só alguns postos no 1º semestre) e 2025 até outubro ficam praticamente sem dado.
        </p>
      </section>
    </>
  );
}

function Exportar({ consulta }: { consulta: string }) {
  return (
    <div className="btn-group btn-group-sm">
      <a className="btn btn-outline-secondary" href={`${BASE}/exportar?${consulta}&formato=csv`}>
        <i className="bi bi-filetype-csv" /> CSV
      </a>
      <a className="btn btn-outline-secondary" href={`${BASE}/exportar?${consulta}&formato=xlsx`}>
        <i className="bi bi-file-earmark-excel" /> Excel
      </a>
    </div>
  );
}
