-- =============================================================================
-- Migração 0003: categorias de documento usadas pelas páginas públicas
-- /documentos/<categoria> (mesmas do menu "Documentos" do site PHP).
-- Documentos públicos cadastrados nelas aparecem nas respectivas páginas.
-- =============================================================================

BEGIN;

INSERT INTO documento_categorias (sala_id, slug, nome, ordem) VALUES
(NULL, 'resolucoes-cantareira', 'Resoluções do Cantareira', 50),
(NULL, 'deliberacoes',          'Deliberações',             60),
(NULL, 'atos-administrativos',  'Atos Administrativos',     70),
(NULL, 'outros-documentos',     'Outros Documentos',        80)
ON CONFLICT (sala_id, slug) DO NOTHING;

INSERT INTO schema_migrations (versao) VALUES ('0003_categorias_documentos_site') ON CONFLICT DO NOTHING;

COMMIT;
