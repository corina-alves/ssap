import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Cabecalho, Mensagem } from '@/components/acesso/pecas';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { exigirSala } from '@/lib/auth/acl';
import { dataBr } from '@/lib/formato';
import { PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { anoTransposicao, avaliar, diaTransposicao, mesTransposicao, periodoMes, REFERENCIA, saispConfigurado, type Avaliacao } from '@/lib/hidrologia/transposicao';
import { hojeSp } from '@/lib/integracoes/comum';
import { GraficoDiaTransposicao, GraficoMesTransposicao } from '../graficos';
import '@/styles/acesso/acompanhamento.css';

export const metadata: Metadata = { title: 'Transposição Paraíba do Sul → Cantareira' };

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const num = (v: number | null | undefined, casas = 2) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const AVALIACAO: Record<Avaliacao, [string, string]> = {
  compativel: ['Compatível', 'ok'],
  moderada: ['Dif. moderada', 'atencao'],
  verificar: ['Verificar', 'alerta'],
  sem: ['Sem comparação', 'neutro'],
};

function Indicador({ icone, rotulo, valor, unidade, tipo }: { icone: string; rotulo: string; valor: string; unidade: string; tipo?: 'volume' | 'referencia' }) {
  return (
    <div className={`trp-indicador${tipo ? ` trp-indicador--${tipo}` : ''}`}>
      <span>
        <i className={`bi ${icone}`} /> {rotulo}
      </span>
      <strong>{valor}</strong>
      <small>{unidade}</small>
    </div>
  );
}

/** Medidor do volume transferido no ano × limite vigente, com o traço e o valor do limite anterior. */
function MedidorVolume({ valor, vigente, anterior }: { valor: number; vigente: number; anterior: number | null }) {
  const cx = 150;
  const cy = 140;
  const r = 110;
  const ponto = (f: number, raio = r) => {
    const a = Math.PI * (1 - Math.min(1, Math.max(0, f)));
    return [cx + raio * Math.cos(a), cy - raio * Math.sin(a)] as const;
  };
  const arco = (f: number) => {
    const [x, y] = ponto(f);
    return `M${cx - r},${cy} A${r},${r} 0 0 1 ${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const marca = anterior !== null ? ([ponto(anterior / vigente, r - 20), ponto(anterior / vigente, r + 20), ponto(anterior / vigente, r + 34)] as const) : null;
  return (
    <svg viewBox="0 -24 300 199" className="trp-medidor" role="img" aria-label={`Volume transferido no ano: ${num(valor, 1)} hm³ de ${num(vigente)} hm³`}>
      <path d={arco(1)} className="trp-medidor__fundo" />
      {valor > 0 && <path d={arco(valor / vigente)} className="trp-medidor__valor" />}
      {marca && (
        <>
          <line x1={marca[0][0]} y1={marca[0][1]} x2={marca[1][0]} y2={marca[1][1]} className="trp-medidor__marca" />
          <text x={marca[2][0]} y={marca[2][1] + 4} textAnchor="middle" className="trp-medidor__marca-texto">
            {num(anterior, 0)}
          </text>
        </>
      )}
      <text x={cx} y={cy - 12} textAnchor="middle" className="trp-medidor__numero">
        {num(valor, 1)}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="trp-medidor__legenda">
        hm³ no ano
      </text>
      <text x={cx - r} y={cy + 24} textAnchor="middle" className="trp-medidor__legenda">
        0
      </text>
      <text x={cx + r} y={cy + 24} textAnchor="middle" className="trp-medidor__legenda">
        {num(vigente, 0)}
      </text>
    </svg>
  );
}

/** Enquanto uma parte carrega (o SAISP leva alguns segundos por dia ainda não guardado). */
function Carregando({ texto }: { texto: string }) {
  return (
    <div className="acesso-card mb-3 trp-carregando" role="status">
      <span className="spinner-border spinner-border-sm" aria-hidden /> {texto}
    </div>
  );
}

async function SecaoAno() {
  const r = await anoTransposicao();
  const an = r.ok ? r.dados : null;
  return (
    <div className="trp-ano">
      <div className="acesso-card">
        <h3 className="trp-titulo">Operação em {an?.ano ?? hojeSp().slice(0, 4)}</h3>
        {an && an.meses.length ? (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0 trp-tabela">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="text-end">Vazão média (m³/s)</th>
                  <th className="text-end">Volume (hm³)</th>
                </tr>
              </thead>
              <tbody>
                {an.meses.map((m) => (
                  <tr key={m.mes}>
                    <td className="text-capitalize">{m.nome}</td>
                    <td className="text-end">{num(m.mediaM3s)}</td>
                    <td className="text-end">{num(m.volumeHm3)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Ano</th>
                  <th className="text-end">{num(an.mediaAnoM3s)}</th>
                  <th className="text-end">{num(an.acumuladoHm3)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-secondary mb-0">{r.ok ? 'Sem dados para o ano.' : r.mensagem}</p>
        )}
      </div>
      <div className="acesso-card text-center">
        <h3 className="trp-titulo">Volume transferido (hm³)</h3>
        {an?.limite ? (
          <>
            <MedidorVolume valor={an.acumuladoHm3} vigente={an.limite.vigente} anterior={an.limite.anterior} />
            <p className="small mb-1">
              {an.limite.anterior !== null && (
                <>
                  Limite anterior: <strong>{num(an.limite.anterior, 0)} hm³</strong> ·{' '}
                </>
              )}
              Limite vigente {an.ano}: <strong>{num(an.limite.vigente)} hm³</strong> · Restam <strong>{num(an.limite.restanteHm3)} hm³</strong>
            </p>
            <p className="acp-nota mt-0">
              {an.limite.doc}
              {an.atualizadoEm && ` · Atualizado em ${dataBr(an.atualizadoEm)}`}
            </p>
          </>
        ) : (
          <p className="text-secondary mb-0">Sem limite anual cadastrado para o ano.</p>
        )}
      </div>
    </div>
  );
}

async function SecaoMes({ ano, mes }: { ano: number; mes: number }) {
  const d = await mesTransposicao(ano, mes);
  const nomeMes = MESES[mes - 1]!;
  return (
    <>
      {d.saispErro && saispConfigurado() && <Mensagem tipo="aviso">SAISP: {d.saispErro} As leituras podem estar incompletas.</Mensagem>}
      {d.sabespErro && <Mensagem tipo="aviso">Sabesp (SSD): {d.sabespErro}</Mensagem>}
      {d.ultimoSaisp && (
        <p className="small text-secondary text-md-end mb-2">
          Último SAISP: <strong>{`${dataBr(d.ultimoSaisp.dia)} às ${d.ultimoSaisp.hora}`}</strong>
        </p>
      )}
      <div className="trp-indicadores">
        <Indicador icone="bi-speedometer2" rotulo="Média mensal SAISP" valor={num(d.mediaSaisp)} unidade="m³/s" />
        <Indicador icone="bi-speedometer" rotulo="Média mensal Sabesp" valor={num(d.mediaSabesp)} unidade="m³/s" />
        <Indicador icone="bi-graph-up" rotulo="Máxima média SAISP" valor={num(d.maxSaisp)} unidade="m³/s" />
        <Indicador icone="bi-calendar-check" rotulo={`Dias SAISP ≥ ${num(REFERENCIA, 1)}`} valor={String(d.diasAcima)} unidade="dias" />
        <Indicador icone="bi-droplet-fill" rotulo="Volume no mês" valor={num(d.volumeHm3)} unidade="hm³" tipo="volume" />
        <Indicador icone="bi-shield-check" rotulo="Referência operacional" valor={num(REFERENCIA, 1)} unidade="m³/s" tipo="referencia" />
      </div>

      <div className="acesso-card mb-3">
        <h3 className="trp-titulo">
          Vazão média diária — {nomeMes} de {ano}
        </h3>
        <GraficoMesTransposicao dias={d.dias} referencia={REFERENCIA} />
      </div>

      <div className="acesso-card mb-3">
        <h3 className="trp-titulo">Comparação SAISP × Sabesp</h3>
        <p className="acp-nota mt-0 mb-2">Diferença = SAISP − Sabesp. Compatível abaixo de 0,05 m³/s; diferença moderada de 0,05 a 0,20; verificar a partir de 0,20.</p>
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0 trp-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th className="text-end">SAISP</th>
                <th className="text-end">Sabesp</th>
                <th className="text-end">Diferença</th>
                <th className="text-end">Mín. SAISP</th>
                <th className="text-end">Máx. SAISP</th>
                <th className="text-end">Leituras</th>
                <th className="text-end">Disponibilidade</th>
                <th>Avaliação</th>
              </tr>
            </thead>
            <tbody>
              {[...d.dias].reverse().map((x) => {
                const [rot, cls] = AVALIACAO[avaliar(x.diferenca)];
                return (
                  <tr key={x.dia}>
                    <td>{dataBr(x.dia)}</td>
                    <td className="text-end fw-semibold">{num(x.saisp)}</td>
                    <td className="text-end">{num(x.sabesp)}</td>
                    <td className="text-end">{x.diferenca === null ? '—' : `${x.diferenca > 0 ? '+' : ''}${num(x.diferenca)}`}</td>
                    <td className="text-end">{num(x.minima)}</td>
                    <td className="text-end">{num(x.maxima)}</td>
                    <td className="text-end">
                      {x.leituras}/{x.esperadas}
                    </td>
                    <td className="text-end">{num(x.disponibilidade, 1)}%</td>
                    <td>
                      <span className={`trp-selo trp-selo--${cls}`}>{rot}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

async function SecaoDia({ ano, mes, dia }: { ano: number; mes: number; dia: number }) {
  const d = await diaTransposicao(ano, mes, dia);
  return (
    <>
      <div className="trp-indicadores">
        <Indicador icone="bi-speedometer2" rotulo="Média SAISP do dia" valor={num(d.mediaSaisp)} unidade="m³/s" />
        <Indicador icone="bi-calendar-day" rotulo="Sabesp do dia" valor={num(d.sabesp)} unidade="m³/s" />
        <Indicador icone="bi-arrow-up-circle" rotulo="Máxima SAISP" valor={num(d.maxSaisp)} unidade="m³/s" />
        <Indicador icone="bi-arrow-down-circle" rotulo="Mínima SAISP" valor={num(d.minSaisp)} unidade="m³/s" />
        <Indicador icone="bi-droplet-fill" rotulo="Volume no dia" valor={num(d.volumeHm3, 3)} unidade="hm³" tipo="volume" />
        <Indicador icone="bi-shield-check" rotulo="Referência operacional" valor={num(REFERENCIA, 1)} unidade="m³/s" tipo="referencia" />
      </div>
      {d.leituras.length ? (
        <>
          <div className="acesso-card mb-3">
            <h3 className="trp-titulo">Vazão observada — {dataBr(d.data)}</h3>
            <GraficoDiaTransposicao leituras={d.leituras} referencia={REFERENCIA} />
            <p className="acp-nota">
              {d.leituras.length} leituras SAISP · última: {d.leituras.at(-1)!.hora} — {num(d.leituras.at(-1)!.valor)} m³/s
            </p>
          </div>
          <div className="acesso-card mb-3">
            <h3 className="trp-titulo">Leituras do dia</h3>
            <div className="table-responsive trp-rolagem">
              <table className="table table-sm align-middle mb-0 trp-tabela">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th className="text-end">Vazão SAISP (m³/s)</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {[...d.leituras].reverse().map((l) => (
                    <tr key={l.hora}>
                      <td>{l.hora}</td>
                      <td className="text-end fw-semibold">{num(l.valor)}</td>
                      <td>
                        <span className={`trp-selo trp-selo--${l.valor >= REFERENCIA ? 'alerta' : 'ok'}`}>
                          {l.valor >= REFERENCIA ? '≥' : '<'} {num(REFERENCIA, 1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="acesso-card mb-3 text-secondary">
          Sem leituras do SAISP para {dataBr(d.data)}.{d.erro && saispConfigurado() ? ` (${d.erro})` : ''}
        </div>
      )}
    </>
  );
}

/**
 * Acompanhamento — transposição Paraíba do Sul → Cantareira (UHE Jaguari →
 * Atibainha). Mesmo acesso do Painel interativo: visualizar_dashboard na Sala
 * Alfredo Pisani. Mês, ano e dia vêm da URL (?mes=&ano=&dia=). O ano aparece
 * na hora; o mês e o dia, cada um quando o SAISP responder.
 */
export default async function Transposicao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSala(SALA_PAINEL, PERMISSAO_PAINEL);
  const sp = await searchParams;
  const hoje = hojeSp();
  const anoAtual = Number(hoje.slice(0, 4));
  const ano = Math.min(anoAtual, Math.max(2018, Number(um(sp.ano)) || anoAtual));
  const mes = Math.min(12, Math.max(1, Number(um(sp.mes)) || Number(hoje.slice(5, 7))));
  const p = periodoMes(ano, mes);
  const diaPadrao = ano === anoAtual && mes === Number(hoje.slice(5, 7)) ? Number(hoje.slice(8, 10)) : 1;
  const dia = Math.min(p.ultimoDiaMes, Math.max(1, Number(um(sp.dia)) || diaPadrao));
  const chave = `${ano}-${mes}-${dia}`;

  return (
    <>
      <Cabecalho
        titulo="Transposição Paraíba do Sul → Cantareira"
        subtitulo="UHE Jaguari (Paraíba do Sul) → Atibainha (Cantareira). Leituras telemétricas do SAISP e vazão média diária da Sabesp (dados do SSD SP Águas)."
        trilha={[
          ['Painel', '/acesso'],
          ['Acompanhamento', null],
          ['Transposição', null],
        ]}
      />

      {!saispConfigurado() && (
        <Mensagem tipo="info">
          As leituras de 10 em 10 min vêm do SAISP, que exige login: configure SAISP_USUARIO e SAISP_SENHA no ambiente. Sem ele, a tela mostra só os dados da Sabesp.
        </Mensagem>
      )}

      <h2 className="trp-secao">
        <i className="bi bi-droplet-half" /> Visão geral do ano
      </h2>
      <Suspense fallback={<Carregando texto="Carregando a operação do ano…" />}>
        <SecaoAno />
      </Suspense>

      <form className="acesso-card my-3 row g-2 align-items-end mx-0" method="get">
        <div className="col-6 col-md-2">
          <label className="form-label small" htmlFor="mes">
            Mês
          </label>
          <SelectAutoEnvio className="form-select" id="mes" name="mes" defaultValue={String(mes)}>
            {MESES.map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
        <div className="col-6 col-md-2">
          <label className="form-label small" htmlFor="ano">
            Ano
          </label>
          <SelectAutoEnvio className="form-select" id="ano" name="ano" defaultValue={String(ano)}>
            {Array.from({ length: anoAtual - 2017 }, (_, i) => anoAtual - i).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
        <div className="col-6 col-md-2">
          <label className="form-label small" htmlFor="dia">
            Dia
          </label>
          <SelectAutoEnvio className="form-select" id="dia" name="dia" defaultValue={String(dia)}>
            {Array.from({ length: p.ultimoDiaMes }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectAutoEnvio>
        </div>
      </form>

      {p.futuro ? (
        <Mensagem tipo="info">
          {MESES[mes - 1]} de {ano} ainda não começou.
        </Mensagem>
      ) : (
        <>
          {/* cada parte aparece quando fica pronta: o dia (uma consulta ao SAISP) costuma chegar antes do mês */}
          <h2 className="trp-secao">
            <i className="bi bi-calendar3" /> Acompanhamento mensal — {MESES[mes - 1]} de {ano}
          </h2>
          <Suspense key={`mes-${ano}-${mes}`} fallback={<Carregando texto="Buscando as leituras do mês no SAISP (na primeira vez pode levar alguns segundos)…" />}>
            <SecaoMes ano={ano} mes={mes} />
          </Suspense>

          <h2 className="trp-secao">
            <i className="bi bi-clock-history" /> Acompanhamento diário — {dataBr(`${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`)}
          </h2>
          <Suspense key={`dia-${chave}`} fallback={<Carregando texto="Buscando as leituras do dia no SAISP…" />}>
            <SecaoDia ano={ano} mes={mes} dia={dia} />
          </Suspense>
        </>
      )}
    </>
  );
}
