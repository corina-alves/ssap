-- =============================================================================
-- Migração 0005: valores de configuração editados pela área restrita.
-- No PHP ficavam em arquivos JSON dentro do projeto (ex.: médias históricas do
-- Boletim PCJ em boletim_pcj/config/medias.json); no banco, sobrevivem a uma
-- nova implantação e entram no backup.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS configuracoes (
    chave          varchar(80)  PRIMARY KEY CHECK (chave ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
    valor          jsonb        NOT NULL,
    valor_anterior jsonb,        -- versão imediatamente anterior, para desfazer um engano
    atualizado_em  timestamptz  NOT NULL DEFAULT now(),
    atualizado_por integer      REFERENCES usuarios (id) ON DELETE SET NULL
);

INSERT INTO schema_migrations (versao) VALUES ('0005_configuracoes') ON CONFLICT DO NOTHING;

COMMIT;
