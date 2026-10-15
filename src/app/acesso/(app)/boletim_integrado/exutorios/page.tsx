import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecalho, Mensagem } from '@/components/acesso/pecas';
import { acl, exigirSala } from '@/lib/auth/acl';
import { anoMes, cargaMes, MESES, periodoBoletim, PERMISSAO_BOLETIM, SALA_BOLETIM, type CargaMes } from '@/lib/boletins-sala/boletim-integrado';
import { lerCargas, lerReservatorio } from '@/lib/boletins-sala/boletim-integrado-armazenado';
import { hojeSp } from '@/lib/integracoes/comum';
import { gravarExutoriosAcao } from './actions';
import '@/styles/acesso/boletim-integrado.css';

export const metadata: Metadata = { title: 'Dados dos exutórios' };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const num = (v: number | null | undefined, casas = 2) => (v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const RESERVATORIOS = [['pedreira', 'Billings (Compartimento Pedreira)'], ['pirapora', 'Pirapora']] as const;
const CAMPOS_CARGA: [keyof CargaMes, string][] = [['q_pinheiros', 'Vazão Pinheiros (m³/s)'], ['q_tiete', 'Vazão Tietê (m³/s)'], ['dbo_pinheiros', 'DBO Pinheiros (mg/L)'], ['dbo_tiete', 'DBO Tietê (mg/L)']];

/**
 * Cadastro do que o Boletim Exutórios não tem de fonte automática
 * (exutorios_dados.php do PHP): operação diária de Pirapora e Billings/Pedreira
 * e vazão e DBO mensais dos exutórios Pinheiros e Tietê (carga orgânica).
 */
export default async function DadosExutorios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await acl();
  const sala = await exigirSala(SALA_BOLETIM, PERMISSAO_BOLETIM);
  const hoje = hojeSp();
  const anoAtual = Number(hoje.slice(0, 4));
  const { ano, mes } = periodoBoletim(um(sp.ano), um(sp.mes), { ano: anoAtual, mes: Number(hoje.slice(5, 7)) }, 2010);
  const comp = `${MESES[mes - 1]}/${ano}`;
  const hrefBoletim = `/acesso/boletim_integrado/boletim?tipo=exutorios&ano=${ano}&mes=${mes}`;
  const hrefSala = `/acesso/salas/sala?s=${sala.slug}`;
  const [cargas, ...reservatorios] = await Promise.all([lerCargas(), ...RESERVATORIOS.map(([slug]) => lerReservatorio(slug, ano, mes))]);
  const doMes = cargas[anoMes(ano, mes)] ?? {};
  const meses = Object.keys(cargas).sort().reverse();
  const ocultos = (
    <>
      <input type="hidden" name="ano" value={ano} />
      <input type="hidden" name="mes" value={mes} />
    </>
  );

  return (
    <div className="bi-area form-exut">
      {um(sp.ok) && <Mensagem tipo="sucesso">{um(sp.ok).slice(0, 200)}</Mensagem>}
      <Cabecalho
        titulo="Dados dos exutórios"
        subtitulo="O que o Boletim Exutórios não tem de fonte automática: Pirapora, Billings/Pedreira e carga orgânica."
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, hrefSala],
          ['Boletim Exutórios', hrefBoletim],
          ['Dados dos exutórios', null],
        ]}
        acoes={
          <>
            <Link className="btn btn-outline-secondary" href={hrefSala}>
              <i className="bi bi-arrow-left me-1" /> Voltar para a sala
            </Link>
            <a className="btn btn-primary" href={hrefBoletim}>
              <i className="bi bi-clipboard2-data me-1" /> Abrir o Boletim Exutórios ({comp})
            </a>
          </>
        }
      />

      <form method="get" className="acesso-card mb-3 row g-2 align-items-end mx-0">
        <div className="col-6 col-md-3">
          <label className="form-label small" htmlFor="mes">
            Mês de referência
          </label>
          <select className="form-select" id="mes" name="mes" defaultValue={mes}>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="form-label small" htmlFor="ano">
            Ano
          </label>
          <select className="form-select" id="ano" name="ano" defaultValue={ano}>
            {Array.from({ length: anoAtual - 2009 }, (_, i) => anoAtual - i).map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="col-auto">
          <button className="btn btn-outline-primary" type="submit">
            Abrir mês
          </button>
        </div>
      </form>

      {RESERVATORIOS.map(([slug, nome], i) => {
        const dias = reservatorios[i]!;
        const datas = Object.keys(dias).sort();
        return (
          <section key={slug} className="acesso-card mb-3">
            <h2 className="acesso-card__titulo">
              <i className="bi bi-water" /> Reservatório {nome} — {comp} ({datas.length} dia(s) cadastrados)
            </h2>
            <div className="colunas">
              <div>
                <form action={gravarExutoriosAcao}>
                  <input type="hidden" name="acao" value="reservatorio" />
                  <input type="hidden" name="reservatorio" value={slug} />
                  {ocultos}
                  <label className="form-label small" htmlFor={`linhas-${slug}`}>
                    Cole as linhas da planilha: <code>data;precipitação (mm);vazão afluente (m³/s);vazão efluente (m³/s);volume (%)</code>
                  </label>
                  <textarea className="form-control" id={`linhas-${slug}`} name="linhas" placeholder={`01/${String(mes).padStart(2, '0')}/${ano};0,0;118,2;143,5;32,4`} />
                  <p className="form-text">Aceita ponto e vírgula ou tabulação (copiar direto do Excel) e vírgula decimal. Dias fora do mês são ignorados.</p>
                  <div className="form-check mb-2">
                    <input className="form-check-input" type="checkbox" id={`substituir-${slug}`} name="substituir" value="1" />
                    <label className="form-check-label" htmlFor={`substituir-${slug}`}>
                      substituir todo o mês (senão, só atualiza os dias informados)
                    </label>
                  </div>
                  <button className="btn btn-primary" type="submit">
                    Gravar
                  </button>
                </form>
                {datas.length > 0 && (
                  <form action={gravarExutoriosAcao} className="mt-3">
                    <input type="hidden" name="acao" value="limpar_reservatorio" />
                    <input type="hidden" name="reservatorio" value={slug} />
                    {ocultos}
                    <div className="form-check mb-2">
                      <input className="form-check-input" type="checkbox" id={`confirmar-${slug}`} name="confirmar" value="1" required />
                      <label className="form-check-label" htmlFor={`confirmar-${slug}`}>
                        confirmo a remoção de todos os dias deste mês
                      </label>
                    </div>
                    <button className="btn btn-outline-danger btn-sm" type="submit">
                      Remover dados do mês
                    </button>
                  </form>
                )}
              </div>
              <div className="rolagem">
                <table className="table table-sm table-striped align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th className="text-end">Precip. (mm)</th>
                      <th className="text-end">Afluente (m³/s)</th>
                      <th className="text-end">Efluente (m³/s)</th>
                      <th className="text-end">Volume (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-secondary">
                          Nenhum dia cadastrado.
                        </td>
                      </tr>
                    )}
                    {datas.map((d) => (
                      <tr key={d}>
                        <td>{d.split('-').reverse().join('/')}</td>
                        {(['chuva', 'afluente', 'efluente', 'volume'] as const).map((c) => (
                          <td key={c} className="text-end">
                            {num(dias[d]![c], 1)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}

      <section className="acesso-card mb-3">
        <h2 className="acesso-card__titulo">
          <i className="bi bi-droplet-half" /> Carga orgânica — {comp}
        </h2>
        <form action={gravarExutoriosAcao} className="row g-2 align-items-end">
          <input type="hidden" name="acao" value="carga_mes" />
          {ocultos}
          {CAMPOS_CARGA.map(([campo, rotulo]) => (
            <div key={campo} className="col-6 col-md">
              <label className="form-label small" htmlFor={campo}>
                {rotulo}
              </label>
              <input className="form-control" type="text" inputMode="decimal" id={campo} name={campo} defaultValue={num(doMes[campo])} />
            </div>
          ))}
          <div className="col-auto">
            <button className="btn btn-primary" type="submit">
              Gravar mês
            </button>
          </div>
          <p className="form-text mb-0">Carga (t/dia) = vazão (m³/s) × DBO (mg/L) × 0,0864. Deixe em branco o que não foi amostrado.</p>
        </form>
      </section>

      <section className="acesso-card">
        <h2 className="acesso-card__titulo">
          <i className="bi bi-clock-history" /> Histórico de carga orgânica ({meses.length} mês(es))
        </h2>
        <div className="colunas">
          <form action={gravarExutoriosAcao}>
            <input type="hidden" name="acao" value="carga_historico" />
            {ocultos}
            <label className="form-label small" htmlFor="hist">
              Importar vários meses: <code>ano;mês;vazão Pinheiros;vazão Tietê;DBO Pinheiros;DBO Tietê</code>
            </label>
            <textarea className="form-control" id="hist" name="linhas" placeholder="2024;3;1,5;152,3;43,2;18,6" />
            <p className="form-text">Meses já cadastrados são substituídos pelos valores importados.</p>
            <button className="btn btn-primary" type="submit">
              Importar
            </button>
          </form>
          <div className="rolagem">
            <table className="table table-sm table-striped align-middle mb-0">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="text-end">Q Pinheiros</th>
                  <th className="text-end">Q Tietê</th>
                  <th className="text-end">DBO Pinheiros</th>
                  <th className="text-end">DBO Tietê</th>
                  <th className="text-end">Carga total (t/dia)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {meses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-secondary">
                      Nenhum mês cadastrado.
                    </td>
                  </tr>
                )}
                {meses.map((k) => {
                  const c = cargas[k]!;
                  return (
                    <tr key={k}>
                      <td>
                        {k.slice(5)}/{k.slice(0, 4)}
                      </td>
                      {CAMPOS_CARGA.map(([campo]) => (
                        <td key={campo} className="text-end">
                          {num(c[campo], 1)}
                        </td>
                      ))}
                      <td className="text-end fw-bold">{num(cargaMes(c).total, 0)}</td>
                      <td className="text-end">
                        <form action={gravarExutoriosAcao}>
                          <input type="hidden" name="acao" value="carga_remover" />
                          <input type="hidden" name="ym" value={k} />
                          {ocultos}
                          <button className="btn btn-sm btn-outline-danger" type="submit" aria-label={`Remover ${k} do histórico`} title={`Remover ${k} do histórico`}>
                            <i className="bi bi-trash" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
