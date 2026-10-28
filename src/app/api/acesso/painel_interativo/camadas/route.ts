import { NextResponse } from 'next/server';
import { RMSP_COD_IBGE } from '@/conteudo/sumario-automatico-tp';
import { exigirApi } from '@/lib/acesso/api';
import { PERMISSAO_PAINEL, SALA_PAINEL } from '@/lib/hidrologia/painel-interativo';
import { contornoMunicipio, malhaMunicipiosSP, municipiosSP } from '@/lib/integracoes/ibge';

export const maxDuration = 60;

const COD_CAPITAL = 3550308; // São Paulo

/** GET — camadas do mapa do SIM (IBGE): o limite da capital e os 39 municípios da RMSP, com os nomes. */
export async function GET() {
  const acesso = await exigirApi(SALA_PAINEL, PERMISSAO_PAINEL);
  if (acesso instanceof NextResponse) return acesso;
  const [capital, malha, nomes] = await Promise.all([contornoMunicipio(COD_CAPITAL), malhaMunicipiosSP(), municipiosSP()]);
  const nomeDe = new Map(nomes.ok ? nomes.dados.map((m) => [m.codigoIbge, m.nome]) : []);
  return NextResponse.json(
    {
      capital: capital.ok ? capital.dados : null,
      rmsp: malha.ok ? malha.dados.filter((m) => RMSP_COD_IBGE.has(String(m.codigo))).map((m) => ({ ...m, nome: nomeDe.get(m.codigo) ?? String(m.codigo) })) : [],
    },
    { headers: { 'Cache-Control': 'private, max-age=86400' } },
  );
}
