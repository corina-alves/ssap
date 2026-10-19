import { acl } from '@/lib/auth/acl';
import { usuarioAtual } from '@/lib/auth/sessao';
import { csvPosto, diasEntre, MAX_DIAS, postosFluviometricos, seriePosto } from '@/lib/hidrologia/postos-graficos';
import { hojeSp } from '@/lib/integracoes/comum';

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dados do posto em CSV (Defesa Civil → Gráficos de postos): ?p=<id>&de=&ate=.
 * Mesmas regras da página: login e permissão de ver o painel; até MAX_DIAS dias.
 */
export async function GET(req: Request) {
  if (!(await usuarioAtual())) return new Response('Faça login.', { status: 401 });
  const a = await acl();
  if (!a.podeEmAlguma('visualizar_dashboard')) return new Response('Sem acesso.', { status: 403 });

  const q = new URL(req.url).searchParams;
  const id = Number(q.get('p'));
  const de = q.get('de') ?? '';
  const ate = q.get('ate') ?? '';
  const hoje = hojeSp();
  if (!Number.isInteger(id) || id <= 0 || !RE_DATA.test(de) || !RE_DATA.test(ate) || de > ate || ate > hoje) {
    return new Response('Posto ou período inválido.', { status: 400 });
  }
  if (diasEntre(de, ate).length > MAX_DIAS) return new Response(`Período de no máximo ${MAX_DIAS} dias.`, { status: 400 });

  const posto = (await postosFluviometricos()).find((p) => p.id === id);
  if (!posto) return new Response('Posto não encontrado no SIBH.', { status: 404 });
  const pontos = await seriePosto(id, de, ate);
  if (!pontos) return new Response('Não foi possível obter as leituras do SIBH agora. Tente novamente em instantes.', { status: 503 });

  const nome = `posto_${posto.prefixo.replace(/[^0-9A-Za-z_-]/g, '') || id}_${de}_a_${ate}.csv`;
  return new Response(csvPosto(posto, pontos), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
