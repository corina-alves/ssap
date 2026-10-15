import type { Metadata } from 'next';
import Image from 'next/image';
import { AtoNormativo, Dispositivo } from '@/components/site/ato-normativo';
import { ANEXO_DEFINICOES, ANEXO_ESTAGIOS, ANEXO_ESTAGIOS_TITULO, DISPOSITIVOS, PREAMBULO } from '@/conteudo/deliberacao-spaguas-10';

export const metadata: Metadata = {
  title: 'Deliberação SP-Águas nº 10/2025',
  description: 'Experimento Regulatório para implementação do Protocolo de Escassez Hídrica.',
};

/** Assunto de cada artigo, só para o índice lateral (não faz parte do texto oficial). */
const ASSUNTOS: Record<number, string> = {
  1: 'Experimento regulatório',
  2: 'Abrangência',
  3: 'Definições',
  4: 'Monitoramento por indicadores',
  5: 'Sub-UGRHIs avaliadas',
  6: 'Estágios de disponibilidade',
  7: 'Avaliação mensal',
  8: 'Declaração de escassez',
  9: 'Fundamentação da declaração',
  10: 'Medidas por estágio',
  11: 'Adoção das medidas',
  12: 'Meios de comunicação',
  13: 'Conteúdo da comunicação',
  14: 'Situação de emergência',
  15: 'Integração com outros órgãos',
  16: 'Comunicação ao Conselho Diretor',
  17: 'Operacionalização',
  18: 'Acompanhamento',
  19: 'Suspensão',
  20: 'Condições da suspensão',
  21: 'Obrigações mantidas',
  22: 'Obrigações das outorgas',
  23: 'Medidas administrativas',
  24: 'Encerramento',
  25: 'Vigência',
};

const [tituloDefinicoes, ...definicoes] = ANEXO_DEFINICOES;

export default function Pagina() {
  return (
    <AtoNormativo
      trilha="Deliberação SP-Águas nº 10/2025"
      kicker="Gestão de Escassez"
      titulo="Deliberação SP-Águas nº 10, de 23 de setembro de 2025"
      ementa="Estabelece Experimento Regulatório para implementação do Protocolo de Escassez Hídrica no âmbito das bacias hidrográficas do Estado de São Paulo."
      dados={[
        { icone: 'bi-calendar3', texto: 'Publicada em 24 de setembro de 2025' },
        { icone: 'bi-bank', texto: 'Diário Oficial do Estado · Caderno Executivo · Atos Normativos' },
        { icone: 'bi-hash', texto: 'Processo SEI 137.00004407/2025-27' },
      ]}
      orgaos={
        <>
          <Image src="/legado/logo/brasao.png" alt="Brasão do Estado de São Paulo" width={62} height={72} />
          <Image src="/legado/logo/spaguas.png" alt="SP-Águas" width={114} height={72} />
        </>
      }
      preambulo={PREAMBULO}
      verbo="Delibera:"
      dispositivos={DISPOSITIVOS}
      assuntos={ASSUNTOS}
      assinaturas={[{ nome: 'Camila Rocha Cunha Viana', cargo: 'Diretora-Presidente' }]}
      anexos={[
        {
          id: 'anexo',
          rotulo: 'Anexo Único',
          conteudo: (
            <>
              <h2 className="res-resolvem">Anexo Único</h2>
              <section>
                <h3 className="res-capitulo">{tituloDefinicoes}</h3>
                {definicoes.map((t) => (
                  <Dispositivo key={t} texto={t} />
                ))}
              </section>
              <section>
                <h3 className="res-capitulo">{ANEXO_ESTAGIOS_TITULO}</h3>
                {ANEXO_ESTAGIOS.map((e) => (
                  <div key={e.n} className={`res-estagio res-estagio--${e.n}`}>
                    <p>
                      <strong>
                        Estágio {e.n} ({e.nome}) -
                      </strong>{' '}
                      {e.intro}
                    </p>
                    <div className="table-responsive">
                      <table className="res-tabela">
                        <thead>
                          <tr>
                            <th>Indicador</th>
                            <th>Condição</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.linhas.map(([indicador, condicao]) => (
                            <tr key={indicador}>
                              <td>{indicador}</td>
                              <td>{condicao}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </section>
            </>
          ),
        },
      ]}
    />
  );
}
