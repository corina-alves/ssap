import miolo from '@/conteudo/legado/boletim_pcj';
import { idTipoBoletim } from '@/lib/acesso/api';
import { escaparHtml, paginaAvulsa } from '@/lib/acesso/pagina-avulsa';
import { acl, exigirSala } from '@/lib/auth/acl';
import { PERMISSAO_PCJ, SALA_PCJ } from '@/lib/boletins-sala/pcj';
import { hojeSp } from '@/lib/integracoes/comum';

/**
 * Boletim Diário da Sala de Situação PCJ — página editável (acesso/boletim_pcj/
 * do PHP): os dados vêm do SIBH, todas as células e textos podem ser corrigidos
 * na tela, o rascunho fica salvo no navegador e "Gerar PDF" imprime em 16:9.
 */
export async function GET() {
  await acl(); // login primeiro (redireciona para /acesso/login)
  const sala = await exigirSala(SALA_PCJ, PERMISSAO_PCJ); // 404 ou "sem acesso"
  const hoje = hojeSp();
  const idTipo = await idTipoBoletim(sala.id, 'boletim-diario');

  return paginaAvulsa({
    titulo: 'Boletim Diário — Sala de Situação PCJ',
    pasta: 'boletim_pcj',
    versao: '20261005',
    // O PHP mandava um token CSRF; aqui a origem do POST é conferida em src/proxy.ts.
    dados: { token: '', hoje, dados: '/api/acesso/boletim_pcj/dados', medias: '/api/acesso/boletim_pcj/medias' },
    barra: `    <a class="barra__voltar" href="/acesso/boletins?sala=${sala.id}">&larr; Boletins PCJ</a>
    <label>Data do boletim <input type="date" id="data" max="${escaparHtml(hoje)}" value="${escaparHtml(hoje)}"></label>
    <button type="button" id="btn-carregar" class="primario">Carregar dados do SIBH</button>
    <button type="button" id="btn-medias">Salvar médias do mês</button>
    <button type="button" id="btn-limpar">Descartar edições</button>
    <button type="button" id="btn-pdf" class="destaque">Gerar PDF</button>${
      idTipo ? `\n    <a class="barra__link" href="/acesso/boletins/novo?tipo=${idTipo}" target="_blank" rel="noopener">Cadastrar PDF como boletim &rarr;</a>` : ''
    }
    <span id="status" class="barra__status" role="status"></span>`,
    dica: `Clique em qualquer valor ou texto para corrigir. As edições ficam salvas neste navegador (por data).
    As médias históricas editadas valem para os próximos boletins só depois de "Salvar médias do mês".
    Em "Gerar PDF", escolha <strong>Salvar como PDF</strong> e deixe as margens em <strong>Nenhuma</strong>.`,
    miolo,
  });
}
