import miolo from '@/conteudo/legado/boletim_paraiba';
import { idTipoBoletim } from '@/lib/acesso/api';
import { paginaAvulsa } from '@/lib/acesso/pagina-avulsa';
import { acl, exigirSala } from '@/lib/auth/acl';
import { PERMISSAO_PARAIBA, SALA_PARAIBA } from '@/lib/boletins-sala/paraiba';

/**
 * Boletim Diário — Sala de Situação Vale do Paraíba (UGRHI 2). Página editável
 * (acesso/boletim_paraiba/ do PHP): os dados vêm das APIs, todo valor e texto
 * pode ser corrigido na tela, o rascunho fica salvo no navegador (por dia) e
 * "Gerar PDF" imprime as páginas em A4.
 */
export async function GET() {
  await acl(); // login primeiro (redireciona para /acesso/login)
  const sala = await exigirSala(SALA_PARAIBA, PERMISSAO_PARAIBA); // 404 ou "sem acesso"
  const idTipo = await idTipoBoletim(sala.id, 'boletim-diario');

  return paginaAvulsa({
    titulo: 'Boletim Diário — Sala de Situação Vale do Paraíba',
    pasta: 'boletim_paraiba',
    versao: '20261009a',
    scripts: ['/acesso/vendor/chartjs/chart.umd.min.js'],
    barra: `    <a class="barra__voltar" href="/acesso/boletins?sala=${sala.id}">&larr; Boletins Vale do Paraíba</a>
    <button type="button" id="btn-atualizar" class="primario">Atualizar dados das APIs</button>
    <button type="button" id="btn-limpar">Descartar edições</button>
    <button type="button" id="btn-pdf" class="destaque">Gerar PDF</button>${
      idTipo ? `\n    <a class="barra__link" href="/acesso/boletins/novo?tipo=${idTipo}" target="_blank" rel="noopener">Cadastrar PDF como boletim &rarr;</a>` : ''
    }
    <span id="status" class="barra__status" role="status">Carregando dados…</span>`,
    dica: `Clique em qualquer valor ou texto para corrigir. As edições ficam salvas neste navegador (por dia) e continuam valendo ao atualizar os dados.
    Em "Gerar PDF", escolha <strong>Salvar como PDF</strong>, papel <strong>A4</strong> e margens <strong>Nenhuma</strong>.`,
    miolo,
  });
}
