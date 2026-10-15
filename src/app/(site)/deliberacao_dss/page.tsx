import type { Metadata } from 'next';
import Image from 'next/image';
import { AtoNormativo } from '@/components/site/ato-normativo';
import { DISPOSITIVOS, PREAMBULO } from '@/conteudo/deliberacao-crh-287';

export const metadata: Metadata = {
  title: 'Deliberação CRH nº 287/2024',
  description: 'Reorganiza a Sala de Situação São Paulo e dá outras providências.',
};

/** Assunto de cada artigo, só para o índice lateral (não faz parte do texto oficial). */
const ASSUNTOS: Record<number, string> = {
  1: 'Reorganização',
  2: 'Definição',
  3: 'Funções',
  4: 'Objetivos',
  5: 'Outras salas de situação',
  6: 'Vigência',
};

export default function Pagina() {
  return (
    <AtoNormativo
      trilha="Deliberação CRH nº 287/2024"
      kicker="Conselho Estadual de Recursos Hídricos"
      titulo="Deliberação CRH nº 287, de 30 de outubro de 2024"
      ementa="Reorganiza a Sala de Situação São Paulo e dá outras providências."
      dados={[
        { icone: 'bi-calendar3', texto: 'Publicada em 19 de novembro de 2024' },
        { icone: 'bi-bank', texto: 'Diário Oficial do Estado · Caderno Executivo · Atos Normativos' },
        { icone: 'bi-hash', texto: 'SEI nº 137.00009078/2023-49' },
      ]}
      orgaos={<Image src="/legado/logo/brasao.png" alt="Brasão do Estado de São Paulo" width={62} height={72} />}
      preambulo={PREAMBULO}
      verbo="Delibera:"
      dispositivos={DISPOSITIVOS}
      assuntos={ASSUNTOS}
    />
  );
}
