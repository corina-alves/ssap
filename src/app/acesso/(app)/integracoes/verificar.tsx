import Link from 'next/link';

/** Força nova verificação (ignora o resultado guardado por 3 minutos). */
export function VerificarAgora() {
  return (
    <Link href="/acesso/integracoes?agora=1" className="botao botao-secundario" prefetch={false}>
      Verificar agora
    </Link>
  );
}
