-- =============================================================================
-- Migração 0009: histórico das leituras das 07h do Sumário Executivo Automático
-- Alto Tietê / Pinheiros (/boletins/automatico/tiete-pinheiros).
-- Uma linha por fonte, ponto e dia: a página compara as 07h de ontem e de hoje.
-- A planilha da EMAE só traz o dia corrente, então sem este registro não haveria
-- "ontem"; o SIBH guarda o próprio histórico, e aqui fica como reserva.
-- Não toca no sumário tradicional. Pode rodar de novo.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS sumario_tp_leituras (
    fonte      varchar(10)   NOT NULL CHECK (fonte IN ('sibh', 'emae')),
    ponto      varchar(60)   NOT NULL,  -- station_prefix_id (SIBH) ou nome da estrutura (EMAE)
    dia        date          NOT NULL,  -- dia da leitura das 07h, horário de Brasília
    nivel      numeric(9, 3),           -- m (EMAE já convertida para o referencial IGG)
    vazao      numeric(10, 3),          -- m³/s
    lido_em    timestamptz,             -- instante da leitura na fonte
    gravado_em timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (fonte, ponto, dia)
);

CREATE INDEX IF NOT EXISTS sumario_tp_leituras_dia ON sumario_tp_leituras (dia);

INSERT INTO schema_migrations (versao) VALUES ('0009_sumario_automatico_tp') ON CONFLICT DO NOTHING;

COMMIT;
