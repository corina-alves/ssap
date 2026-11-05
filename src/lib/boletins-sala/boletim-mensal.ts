import 'server-only';
import { CHAVES_IMAGEM, CHAVES_TEXTO } from '@/conteudo/boletim-mensal';
import { FORMATOS_DOCUMENTO, lerArquivoEnviado, registrarArquivo } from '../arquivos';
import { auditar } from '../auditoria';
import type { Acl } from '../auth/acl';
import { query, queryOne, transacao } from '../db';
import { graficosSistemas, somarMeses } from '../hidrologia/sistemas-ssd';
import { textoAnalise, volumesMensais, type TabelaVolumes } from '../hidrologia/volumes-mensais';
import { contagem, ultimoMes } from '../integracoes/protocolo-escassez';
import type { Origem } from '../requisicao';

/**
 * Boletim Mensal da Sala (/acesso/boletim_mensal): o que a equipe escreve ou
 * anexa em cada mês (textos e imagens das fontes sem integração). O resto do
 * boletim é montado na hora com as integrações.
 */

export const SALA_BOLETIM_MENSAL = 'alfredo-pisani';
export const PERMISSAO_VER = 'visualizar_boletins';
export const PERMISSAO_EDITAR = 'criar_boletim';
const FORMATOS_IMAGEM = { png: FORMATOS_DOCUMENTO.png!, jpg: FORMATOS_DOCUMENTO.jpg!, jpeg: FORMATOS_DOCUMENTO.jpeg! };
const MAX_TEXTO = 6000;

export type Conteudo = { textos: Record<string, string>; imagens: Record<string, number> };
export type ConteudoMes = Conteudo & {
  /** Textos que vieram do mês anterior (ainda não editados neste mês). */
  herdados: string[];
  atualizadoEm: Date | null;
  atualizadoPor: string | null;
};

const vazio = (): Conteudo => ({ textos: {}, imagens: {} });
export const validoMes = (mes: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);

/** Conteúdo do mês; os textos que faltam vêm do mês anterior (as imagens não: cada mês tem as suas). */
export async function conteudoDoMes(salaId: number, mes: string): Promise<ConteudoMes> {
  const linhas = await query<{ mes: string; conteudo: Conteudo; atualizado_em: Date; nome: string | null }>(
    `SELECT to_char(b.mes, 'YYYY-MM') AS mes, b.conteudo, b.atualizado_em, u.nome
       FROM boletim_mensal b LEFT JOIN usuarios u ON u.id = b.atualizado_por
      WHERE b.sala_id = $1 AND b.mes IN ($2::date, $3::date)`,
    [salaId, `${mes}-01`, `${somarMeses(mes, -1)}-01`],
  );
  const atual = linhas.find((l) => l.mes === mes);
  const anterior = linhas.find((l) => l.mes !== mes)?.conteudo ?? vazio();
  const c = { ...vazio(), ...atual?.conteudo };
  const herdados = Object.keys(anterior.textos ?? {}).filter((k) => !(k in c.textos) && k !== 'capa-referencia');
  return {
    textos: { ...Object.fromEntries(herdados.map((k) => [k, anterior.textos[k]!])), ...c.textos },
    imagens: c.imagens ?? {},
    herdados,
    atualizadoEm: atual?.atualizado_em ?? null,
    atualizadoPor: atual?.nome ?? null,
  };
}

type Autor = { id: number; nome: string };

async function alterar(salaId: number, mes: string, autor: Autor, origem: Origem, descricao: string, mudar: (c: Conteudo) => Conteudo): Promise<void> {
  await transacao(async (c) => {
    const atual = (await c.query<{ conteudo: Conteudo }>('SELECT conteudo FROM boletim_mensal WHERE sala_id = $1 AND mes = $2::date FOR UPDATE', [salaId, `${mes}-01`])).rows[0]?.conteudo ?? vazio();
    const novo = mudar({ textos: { ...atual.textos }, imagens: { ...atual.imagens } });
    await c.query(
      `INSERT INTO boletim_mensal (sala_id, mes, conteudo, atualizado_em, atualizado_por) VALUES ($1, $2::date, $3, now(), $4)
       ON CONFLICT (sala_id, mes) DO UPDATE SET conteudo = EXCLUDED.conteudo, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por`,
      [salaId, `${mes}-01`, JSON.stringify(novo), autor.id],
    );
    await auditar({ usuario: autor, salaId, modulo: 'boletins', acao: 'editar', entidade: 'boletim_mensal', entidadeId: null, descricao: `Boletim mensal ${mes}: ${descricao}`, ip: origem.ip, userAgent: origem.userAgent }, c);
  });
}

