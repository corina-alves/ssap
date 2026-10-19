import { Consultando } from '@/components/carregamento';
import { Principal } from '@/components/site/layout';
import { esqueletoSerie, GradeSeries, Referencia } from './series';

/** Estrutura da página em esqueleto: aparece no clique do menu, antes de o servidor responder. */
export default function Carregando() {
  return (
    <Principal>
      <Referencia>
        <Consultando />
      </Referencia>
      <GradeSeries grafico={esqueletoSerie} />
    </Principal>
  );
}
