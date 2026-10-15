import { hojeSp } from '../integracoes/comum';
import { FREQ_MENSAL, idSerieDoSpace, serie } from '../integracoes/ssd';

/**
 * Gráficos dos sistemas produtores — volume útil, chuva, vazão afluente e
 * vazão defluente mês a mês (séries mensais do SSD SP Águas). Porte de
 * acesso/sistemas_produtores/index.php.
 *
 * Janela: os 12 últimos meses completos. Em outubro/2026, por exemplo, vai de
 * outubro/2025 a setembro/2026 (o mês corrente ainda está incompleto).
 */

/** Sistemas produtores → id do "space" (WaterSystem) no SSD. */
export const SISTEMAS: Record<string, { nome: string; space: number }> = {
  cantareira: { nome: 'Cantareira', space: 3 },
  'alto-tiete': { nome: 'Alto Tietê', space: 1 },
  guarapiranga: { nome: 'Guarapiranga', space: 5 },
  cotia: { nome: 'Cotia', space: 4 },
  'rio-grande': { nome: 'Rio Grande', space: 8 },
  'rio-claro': { nome: 'Rio Claro', space: 7 },
  'sao-lourenco': { nome: 'São Lourenço', space: 9 },
  sim: { nome: 'SIM (Sabesp RMSP)', space: 10 },
};

/** Variáveis do gráfico: nome e unidade no SSD, e rótulo curto da tabela. */
export const VARIAVEIS = {
  volume: { variavel: 'Volume útil', unidade: '%', curto: 'Volume' },
  chuva: { variavel: 'Chuva', unidade: 'mm', curto: 'Chuva' },
  afluente: { variavel: 'Vazão afluente', unidade: 'm³/s', curto: 'Afluente' },
  defluente: { variavel: 'Vazão defluente', unidade: 'm³/s', curto: 'Defluente' },
} as const;
export type Variavel = keyof typeof VARIAVEIS;

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const QTD_MESES = 12;

/** "AAAA-MM" deslocado `n` meses. */
export function somarMeses(anoMes: string, n: number): string {
  const [a, m] = anoMes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Opções de "último mês do gráfico": do último mês completo para trás, 36 meses. */
export function opcoesFim(hoje = hojeSp()): { valor: string; rotulo: string }[] {
  const ultimoCompleto = somarMeses(hoje.slice(0, 7), -1);
  return Array.from({ length: 36 }, (_, i) => {
    const am = somarMeses(ultimoCompleto, -i);
    return { valor: am, rotulo: `${MESES[Number(am.slice(5)) - 1]}/${am.slice(0, 4)}` };
  });
}

const arred2 = (v: number) => Math.round(v * 100) / 100;

/** Valores mensais de uma variável de um sistema, um por mês do período (null onde não há dado). */
async function serieMensal(space: number, v: Variavel, meses: string[]): Promise<(number | null)[]> {
  const { variavel, unidade } = VARIAVEIS[v];
  const id = await idSerieDoSpace(space, variavel, unidade, FREQ_MENSAL);
  const porMes = new Map<string, number>();
  if (id) {
    const r = await serie(id, `${meses[0]}-01`, `${meses[meses.length - 1]}-01`);
    if (!r.ok) throw new Error(r.mensagem);
    for (const p of r.dados.pontos) porMes.set(p.data.slice(0, 7), p.valor);
  }
  return meses.map((m) => (porMes.has(m) ? arred2(porMes.get(m)!) : null));
}

export type GraficoSistema = { chave: string; nome: string; valores: Record<Variavel, (number | null)[]>; rotuloChuva: string };

export async function graficosSistemas(fim: string, sistemaPedido: string) {
  const inicio = somarMeses(fim, -(QTD_MESES - 1));
  const meses = Array.from({ length: QTD_MESES }, (_, i) => somarMeses(inicio, i));
  const escolhidos = SISTEMAS[sistemaPedido] ? [sistemaPedido] : Object.keys(SISTEMAS);

  const graficos: GraficoSistema[] = [];
  const falhas: string[] = [];
  await Promise.all(
    escolhidos.map(async (chave) => {
      const { nome, space } = SISTEMAS[chave]!;
      try {
        const [volume, chuva, afluente, defluente] = await Promise.all((Object.keys(VARIAVEIS) as Variavel[]).map((v) => serieMensal(space, v, meses)));
        const valores = { volume: volume!, chuva: chuva!, afluente: afluente!, defluente: defluente! };
        if (!Object.values(valores).flat().some((x) => x !== null)) throw new Error('sem dados');
        graficos.push({ chave, nome, valores, rotuloChuva: 'Chuva (mm)' });
      } catch {
        falhas.push(nome);
      }
    }),
  );
  graficos.sort((a, b) => escolhidos.indexOf(a.chave) - escolhidos.indexOf(b.chave));

  // SIM: a chuva é a média simples da chuva dos sistemas que o compõem (os demais
  // da lista), mês a mês, entre os sistemas que têm dado no mês.
  const sim = graficos.find((g) => g.chave === 'sim');
  if (sim) {
    try {
      const porSistema = await Promise.all(
        Object.entries(SISTEMAS)
          .filter(([chave]) => chave !== 'sim')
          .map(([chave, s]) => graficos.find((g) => g.chave === chave)?.valores.chuva ?? serieMensal(s.space, 'chuva', meses)),
      );
      sim.valores.chuva = meses.map((_, i) => {
        const vals = porSistema.map((s) => s[i]).filter((x): x is number => x != null);
        return vals.length ? arred2(vals.reduce((t, x) => t + x, 0) / vals.length) : null;
      });
      sim.rotuloChuva = 'Chuva média dos sistemas (mm)';
    } catch {
      // mantém a chuva do próprio SSD para o SIM
    }
  }

  const extenso = (am: string) => `${MESES_EXTENSO[Number(am.slice(5)) - 1]}/${am.slice(0, 4)}`;
  return {
    inicio,
    fim,
    meses,
    rotulos: meses.map((am) => `${MESES[Number(am.slice(5)) - 1]} '${am.slice(2, 4)}`),
    periodoTexto: `${extenso(inicio)} a ${extenso(fim)}`,
    graficos,
    falhas,
  };
}
