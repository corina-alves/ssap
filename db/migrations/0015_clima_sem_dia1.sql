-- Painel de Climatologia: meses do acervo do SIBH que vêm com um valor a menos
-- que os dias do mês. Pela comparação com os postos vizinhos, os valores são os
-- dias 2 a n: o dia 1 não está no acervo e a chuva dele não foi acumulada em
-- outra leitura, então o mês não entra no cálculo (nenhum dos critérios).
ALTER TABLE clima_chuva_mes ADD COLUMN IF NOT EXISTS sem_dia1 boolean NOT NULL DEFAULT false;