/** Grava os textos enviados (só as chaves conhecidas; texto vazio volta a herdar do mês anterior). */
export async function salvarTextos(a: Acl, salaId: number, mes: string, textos: Record<string, string>, autor: Autor, origem: Origem): Promise<string[]> {
  if (!a.pode(PERMISSAO_EDITAR, salaId)) return ['Sem permissão para editar o boletim mensal desta sala.'];
  if (!validoMes(mes)) return ['Mês inválido.'];
  const validos = Object.entries(textos).filter(([k]) => CHAVES_TEXTO.has(k));
  if (validos.some(([, v]) => v.length > MAX_TEXTO)) return [`Cada texto pode ter até ${MAX_TEXTO} caracteres.`];
  await alterar(salaId, mes, autor, origem, 'textos', (c) => {
    for (const [k, v] of validos) {
      if (v.trim()) c.textos[k] = v.trim();
      else delete c.textos[k];
    }
    return c;
  });
  return [];
}

/** Anexa (ou troca) a imagem de uma posição do boletim. PNG ou JPG, conferidos pelo conteúdo. */
export async function enviarImagem(a: Acl, salaId: number, salaSlug: string, mes: string, chave: string, arquivo: FormDataEntryValue | null, autor: Autor, origem: Origem): Promise<string[]> {
  if (!a.pode(PERMISSAO_EDITAR, salaId)) return ['Sem permissão para editar o boletim mensal desta sala.'];
  if (!validoMes(mes) || !CHAVES_IMAGEM.has(chave)) return ['Posição de imagem inválida.'];
  let enviado;
  try {
    enviado = await lerArquivoEnviado(arquivo, FORMATOS_IMAGEM, { obrigatorio: true, rotulo: 'a imagem (PNG ou JPG)' });
  } catch (e) {
    return [(e as Error).message];
  }
  const { id } = await registrarArquivo(enviado!, { salaId, pasta: `boletim-mensal/${salaSlug}/${mes}`, usuarioId: autor.id });
  await query("UPDATE arquivos SET origem = 'imagem' WHERE id = $1", [id]);
  await alterar(salaId, mes, autor, origem, `imagem ${chave}`, (c) => ({ ...c, imagens: { ...c.imagens, [chave]: id } }));
  return [];
}

export async function removerImagem(a: Acl, salaId: number, mes: string, chave: string, autor: Autor, origem: Origem): Promise<string[]> {
  if (!a.pode(PERMISSAO_EDITAR, salaId)) return ['Sem permissão para editar o boletim mensal desta sala.'];
  if (!validoMes(mes) || !CHAVES_IMAGEM.has(chave)) return ['Posição de imagem inválida.'];
  await alterar(salaId, mes, autor, origem, `remoção da imagem ${chave}`, (c) => {
    delete c.imagens[chave];
    return c;
  });
  return [];
}

const MESES_EXTENSO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const mesExtenso = (anoMes: string) => `${MESES_EXTENSO[Number(anoMes.slice(5)) - 1]}/${anoMes.slice(0, 4)}`;

export type DadosBoletim = {
  mes: string;
  conteudo: ConteudoMes;
  volumes: TabelaVolumes;
  analiseVolumes: string | null;
  sistemas: Awaited<ReturnType<typeof graficosSistemas>>;
  /** Mês mais recente do Protocolo de Escassez publicado até o mês do boletim, com a contagem por estágio. */
  protocolo: { ano: number; mes: number; contagem: Record<number, number> | null } | null;
};

/** Tudo o que o boletim do mês mostra: integrações (na hora, com cache) e o conteúdo da equipe. */
export async function dadosBoletim(salaId: number, mes: string): Promise<DadosBoletim> {
  const [conteudo, volumes, sistemas, protocoloMes] = await Promise.all([
    conteudoDoMes(salaId, mes),
    volumesMensais(mes),
    graficosSistemas(mes, ''),
    ultimoMes(mes).catch(() => null),
  ]);
  const protocolo = protocoloMes ? { ...protocoloMes, contagem: await contagem(protocoloMes.ano, protocoloMes.mes).catch(() => null) } : null;
  return { mes, conteudo, volumes, analiseVolumes: textoAnalise(volumes), sistemas, protocolo };
}

/** A imagem pertence ao boletim mensal desta sala (para a rota de download conferir antes de servir). */
export async function imagemDoBoletim(salaId: number, arquivoId: number): Promise<boolean> {
  const r = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM boletim_mensal b, jsonb_each_text(b.conteudo -> 'imagens') i WHERE b.sala_id = $1 AND i.value::bigint = $2) AS ok`,
    [salaId, arquivoId],
  );
  return r?.ok ?? false;
}
