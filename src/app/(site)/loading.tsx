/** Mostrado na hora ao trocar de página, enquanto os dados da próxima chegam. */
export default function Carregando() {
  return (
    <div className="d-flex align-items-center justify-content-center gap-2 text-secondary py-5" role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm" aria-hidden />
      <span>Carregando…</span>
    </div>
  );
}
