import { Barra, Painel } from './painel';

/** Estrutura da página em esqueleto: aparece no clique do menu, antes de o servidor responder. */
export default function Carregando() {
  return (
    <main className="public-content out-page">
      <div className="container">
        <Barra />
        <Painel d={null} />
      </div>
    </main>
  );
}
