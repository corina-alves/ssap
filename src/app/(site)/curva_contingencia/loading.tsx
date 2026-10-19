import { Consultando, EsqueletoGrafico } from '@/components/carregamento';
import { Principal } from '@/components/site/layout';
import { Cartoes, Periodo, SecaoProjecao } from './cartoes';

/** Estrutura da página em esqueleto: aparece no clique do menu, antes de o servidor responder. */
export default function Carregando() {
  return (
    <Principal>
      <Periodo>
        <Consultando>Consultando os volumes observados…</Consultando>
      </Periodo>
      <Cartoes d={null} />
      <SecaoProjecao>
        <EsqueletoGrafico altura={470} rotulo="Carregando a projeção de volume…" />
      </SecaoProjecao>
    </Principal>
  );
}
