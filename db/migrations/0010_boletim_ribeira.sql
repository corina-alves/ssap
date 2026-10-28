-- =============================================================================
-- Migração 0010: leituras das 07h do Boletim Executivo Público — Vale do Ribeira
-- (/boletins/automatico/vale-do-ribeira).
-- Uma linha por fonte, ponto e dia. O SIBH guarda o próprio histórico: aqui fica
-- a reserva da referência das 07h, para o boletim comparar "07h × agora" mesmo
-- quando o SIBH não devolver a janela das 07h. A coleta em segundo plano grava
-- e corrige a linha enquanto o SIBH mudar o valor (dado incompleto não congela).
-- Não toca no Sumário Executivo tradicional. Pode rodar de novo.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS boletim_ribeira_leituras (
    fonte      varchar(10)   NOT NULL DEFAULT 'sibh' CHECK (fonte IN ('sibh')),
    ponto      varchar(20)   NOT NULL,  -- station_prefix_id do SIBH
    dia        date          NOT NULL,  -- dia da leitura das 07h, horário de Brasília
    nivel      numeric(9, 3),           -- m
    vazao      numeric(10, 3),          -- m³/s (read_value), quando o posto mede
    lido_em    timestamptz,             -- instante da leitura na fonte
    gravado_em timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (fonte, ponto, dia)
);

CREATE INDEX IF NOT EXISTS boletim_ribeira_leituras_dia ON boletim_ribeira_leituras (dia);

INSERT INTO schema_migrations (versao) VALUES ('0010_boletim_ribeira') ON CONFLICT DO NOTHING;

COMMIT;
