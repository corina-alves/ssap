const FUSO = 'America/Sao_Paulo';

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, timeStyle: 'short' });

/** 30/09/2026, 18:45 (horário de São Paulo); "—" quando vazio. */
export function dataHora(d: Date | string | null | undefined): string {
  return d ? fmtDataHora.format(new Date(d)) : '—';
}

/** 18:45 (horário de São Paulo); "—" quando vazio. */
export function hora(d: Date | string | null | undefined): string {
  return d ? fmtHora.format(new Date(d)) : '—';
}

/** 2026-09-30 → 30/09/2026 (data sem hora, sem conversão de fuso). */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** Título dos boletins de tipo com título fixo: "<fixo> — DD/MM/AAAA" (data de referência). */
export function tituloFixo(fixo: string, dataReferencia: string): string {
  return /^d{4}-d{2}-d{2}$/.test(dataReferencia) ? `${fixo} — ${dataBr(dataReferencia)}` : fixo;
}

/** 1536 → "2 KB"; 3 MB → "3.0 MB". */
export function tamanho(bytes: string | number | null | undefined): string {
  const n = Number(bytes ?? 0);
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(n / 1024))} KB`;
}

/** Extensão do nome do arquivo, em maiúsculas (PDF, XLSX...). */
export function extensao(nome: string): string {
  return /\.([a-z0-9]{1,8})$/i.exec(nome)?.[1]?.toUpperCase() ?? '';
}
