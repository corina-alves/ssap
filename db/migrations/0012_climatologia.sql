-- =============================================================================
-- Migração 0012: Painel de Climatologia por UGRHI — dados históricos de chuva.
--
-- A chuva diária vem do acervo histórico do SIBH (API v1, historical_measurements),
-- importada uma vez e atualizada só no que mudar (scripts/clima-importar.ts). Os
-- cálculos (série regional de cada UGRHI e médias climatológicas) ficam prontos
-- aqui (scripts/clima-calcular.ts): o painel só lê estas tabelas, nunca o SIBH.
-- Falta de leitura é NULL, nunca zero. Pode rodar de novo.
-- =============================================================================

BEGIN;

-- Postos pluviométricos com série no acervo. A UGRHI vale pelo polígono oficial
-- (src/conteudo/ugrhi.json); a do cadastro do SIBH fica ao lado, para conferência.
CREATE TABLE IF NOT EXISTS clima_postos (
    id              integer          PRIMARY KEY,  -- station_prefix id do SIBH (o mesmo nas APIs v1 e v2)
    prefixo         varchar(40)      NOT NULL,
    nome            varchar(200),
    municipio       varchar(120),
    dono            varchar(60),
    ugrhi           smallint,                      -- pelo polígono oficial; NULL = fora de SP
    ugrhi_cadastro  smallint,                      -- ugrhi_cod do cadastro do SIBH
    lat             double precision NOT NULL,
    lon             double precision NOT NULL,
    inicio_operacao date,
    fim_operacao    date,
    situacao        varchar(20),
    meses_acervo    integer,                       -- meses no acervo na última importação deste posto
    importado_em    timestamptz,                   -- última importação completa do acervo deste posto
    atualizado_em   timestamptz      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clima_postos_ugrhi ON clima_postos (ugrhi);

-- Chuva diária de um posto num mês, como a fonte manda: um valor por dia do mês
-- (NULL = sem leitura). Os indicadores de falta saem do vetor na importação; a
-- validade do mês (critérios padrão e estrito) é gravada pelo cálculo.
CREATE TABLE IF NOT EXISTS clima_chuva_mes (
    posto_id       integer     NOT NULL REFERENCES clima_postos (id),
    ano            smallint    NOT NULL,
    mes            smallint    NOT NULL CHECK (mes BETWEEN 1 AND 12),
    fonte          varchar(12) NOT NULL DEFAULT 'acervo' CHECK (fonte IN ('acervo', 'telemetria')),
    dias           real[]      NOT NULL,
    total          numeric(7, 1),                  -- soma dos dias com leitura (mm)
    dias_faltando  smallint    NOT NULL,
    maior_falta    smallint    NOT NULL,           -- maior sequência de dias sem leitura
    falta_no_fim   boolean     NOT NULL,           -- termina sem leitura: a chuva pode ter ido para o mês seguinte
    conflito       boolean     NOT NULL DEFAULT false, -- a fonte trouxe o mesmo mês mais de uma vez, com valores diferentes
    valido_padrao  boolean,                        -- NULL até o cálculo
    valido_estrito boolean,
    gravado_em     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (posto_id, ano, mes, fonte)
);
CREATE INDEX IF NOT EXISTS clima_chuva_mes_ano ON clima_chuva_mes (ano, mes);

-- Série regional: chuva média espacial da UGRHI em cada mês e ano.
CREATE TABLE IF NOT EXISTS clima_serie_ugrhi (
    ugrhi        smallint     NOT NULL,
    ano          smallint     NOT NULL,
    mes          smallint     NOT NULL CHECK (mes BETWEEN 1 AND 12),
    criterio     varchar(8)   NOT NULL CHECK (criterio IN ('padrao', 'estrito')),
    metodo       varchar(10)  NOT NULL CHECK (metodo IN ('thiessen', 'aritmetica')),
    chuva        numeric(7, 1),                    -- NULL = sem posto válido
    dias         real[],                           -- chuva média de cada dia (mesmos pesos do mês)
    postos       smallint     NOT NULL,            -- postos com o mês válido usados no cálculo
    cobertura    numeric(5, 1) NOT NULL,           -- % da área da UGRHI perto de um posto válido
    valido       boolean      NOT NULL,            -- cobertura suficiente para entrar na climatologia
    pesos        jsonb,                            -- {posto_id: peso} (Thiessen) — rastreabilidade
    calculado_em timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (ugrhi, ano, mes, criterio, metodo)
);

-- Médias climatológicas por UGRHI e mês (mes = 0: anual), já calculadas.
CREATE TABLE IF NOT EXISTS clima_normais (
    ugrhi        smallint     NOT NULL,
    periodo_ini  smallint     NOT NULL,
    periodo_fim  smallint     NOT NULL,
    mes          smallint     NOT NULL CHECK (mes BETWEEN 0 AND 12),
    criterio     varchar(8)   NOT NULL CHECK (criterio IN ('padrao', 'estrito')),
    metodo       varchar(10)  NOT NULL CHECK (metodo IN ('thiessen', 'aritmetica')),
    tipo         varchar(16)  NOT NULL CHECK (tipo IN ('normal', 'media_historica', 'insuficiente')),
    media        numeric(7, 1),
    anos_validos smallint     NOT NULL,
    anos         smallint[]   NOT NULL,            -- anos usados
    mediana      numeric(7, 1),
    desvio       numeric(7, 1),
    minimo       numeric(7, 1),
    ano_minimo   smallint,
    maximo       numeric(7, 1),
    ano_maximo   smallint,
    calculado_em timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (ugrhi, periodo_ini, periodo_fim, mes, criterio, metodo)
);

-- Histórico das importações e dos cálculos (duração, consultas, erros).
CREATE TABLE IF NOT EXISTS clima_execucoes (
    id           bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo         varchar(12)  NOT NULL CHECK (tipo IN ('postos', 'acervo', 'calculo', 'telemetria')),
    situacao     varchar(12)  NOT NULL DEFAULT 'em_andamento'
                 CHECK (situacao IN ('em_andamento', 'concluida', 'interrompida', 'falhou')),
    iniciado_em  timestamptz  NOT NULL DEFAULT now(),
    terminado_em timestamptz,
    consultas    integer      NOT NULL DEFAULT 0,
    registros    integer      NOT NULL DEFAULT 0,
    erros        integer      NOT NULL DEFAULT 0,
    detalhe      jsonb
);

INSERT INTO schema_migrations (versao) VALUES ('0012_climatologia') ON CONFLICT DO NOTHING;

COMMIT;
