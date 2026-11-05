-- =============================================================================
-- Migração 0016: Painel de Climatologia — chuva observada pela rede telemétrica
-- do SIBH (API v2) e médias climatológicas por posto e por município.
--
-- A API v2 não tem série longa (a rede telemétrica começa em ~2016 no CEMADEN e
-- em 2025 na maioria das outras redes), então a média climatológica continua
-- vindo do acervo histórico (0012). Da v2 vem a chuva observada: um total por
-- posto e dia de Brasília, consultado uma vez e guardado aqui; o painel nunca
-- consulta o SIBH. Só acrescenta; pode rodar de novo.
-- =============================================================================

-- Município do posto (código IBGE, do cadastro v2 do SIBH).
ALTER TABLE clima_postos ADD COLUMN IF NOT EXISTS cod_ibge integer;
CREATE INDEX IF NOT EXISTS clima_postos_ibge ON clima_postos (cod_ibge);

-- Chuva de um posto telemétrico num dia de Brasília (00h–24h), como o SIBH soma
-- os registros do dia. A completude do dia é decidida no cálculo, com o número de
-- registros e o primeiro e o último horário. O total do mês de cada posto vai para
-- clima_chuva_mes com fonte = 'telemetria' (dia incompleto = NULL).
CREATE TABLE IF NOT EXISTS clima_telemetria_dia (
    posto_id   integer      NOT NULL REFERENCES clima_postos (id),
    dia        date         NOT NULL,
    chuva      numeric(6, 1) NOT NULL,              -- soma dos registros do dia (mm)
    registros  smallint     NOT NULL,               -- registros somados (qtd)
    intervalo  smallint,                            -- intervalo de transmissão do cadastro (min)
    primeiro   timestamptz,                         -- horário do primeiro registro do dia
    ultimo     timestamptz,                         -- horário do último registro do dia
    maximo     numeric(6, 1),                       -- maior registro do dia (mm)
    gravado_em timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (posto_id, dia)
);
CREATE INDEX IF NOT EXISTS clima_telemetria_dia_dia ON clima_telemetria_dia (dia);

-- Dias já consultados no SIBH (para não consultar de novo e para saber o que falta).
CREATE TABLE IF NOT EXISTS clima_telemetria_coleta (
    dia           date         PRIMARY KEY,
    postos        integer      NOT NULL,            -- postos com registro no dia
    segundos      numeric(6, 1),                    -- tempo de resposta do SIBH
    consultado_em timestamptz  NOT NULL DEFAULT now()
);

-- A série regional passa a ter a fonte: acervo (pluviômetros convencionais) ou telemetria.
ALTER TABLE clima_serie_ugrhi ADD COLUMN IF NOT EXISTS fonte varchar(12) NOT NULL DEFAULT 'acervo';
ALTER TABLE clima_serie_ugrhi DROP CONSTRAINT IF EXISTS clima_serie_ugrhi_fonte_check;
ALTER TABLE clima_serie_ugrhi ADD CONSTRAINT clima_serie_ugrhi_fonte_check CHECK (fonte IN ('acervo', 'telemetria'));
ALTER TABLE clima_serie_ugrhi DROP CONSTRAINT IF EXISTS clima_serie_ugrhi_pkey;
ALTER TABLE clima_serie_ugrhi ADD PRIMARY KEY (ugrhi, ano, mes, criterio, metodo, fonte);

-- Médias climatológicas do acervo por posto e por município (mes = 0: anual).
-- Município: a série é a média, mês a mês, dos postos do município com o mês válido.
CREATE TABLE IF NOT EXISTS clima_normais_local (
    escala       varchar(10)  NOT NULL CHECK (escala IN ('posto', 'municipio')),
    codigo       integer      NOT NULL,             -- id do posto ou código IBGE do município
    periodo_ini  smallint     NOT NULL,
    periodo_fim  smallint     NOT NULL,
    mes          smallint     NOT NULL CHECK (mes BETWEEN 0 AND 12),
    criterio     varchar(8)   NOT NULL CHECK (criterio IN ('padrao', 'estrito')),
    tipo         varchar(16)  NOT NULL CHECK (tipo IN ('normal', 'media_historica', 'insuficiente')),
    media        numeric(7, 1),
    anos_validos smallint     NOT NULL,
    anos         smallint[]   NOT NULL,
    postos       smallint,                          -- município: postos que entraram em algum ano do período
    calculado_em timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (escala, codigo, periodo_ini, periodo_fim, mes, criterio)
);
