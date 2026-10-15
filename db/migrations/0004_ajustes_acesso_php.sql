-- =============================================================================
-- Migração 0004: acompanha as mudanças da área /acesso do PHP de 2026-10-02
-- (database/migracoes/2026-10-02-administrar-boletins.sql e config/estrutura.php).
--
--   * permissão "administrar_boletins" (só o Administrador do Sistema, de início);
--   * tipo "Boletim Integrado SP Águas/ARSESP" na Sala Estadual;
--   * nomes novos de três tipos e da sala CETESB.
--
-- Os nomes só mudam se ainda forem os da migração 0002: ajuste feito pelo
-- painel não é sobrescrito. Pode rodar de novo.
-- =============================================================================

BEGIN;

INSERT INTO permissoes (slug, modulo, descricao, ordem) VALUES
('administrar_boletins', 'boletins', 'Editar e excluir qualquer boletim, inclusive publicado', 27)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO perfil_permissoes (perfil_id, permissao_id)
SELECT p.id, x.id FROM perfis p CROSS JOIN permissoes x
WHERE p.slug = 'admin_sistema' AND x.slug = 'administrar_boletins'
ON CONFLICT DO NOTHING;

INSERT INTO tipos_boletim (sala_id, slug, nome, descricao, periodicidade, exige_revisao, ordem)
SELECT s.id, 'integrado-arsesp', 'Boletim Integrado SP Águas/ARSESP',
       'Boletim integrado SP Águas / ARSESP.', 'mensal', false, 45
FROM salas s WHERE s.slug = 'alfredo-pisani'
ON CONFLICT (sala_id, slug) DO NOTHING;

UPDATE tipos_boletim t SET nome = v.novo, descricao = coalesce(v.descricao, t.descricao)
FROM salas s,
     (VALUES
        ('mensal',    'Boletim Mensal',    'Boletim Mensal de Chuvas',          NULL),
        ('spi',       'Índice SPI',        'Boletim Mensal SPI',                'Índice de Precipitação Padronizada (SPI).'),
        ('integrado', 'Boletim Integrado', 'Boletim Integrado SP Águas/CETESB', 'Boletim integrado SP Águas / CETESB.')
     ) AS v (slug, antigo, novo, descricao)
WHERE s.id = t.sala_id AND s.slug = 'alfredo-pisani' AND t.slug = v.slug AND t.nome = v.antigo;

UPDATE salas
   SET nome = 'Sala CETESB — Boletim Integrado',
       descricao = 'Boletim integrado SP Águas/CETESB da UGRHI 6 (chuva, vazão e qualidade).',
       cor = coalesce(cor, '#2E7D32')
 WHERE slug = 'cetesb' AND nome = 'Sala CETESB / SP Águas';

INSERT INTO schema_migrations (versao) VALUES ('0004_ajustes_acesso_php') ON CONFLICT DO NOTHING;

COMMIT;
