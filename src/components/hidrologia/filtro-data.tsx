import { dataBr } from '@/lib/formato';
import { hojeSp, RE_DATA } from '@/lib/integracoes/comum';

/** Data de referência vinda da URL: válida, entre 2010 e hoje; senão hoje. */
export function dataDaUrl(v: string | string[] | undefined): string {
  const hoje = hojeSp();
  const t = (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
  return RE_DATA.test(t) && t >= '2010-01-01' && t <= hoje ? t : hoje;
}

/** Formulário GET de data (funciona sem JavaScript). */
export function FiltroData({ data }: { data: string }) {
  return (
    <form className="filtros" method="get">
      <label className="inline">
        Data de referência <input type="date" name="data" defaultValue={data} min="2010-01-01" max={hojeSp()} />
      </label>
      <button type="submit" className="botao botao-secundario">
        Atualizar
      </button>
    </form>
  );
}

/** Aviso quando a data usada difere da pedida (SABESP ainda não publicou). */
export function AvisoData({ pedida, usada }: { pedida: string; usada: string }) {
  if (pedida === usada) return null;
  return (
    <p className="suave">
      Mostrando {dataBr(usada)}, o dia mais recente com dados completos até {dataBr(pedida)}.
    </p>
  );
}
