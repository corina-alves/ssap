import { Consultando } from '@/components/carregamento';
import { Principal } from '@/components/site/layout';
import { PrevisaoEsqueleto, SecaoBusca } from './esqueleto';

/** Estrutura da página em esqueleto: aparece no clique do menu, antes de o servidor responder. */
export default function Carregando() {
  return (
    <Principal>
      <SecaoBusca>
        <Consultando />
      </SecaoBusca>
      <PrevisaoEsqueleto nome="São Paulo" />
    </Principal>
  );
}
