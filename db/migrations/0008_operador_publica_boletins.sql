-- O perfil Operador passa a publicar boletins no site (permissão publicar_boletim,
-- que também despublica e arquiva). Tipos com "exige revisão" continuam precisando
-- de aprovação antes da publicação. Só acrescenta: não tira nada do que foi
-- ajustado pelo painel. Pode rodar de novo.

BEGIN;

INSERT INTO perfil_permissoes (perfil_id, permissao_id)
SELECT p.id, x.id FROM perfis p CROSS JOIN permissoes x
WHERE p.slug = 'operador' AND x.slug = 'publicar_boletim'
ON CONFLICT DO NOTHING;

UPDATE perfis
   SET descricao = 'Cria, edita e publica boletins; cria e edita gráficos e documentos da sala.'
 WHERE slug = 'operador'
   AND descricao = 'Cria e edita boletins, gráficos e documentos da sala.';

INSERT INTO schema_migrations (versao) VALUES ('0008_operador_publica_boletins') ON CONFLICT DO NOTHING;

COMMIT;
