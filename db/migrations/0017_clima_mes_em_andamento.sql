-- Painel de Climatologia: mês em andamento da telemetria. O mês corrente é
-- calculado com os dias já encerrados (do dia 1 até ate_dia) e comparado com a
-- média do mês inteiro, indicado na tela. NULL = mês inteiro. Só acrescenta.
ALTER TABLE clima_chuva_mes ADD COLUMN IF NOT EXISTS ate_dia smallint;
ALTER TABLE clima_serie_ugrhi ADD COLUMN IF NOT EXISTS ate_dia smallint;
