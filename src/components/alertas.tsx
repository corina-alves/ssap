/** Erros e mensagem de sucesso de um formulário. */
export function Alertas({ erros, mensagem }: { erros: string[]; mensagem?: string }) {
  return (
    <>
      {erros.length > 0 && (
        <div className="alerta alerta-erro" role="alert">
          {erros.length === 1 ? (
            erros[0]
          ) : (
            <ul>
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {mensagem && (
        <div className="alerta alerta-ok" role="status">
          {mensagem}
        </div>
      )}
    </>
  );
}
