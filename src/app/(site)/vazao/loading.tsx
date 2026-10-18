import { Consultando } from '@/components/carregamento';
import { Principal } from '@/components/site/layout';
import { hojeSp } from '@/lib/integracoes/comum';
import { Periodo, Secoes } from './secoes';

/** Estrutura da página em esqueleto: aparece no clique do menu, antes de o servidor responder. */
export default function Carregando() {
  return (
    <Principal>
      <Periodo>
        <Consultando>Consultando a SABESP…</Consultando>
      </Periodo>
      <Secoes d={null} ano={Number(hojeSp().slice(0, 4))} />
    </Principal>
  );
}
