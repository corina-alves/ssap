import type { Metadata } from 'next';
import '@/styles/legado/pagina-atos-outorga.css';
import { SelectAutoEnvio } from '@/components/site/auto-envio';
import { Hero, Principal, Secao } from '@/components/site/layout';
import { ATOS } from './atos';
import { BuscaAutocompletar } from '@/components/busca-autocompletar';

export const metadata: Metadata = {
  title: 'Atos Administrativos de Outorga',
  description: 'Resoluções e portarias de outorga de direito de uso de recursos hídricos dos sistemas produtores da RMSP.',
};

const SISTEMAS = [...new Set(ATOS.map((a) => a.sistema))];

/** Sugestões da busca: ato (tipo e número), sistema, órgão, município, ano e assunto. */
const SUGESTOES = [
  ...ATOS.map((a) => `${a.tipo} ${a.numero}`),
  ...SISTEMAS,
  ...ATOS.map((a) => a.orgao),
  ...ATOS.map((a) => a.municipio),
  ...[...new Set(ATOS.map((a) => a.data.slice(-4)))].sort().reverse(),
  ...ATOS.map((a) => a.assunto),
];

/** Endereço do PDF, codificando cada segmento (há nomes com espaço e acento). */
const pdf = (rel: string) => `/legado/${rel.split('/').map(encodeURIComponent).join('/')}`;

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function AtosOutorga({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filtro = SISTEMAS.includes(um(sp.sistema)) ? um(sp.sistema) : 'todos';
  const q = um(sp.q).trim();
  const busca = q.toLocaleLowerCase('pt-BR');

  const linhas = ATOS.filter((a) => {
    if (filtro !== 'todos' && a.sistema !== filtro) return false;
    if (!busca) return true;
    return [a.sistema, a.tipo, a.numero, a.data, a.orgao, a.assunto, a.municipio].join(' ').toLocaleLowerCase('pt-BR').includes(busca);
  });

  return (
    <>
      <Hero
        kicker="Outorgas"
        titulo="Atos Administrativos de Outorga"
        texto="Resoluções e portarias de outorga de direito de uso de recursos hídricos dos Sistemas Produtores da Região Metropolitana de São Paulo."
        icone="bi-file-earmark-text"
      />
      <Principal>
        <Secao titulo="Atos por sistema produtor" subtitulo={`${linhas.length} de ${ATOS.length} atos`} icone="bi-list-columns">
          <form className="ato-filtros" method="get">
            <div className="sssp-field">
              <label htmlFor="sistema">Sistema produtor</label>
              <SelectAutoEnvio id="sistema" name="sistema" defaultValue={filtro}>
                <option value="todos">Todos os sistemas</option>
                {SISTEMAS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectAutoEnvio>
            </div>
            <div className="sssp-field" style={{ flex: 1, minWidth: 240 }}>
              <label htmlFor="q">Buscar</label>
              <BuscaAutocompletar sugestoes={SUGESTOES} id="q" name="q" defaultValue={q} placeholder="Nº, ano, órgão, assunto..." />
            </div>
          </form>

          <div className="table-responsive mt-3">
            <table className="ato-tabela">
              <thead>
                <tr>
                  <th>Sistema</th>
                  <th>Tipo do ato</th>
                  <th>Número</th>
                  <th>Data</th>
                  <th>Órgão</th>
                  <th>Interessado</th>
                  <th>Município</th>
                  <th>Assunto</th>
                  <th>Documento</th>
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="ato-vazio">
                      Nenhum ato encontrado para o filtro informado.
                    </td>
                  </tr>
                ) : (
                  linhas.map((a) => (
                    <tr key={a.pdf}>
                      <td className="ato-sistema">{a.sistema}</td>
                      <td>{a.tipo}</td>
                      <td className="ato-num">{a.numero}</td>
                      <td>{a.data}</td>
                      <td>{a.orgao}</td>
                      <td>{a.interessado}</td>
                      <td>{a.municipio}</td>
                      <td className="ato-assunto">{a.assunto}</td>
                      <td className="ato-doc">
                        <a className="btn btn-sm btn-outline-primary" href={pdf(a.pdf)} target="_blank" rel="noopener">
                          <i className="bi bi-file-earmark-pdf me-1" />
                          Abrir
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="ato-nota">
            <i className="bi bi-info-circle me-1" />
            Interessado: Companhia de Saneamento Básico do Estado de São Paulo — SABESP (CNPJ 43.776.517/0001-80). Para requerimentos e
            consulta de processos, utilize o{' '}
            <a href="https://www.spaguas.sp.gov.br/site/outorga/" target="_blank" rel="noopener">
              Portal de Outorgas da SP-Águas
            </a>
            .
          </div>
        </Secao>
      </Principal>
    </>
  );
}
