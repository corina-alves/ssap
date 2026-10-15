import type { Metadata } from 'next';
import Image from 'next/image';
import { AtoNormativo } from '@/components/site/ato-normativo';
import { DISPOSITIVOS, PREAMBULO } from '@/conteudo/resolucao-ana-daee-925';

export const metadata: Metadata = {
  title: 'Resolução Conjunta ANA/DAEE nº 925/2017 — Cantareira',
  description: 'Condições de operação do Sistema Cantareira.',
};

/** Faixas de operação e limites de retirada na Elevatória Santa Inês (art. 4º, caput e § 1º). */
const FAIXAS = [
  { n: 1, nome: 'Normal', volume: '≥ 60%', limite: '33,0' },
  { n: 2, nome: 'Atenção', volume: '≥ 40% e < 60%', limite: '31,0' },
  { n: 3, nome: 'Alerta', volume: '≥ 30% e < 40%', limite: '27,0' },
  { n: 4, nome: 'Restrição', volume: '≥ 20% e < 30%', limite: '23,0' },
  { n: 5, nome: 'Especial', volume: '< 20%', limite: '15,5' },
];

/** Assunto de cada artigo, só para o índice lateral (não faz parte do texto oficial). */
const ASSUNTOS: Record<number, string> = {
  1: 'Sistema e volume útil',
  2: 'Vazões mínimas',
  3: 'Períodos hidrológicos',
  4: 'Faixas e retirada para a RMSP',
  5: 'Vazões para as Bacias PCJ',
  6: 'Definição mensal da faixa',
  7: 'Validade',
  8: 'Revogação',
  9: 'Vigência',
};

export default function Pagina() {
  return (
    <AtoNormativo
      trilha="Resolução ANA/DAEE nº 925/2017"
      kicker="Regulação do Sistema Cantareira"
      titulo="Resolução Conjunta ANA/DAEE nº 925, de 29 de maio de 2017"
      ementa="Dispõe sobre as condições de operação para o Sistema Cantareira - SC, delimitado, para fins desta resolução, como o conjunto dos reservatórios Jaguari-Jacareí, Cachoeira, Atibainha e Paiva Castro."
      dados={[
        { icone: 'bi-calendar3', texto: 'Publicada em 31 de maio de 2017' },
        { icone: 'bi-bank', texto: 'Poder Executivo · Seção I' },
        { icone: 'bi-hash', texto: 'Documento nº 00000.031749/2017-55' },
      ]}
      orgaos={
        <>
          <Image src="/legado/logo/ana.png" alt="Agência Nacional de Águas (ANA)" width={176} height={50} />
          <Image src="/legado/logo/daee.png" alt="Departamento de Águas e Energia Elétrica (DAEE)" width={60} height={72} />
        </>
      }
      destaque={{
        id: 'faixas',
        rotulo: 'Faixas de operação',
        conteudo: (
          <section className="sssp-section-card" id="faixas">
            <div className="sssp-section-card__head">
              <div className="sssp-section-card__title">
                <span>
                  <i className="bi bi-bar-chart-steps" />
                </span>
                <div>
                  <h2>Faixas de operação</h2>
                  <p>Resumo do art. 4º: volume útil acumulado e limite máximo médio mensal de retirada na Elevatória Santa Inês.</p>
                </div>
              </div>
            </div>
            <div className="sssp-section-card__body">
              <div className="res-faixas">
                {FAIXAS.map((f) => (
                  <div key={f.n} className={`res-faixa res-faixa--${f.n}`}>
                    <small>Faixa {f.n}</small>
                    <strong>{f.nome}</strong>
                    <span>{f.volume}</span>
                    <b>
                      {f.limite} <em>m³/s</em>
                    </b>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ),
      }}
      preambulo={PREAMBULO}
      verbo="Resolvem:"
      dispositivos={DISPOSITIVOS}
      assuntos={ASSUNTOS}
      anexo={(t) =>
        t.endsWith('conforme quadro a seguir:') && (
          <figure className="res-quadro">
            <Image
              src="/legado/img/Anexo925a.jpg"
              alt="Quadro com as cotas e os volumes mínimos e máximos operacionais e o volume útil de cada reservatório do Sistema Cantareira"
              width={709}
              height={180}
            />
          </figure>
        )
      }
      assinaturas={[
        { nome: 'Vicente Andreu', cargo: 'Diretor-Presidente da ANA' },
        { nome: 'Ricardo Daruiz Borsari', cargo: 'Superintendente do DAEE' },
      ]}
    />
  );
}
