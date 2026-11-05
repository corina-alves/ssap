-- =============================================================================
-- Migração 0014: Boletim Mensal da Sala (/acesso/boletim_mensal).
-- O boletim é montado na hora com os dados das integrações (SABESP, ANA, SSD,
-- SIBH, Protocolo de Escassez); aqui fica só o que é escrito ou anexado pela
-- equipe em cada mês: textos e imagens (as imagens ficam em `arquivos`, aqui
-- só o id). Um registro por sala e mês. Pode rodar de novo.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS boletim_mensal (
    sala_id        integer     NOT NULL REFERENCES salas (id),
    mes            date        NOT NULL CHECK (extract(day FROM mes) = 1), -- 1º dia do mês dos dados
    conteudo       jsonb       NOT NULL DEFAULT '{"textos": {}, "imagens": {}}'::jsonb,
    atualizado_em  timestamptz NOT NULL DEFAULT now(),
    atualizado_por integer     REFERENCES usuarios (id) ON DELETE SET NULL,
    PRIMARY KEY (sala_id, mes)
);

INSERT INTO schema_migrations (versao) VALUES ('0014_boletim_mensal') ON CONFLICT DO NOTHING;

COMMIT;
