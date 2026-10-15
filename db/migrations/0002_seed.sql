-- =============================================================================
-- Dados iniciais (migração 0002): salas, módulos, permissões, perfis,
-- tipos de boletim e categorias de documento.
-- Equivale a spaguas-ss-ap/acesso/database/seed.sql + migrações de 2026-09-26.
-- ON CONFLICT DO NOTHING: rodar de novo não duplica nem sobrescreve ajustes.
-- Nenhum usuário é criado aqui.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Salas de Situação
-- -----------------------------------------------------------------------------
INSERT INTO salas (slug, nome, sigla, descricao, cor, ordem) VALUES
('alfredo-pisani', 'Sala de Situação Alfredo Pisani', 'Estadual',
    'Sala de Situação Estadual — SP-Águas.', '#0B4F8A', 10),
('pcj', 'Sala de Situação PCJ', 'PCJ',
    'Bacias dos rios Piracicaba, Capivari e Jundiaí (UGRHI 5).', '#00A859', 20),
('ribeira', 'Sala de Situação Vale do Ribeira', 'Ribeira',
    'Bacia do Ribeira de Iguape e Litoral Sul (UGRHI 11).', '#0D7EA4', 30),
('vale-paraiba', 'Sala de Situação Vale do Paraíba', 'Paraíba',
    'Bacia do rio Paraíba do Sul (UGRHI 2).', '#1C4E9C', 40),
-- Criada pelo painel na referência (não estava no seed.sql).
('cetesb', 'Sala CETESB / SP Águas', 'CETESB',
    'Boletim Integrado SP Águas/CETESB — UGRHI 6 (Alto Tietê).', NULL, 50)
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Módulos e habilitação por sala
-- -----------------------------------------------------------------------------
INSERT INTO modulos (slug, nome, icone, ordem) VALUES
('boletins',   'Boletins',   'bi-journal-text', 10),
('graficos',   'Gráficos',   'bi-graph-up',     20),
('documentos', 'Documentos', 'bi-folder2-open', 30),
('previsoes',  'Previsões',  'bi-cloud-sun',    40)
ON CONFLICT (slug) DO NOTHING;

-- Boletins, gráficos e documentos em todas as salas.
INSERT INTO sala_modulos (sala_id, modulo_id)
SELECT s.id, m.id FROM salas s CROSS JOIN modulos m
WHERE m.slug IN ('boletins', 'graficos', 'documentos')
ON CONFLICT DO NOTHING;

-- Previsões: inicialmente só na Sala Estadual.
INSERT INTO sala_modulos (sala_id, modulo_id)
SELECT s.id, m.id FROM salas s CROSS JOIN modulos m
WHERE s.slug = 'alfredo-pisani' AND m.slug = 'previsoes'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
INSERT INTO permissoes (slug, modulo, descricao, ordem) VALUES
('visualizar_dashboard',  'painel',     'Ver o painel da sala',                                   10),

('visualizar_boletins',   'boletins',   'Ver a lista e o conteúdo dos boletins',                  20),
('criar_boletim',         'boletins',   'Cadastrar boletins',                                     21),
('editar_boletim',        'boletins',   'Editar boletins em rascunho ou em revisão',              22),
('excluir_boletim',       'boletins',   'Excluir boletins (exclusão lógica)',                     23),
('aprovar_boletim',       'boletins',   'Aprovar boletins enviados para revisão',                 24),
('publicar_boletim',      'boletins',   'Publicar e despublicar boletins no site',                25),
('gerar_pdf',             'boletins',   'Gerar o PDF do boletim',                                 26),

('visualizar_graficos',   'graficos',   'Ver gráficos',                                           30),
('criar_graficos',        'graficos',   'Cadastrar gráficos',                                     31),
('editar_graficos',       'graficos',   'Editar e excluir gráficos',                              32),
('publicar_graficos',     'graficos',   'Publicar gráficos no site',                              33),

('visualizar_documentos', 'documentos', 'Ver e baixar documentos',                                40),
('enviar_documentos',     'documentos', 'Enviar e editar documentos',                             41),
('excluir_documentos',    'documentos', 'Excluir documentos (exclusão lógica)',                   42),

('visualizar_previsoes',  'previsoes',  'Acessar as páginas de previsão',                         50),

('visualizar_logs',       'sistema',    'Ver auditoria (o gestor vê só a da própria sala)',       60),
('gerenciar_usuarios',    'sistema',    'Cadastrar, editar, desativar usuários e vincular salas', 61),
('gerenciar_salas',       'sistema',    'Cadastrar, editar e desativar salas e tipos de boletim', 62),
('gerenciar_permissoes',  'sistema',    'Editar perfis e a matriz de permissões',                 63)
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Perfis
-- -----------------------------------------------------------------------------
INSERT INTO perfis (slug, nome, descricao, escopo, sistema) VALUES
('admin_sistema', 'Administrador do Sistema',
    'Acesso completo a todas as salas e funcionalidades.', 'global', true),
('gestor_sala', 'Gestor da Sala',
    'Administra os conteúdos da sala: boletins, gráficos, documentos e publicação.', 'sala', true),
('revisor', 'Revisor',
    'Revisa, aprova e publica boletins da sala.', 'sala', true),
('operador', 'Operador',
    'Cria e edita boletins, gráficos e documentos da sala.', 'sala', true),
