/**
 * Crédito da Open-Meteo onde o site mostra dados dela (a licença dos dados,
 * CC BY 4.0, pede a atribuição com link para https://open-meteo.com/).
 */
export function FonteOpenMeteo({ prefixo = 'Fonte: ' }: { prefixo?: string }) {
  return (
    <>
      {prefixo}
      <a href="https://open-meteo.com/" target="_blank" rel="noopener">
        Open-Meteo
      </a>
    </>
  );
}
