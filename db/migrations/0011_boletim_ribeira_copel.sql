-- =============================================================================
-- Migração 0011: volume útil do Reservatório Capivari (Copel) no Boletim
-- Executivo Público — Vale do Ribeira.
-- A API da Copel (mhbweb, ponto 32 "Res Capivari") só devolve o dia corrente:
-- a leitura das 07h fica guardada aqui (fonte 'copel'), para o boletim mostrar
-- o registro das 07h de ontem antes das 07h de hoje e a última medição válida
-- quando a Copel não responder. O nível vai em "nivel" (m) e o volume útil em
-- "volume" (%). Não toca no Sumário Executivo tradicional. Pode rodar de novo.
-- =============================================================================

BEGIN;

ALTER TABLE boletim_ribeira_leituras DROP CONSTRAINT IF EXISTS boletim_ribeira_leituras_fonte_check;
ALTER TABLE boletim_ribeira_leituras
    ADD CONSTRAINT boletim_ribeira_leituras_fonte_check CHECK (fonte IN ('sibh', 'copel'));

ALTER TABLE boletim_ribeira_leituras ADD COLUMN IF NOT EXISTS volume numeric(6, 2); -- % do volume útil (Copel)

INSERT INTO schema_migrations (versao) VALUES ('0011_boletim_ribeira_copel') ON CONFLICT DO NOTHING;

COMMIT;
