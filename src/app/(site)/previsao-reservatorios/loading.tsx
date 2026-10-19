import { ESQUELETOS, Estrutura } from './estrutura';

/** Estrutura da página em esqueleto: aparece no clique do menu, antes de o servidor responder. */
export default function Carregando() {
  return <Estrutura {...ESQUELETOS} />;
}
