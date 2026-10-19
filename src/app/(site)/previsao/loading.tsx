import { Consultando, EsqueletoGrafico } from '@/components/carregamento';
import { Principal } from '@/components/site/layout';
import { PrevisaoEsqueleto, SecaoBusca, SecaoMapa } from './esqueleto';

/** Estrutura da página em esqueleto: aparece no clique do menu, antes de o servidor responder. */
export default function Carregando() {
  return (
    <Principal>
      <SecaoBusca>
        <Consultando>Localizando o município…</Consultando>
      </SecaoBusca>
      <PrevisaoEsqueleto nome="São Paulo" />
      <SecaoMapa>
        <EsqueletoGrafico altura={420} rotulo="Carregando o mapa de chuva prevista…" />
      </SecaoMapa>
    </Principal>
  );
}