('consulta', 'Consulta',
    'Somente leitura dos conteúdos da sala.', 'sala', true)
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Matriz inicial perfil × permissão (editável depois pelo painel)
-- -----------------------------------------------------------------------------
INSERT INTO perfil_permissoes (perfil_id, permissao_id)
SELECT p.id, x.id
FROM perfis p
JOIN (VALUES
    ('admin_sistema', NULL),  -- NULL = todas as permissões
    ('gestor_sala', ARRAY[
        'visualizar_dashboard',
        'visualizar_boletins', 'criar_boletim', 'editar_boletim', 'excluir_boletim',
        'aprovar_boletim', 'publicar_boletim', 'gerar_pdf',
        'visualizar_graficos', 'criar_graficos', 'editar_graficos', 'publicar_graficos',
        'visualizar_documentos', 'enviar_documentos', 'excluir_documentos',
        'visualizar_previsoes', 'visualizar_logs']),
    ('revisor', ARRAY[
        'visualizar_dashboard',
        'visualizar_boletins', 'editar_boletim', 'aprovar_boletim', 'publicar_boletim', 'gerar_pdf',
        'visualizar_graficos', 'publicar_graficos',
        'visualizar_documentos',
        'visualizar_previsoes']),
    ('operador', ARRAY[
        'visualizar_dashboard',
        'visualizar_boletins', 'criar_boletim', 'editar_boletim', 'gerar_pdf',
        'visualizar_graficos', 'criar_graficos', 'editar_graficos',
        'visualizar_documentos', 'enviar_documentos',
        'visualizar_previsoes']),
    ('consulta', ARRAY[
        'visualizar_dashboard', 'visualizar_boletins', 'visualizar_graficos',
        'visualizar_documentos', 'visualizar_previsoes'])
) AS m (perfil, permissoes) ON m.perfil = p.slug
JOIN permissoes x ON m.permissoes IS NULL OR x.slug = ANY (m.permissoes)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Tipos de boletim (todos por upload do PDF pronto)
-- Os quatro primeiros substituem as tabelas do site antigo:
--   boletins → diario · boletinsmensais → mensal · up_boletim_hidro → spi
--   boletinsintegrados → integrado
-- -----------------------------------------------------------------------------
INSERT INTO tipos_boletim (sala_id, slug, nome, descricao, periodicidade, exige_revisao, ordem)
SELECT s.id, v.slug, v.nome, v.descricao, v.periodicidade, v.exige_revisao, v.ordem
FROM salas s
JOIN (VALUES
    ('alfredo-pisani', 'diario', 'Boletim Diário',
        'Situação diária dos mananciais e da precipitação.', 'diario', false, 10),
    ('alfredo-pisani', 'mensal', 'Boletim Mensal',
        'Consolidado mensal de chuvas.', 'mensal', false, 20),
    ('alfredo-pisani', 'spi', 'Índice SPI',
        'Índice de Precipitação Padronizada.', 'mensal', false, 30),
    ('alfredo-pisani', 'integrado', 'Boletim Integrado',
        'Boletim integrado SP-Águas / CETESB.', 'mensal', false, 40),
    ('alfredo-pisani', 'integrado-ugrhi6', 'Boletim Integrado UGRHI 6 — Alto Tietê',
        'Qualidade, quantidade e precipitação da UGRHI 6.', 'mensal', true, 50),
    ('alfredo-pisani', 'sumario-tiete-pinheiros', 'Sumário Executivo de Cheias — Alto Tietê/Pinheiros',
        'Sumário executivo de eventos de cheia.', 'eventual', true, 60),
    ('alfredo-pisani', 'sumario-ribeira', 'Sumário Executivo de Cheias — Vale do Ribeira de Iguape',
        'Sumário executivo de cheias do Vale do Ribeira.', 'eventual', true, 65),
    ('pcj', 'boletim-diario', 'Boletim Diário PCJ',
        'Chuva, nível, vazão e cotas de alerta nas Bacias PCJ.', 'diario', true, 10),
    ('ribeira', 'sumario-cheias', 'Sumário Executivo — Vale do Ribeira de Iguape',
        'Sumário executivo de cheias.', 'eventual', true, 10),
    ('vale-paraiba', 'boletim-diario', 'Boletim Diário Vale do Paraíba',
        'Aguardando o modelo oficial do boletim.', 'diario', true, 10),
    ('cetesb', 'integrado-diario', 'Boletim Integrado Diário — UGRHI 6',
        'Boletim integrado SP Águas/CETESB (chuva, vazão e qualidade) — edição diária.', 'diario', true, 10),
    ('cetesb', 'integrado-mensal', 'Boletim Integrado Mensal — UGRHI 6',
        'Boletim integrado SP Águas/CETESB (chuva, vazão e qualidade) — edição mensal.', 'mensal', true, 20)
) AS v (sala, slug, nome, descricao, periodicidade, exige_revisao, ordem) ON v.sala = s.slug
ON CONFLICT (sala_id, slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Categorias de documento comuns a todas as salas (sala_id NULL)
-- -----------------------------------------------------------------------------
INSERT INTO documento_categorias (sala_id, slug, nome, ordem) VALUES
(NULL, 'notas-tecnicas', 'Notas técnicas', 10),
(NULL, 'relatorios',     'Relatórios',     20),
(NULL, 'apresentacoes',  'Apresentações',  30),
(NULL, 'atas',           'Atas',           40),
(NULL, 'outros',         'Outros',         90)
ON CONFLICT (sala_id, slug) DO NOTHING;

INSERT INTO schema_migrations (versao) VALUES ('0002_seed') ON CONFLICT DO NOTHING;

COMMIT;
