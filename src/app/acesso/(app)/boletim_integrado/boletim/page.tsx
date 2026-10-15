import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecalho } from '@/components/acesso/pecas';
import { idTipoBoletim } from '@/lib/acesso/api';
import { acl, exigirSala } from '@/lib/auth/acl';
import { ehTipo, MESES, NOMES, periodoBoletim, PERMISSAO_BOLETIM, SALA_BOLETIM, ultimoMesFechado, type Tipo } from '@/lib/boletins-sala/boletim-integrado';
import { hojeSp } from '@/lib/integracoes/comum';
import { TelaBoletim } from './tela';
import '@/styles/acesso/boletim-integrado.css';

export const metadata: Metadata = { title: 'Boletins do Alto Tietê' };

const BASE = '/acesso/boletim_integrado';
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Sala CETESB — boletins mensais do Alto Tietê (Chuva-Vazão, Mananciais e
 * Exutórios). A página fica dentro da área administrativa e escolhe o boletim
 * e o mês; o conteúdo, os gráficos, a edição e o "Gerar PDF" (que imprime só o
 * boletim, sem a moldura da área) ficam em ./tela.tsx.
 */
export default async function BoletimIntegrado({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await acl();
  const sala = await exigirSala(SALA_BOLETIM, PERMISSAO_BOLETIM);
  const tipo: Tipo = ehTipo(um(sp.tipo)) ? (um(sp.tipo) as Tipo) : 'chuva_vazao';
  const { ano, mes } = periodoBoletim(um(sp.ano), um(sp.mes), ultimoMesFechado());
  const comp = `${MESES[mes - 1]}/${ano}`;
  const anoAtual = Number(hojeSp().slice(0, 4));
  const idTipo = await idTipoBoletim(sala.id, 'integrado-mensal');
  const hrefSala = `/acesso/salas/sala?s=${sala.slug}`;
  const hrefBoletim = (t: Tipo) => `${BASE}/boletim?${new URLSearchParams({ tipo: t, ano: String(ano), mes: String(mes) })}`;

  return (
    <div className="bi-area">
      <Cabecalho
        titulo={`Boletim ${NOMES[tipo]}`}
        subtitulo={`Bacia Hidrográfica do Alto Tietê (CBH-AT) · ${comp}`}
        trilha={[
          ['Painel', '/acesso'],
          [sala.sigla || sala.nome, hrefSala],
          ['Boletins', `/acesso/boletins?sala=${sala.id}`],
          [`Boletim ${NOMES[tipo]}`, null],
        ]}
        acoes={
          <>
            <Link className="btn btn-outline-secondary" href={hrefSala}>
              <i className="bi bi-arrow-left me-1" /> Voltar para a sala
            </Link>
            <Link className="btn btn-outline-secondary" href={`/acesso/boletins?sala=${sala.id}`}>
              <i className="bi bi-journal-text me-1" /> Boletins da sala
            </Link>
            <Link className="btn btn-outline-secondary" href="/acesso">
              <i className="bi bi-speedometer2 me-1" /> Painel
            </Link>
          </>
        }
      />

      <div className="bi-faixa sem-imprimir">
        <div>
          <small>SP Águas · CETESB — Monitoramento Hidrológico</small>
          <strong>Boletim {NOMES[tipo]}</strong>
          <span>Bacia Hidrográfica do Alto Tietê (CBH-AT) · {comp}</span>
        </div>
        <div className="bi-faixa-logos">
          {/* eslint-disable @next/next/no-img-element */}
          <img src={`${BASE}/img/logo-spaguas.png`} alt="SP Águas" />
          <img src={`${BASE}/img/logo-cetesb.png`} alt="CETESB" />
          <img src={`${BASE}/img/brasao.png`} alt="Brasão do Estado de São Paulo" />
          {/* eslint-enable @next/next/no-img-element */}
        </div>
      </div>

      <section className="acesso-card mb-3 bi-barra sem-imprimir">
        <nav aria-label="Boletins">
          {(Object.keys(NOMES) as Tipo[]).map((t) => (
            <Link key={t} className={`btn ${t === tipo ? 'btn-primary' : 'btn-outline-primary'}`} href={hrefBoletim(t)} aria-current={t === tipo ? 'page' : undefined}>
              Boletim {NOMES[t]}
            </Link>
          ))}
        </nav>
        <form method="get" action={`${BASE}/boletim`}>
          <input type="hidden" name="tipo" value={tipo} />
          <div>
            <label htmlFor="mes">Mês</label>
            <select className="form-select" id="mes" name="mes" defaultValue={mes} key={`mes-${mes}`}>
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ano">Ano</label>
            <select className="form-select" id="ano" name="ano" defaultValue={ano} key={`ano-${ano}`}>
              {Array.from({ length: anoAtual - 2014 }, (_, i) => anoAtual - i).map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">
            Abrir mês
          </button>
          {tipo === 'exutorios' && (
            <Link className="btn btn-outline-secondary" href={`${BASE}/exutorios?ano=${ano}&mes=${mes}`}>
              <i className="bi bi-pencil-square me-1" /> Dados dos exutórios
            </Link>
          )}
          {idTipo > 0 && (
            <Link className="btn btn-outline-secondary" href={`/acesso/boletins/novo?tipo=${idTipo}`}>
              <i className="bi bi-upload me-1" /> Cadastrar PDF como boletim
            </Link>
          )}
        </form>
      </section>

      <TelaBoletim key={`${tipo}-${ano}-${mes}`} tipo={tipo} ano={ano} mes={mes} nome={NOMES[tipo]} competencia={comp} />
    </div>
  );
}
