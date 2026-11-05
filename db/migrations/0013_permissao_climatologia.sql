-- =============================================================================
-- Migração 0013: permissão do Painel de Climatologia por UGRHI (/acesso/climatologia).
-- Nasce concedida aos perfis que já veem o painel (visualizar_dashboard), para
-- ninguém perder nem ganhar acesso; depois cada perfil é ajustado pela tela
-- "Perfis e permissões". Só acrescenta. Pode rodar de novo.
-- =============================================================================

BEGIN;

INSERT INTO permissoes (slug, modulo, descricao, ordem)
SELECT 'visualizar_climatologia', 'climatologia', 'Ver o Painel de Climatologia por UGRHI', 70
WHERE NOT EXISTS (SELECT 1 FROM permissoes WHERE slug = 'visualizar_climatologia');

INSERT INTO perfil_permissoes (perfil_id, permissao_id)
SELECT pp.perfil_id, x.id
  FROM perfil_permissoes pp
  JOIN permissoes d ON d.id = pp.permissao_id AND d.slug = 'visualizar_dashboard'
 CROSS JOIN permissoes x
 WHERE x.slug = 'visualizar_climatologia'
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (versao) VALUES ('0013_permissao_climatologia') ON CONFLICT DO NOTHING;

COMMIT;
