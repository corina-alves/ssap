-- =============================================================================
-- Sala de Situação Alfredo Pisani — schema PostgreSQL (migração 0001)
-- PostgreSQL 15+ (usa UNIQUE NULLS NOT DISTINCT) · testado no 18
--
-- Base modelada a partir de spaguas-ss-ap/acesso/database/schema.sql (MySQL),
-- com os ajustes:
--   * uma tabela `boletins` para todos os tipos (substitui boletins,
--     boletinsmensais, boletinsintegrados e up_boletim_hidro do site antigo);
--   * sessões no banco (`sessoes`), para encerrar sessões ao trocar a senha;
--   * auditoria somente-inserção garantida por trigger;
--   * sem boletim_campos / boletim_campo_historico / estacoes / estacao_cotas:
--     os geradores automáticos saíram da referência e essas tabelas geravam
--     muitas linhas por operação. Listas fixas (estações, atalhos, links)
--     ficam em arquivos de configuração do projeto.
--
-- Os arquivos (PDFs, documentos) ficam no disco/Blob; o banco guarda só os
-- metadados. Sem o banco, os arquivos continuam recuperáveis.
--
-- Convenções:
--   *_em         timestamptz
--   excluido_em  exclusão lógica (NULL = ativo)
--   status       text + CHECK (mais fácil de evoluir que tipos ENUM)
-- Nenhum usuário é criado por SQL: o administrador inicial vem de um script.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    versao      text        PRIMARY KEY,
    aplicado_em timestamptz NOT NULL DEFAULT now()
);

-- Mantém atualizado_em sem depender da aplicação.
CREATE OR REPLACE FUNCTION fn_atualizado_em() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. Salas de Situação e módulos
-- -----------------------------------------------------------------------------

CREATE TABLE salas (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug          varchar(60)  NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    nome          varchar(150) NOT NULL,
    sigla         varchar(30),
    descricao     varchar(500),
    cor           char(7)      CHECK (cor ~ '^#[0-9A-Fa-f]{6}$'),
    logo          varchar(255),
    status        text         NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'inativa')),
    ordem         smallint     NOT NULL DEFAULT 0,
    criado_em     timestamptz  NOT NULL DEFAULT now(),
    atualizado_em timestamptz,
    excluido_em   timestamptz
);
CREATE INDEX idx_salas_status ON salas (status, ordem);
CREATE TRIGGER trg_salas_atualizado BEFORE UPDATE ON salas
    FOR EACH ROW EXECUTE FUNCTION fn_atualizado_em();

CREATE TABLE modulos (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug  varchar(40) NOT NULL UNIQUE,
    nome  varchar(80) NOT NULL,
    icone varchar(40),
    ordem smallint    NOT NULL DEFAULT 0
);

CREATE TABLE sala_modulos (
    sala_id   integer NOT NULL REFERENCES salas (id)   ON DELETE CASCADE,
    modulo_id integer NOT NULL REFERENCES modulos (id) ON DELETE CASCADE,
    ativo     boolean NOT NULL DEFAULT true,
    PRIMARY KEY (sala_id, modulo_id)
);
CREATE INDEX idx_sm_modulo ON sala_modulos (modulo_id);

-- -----------------------------------------------------------------------------
-- 2. Usuários, perfis e permissões (RBAC por sala)
-- -----------------------------------------------------------------------------

CREATE TABLE usuarios (
    id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome              varchar(150) NOT NULL,
    email             varchar(190) NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+$'),
    login             varchar(60)  NOT NULL CHECK (login ~ '^[A-Za-z0-9._-]+$'),
    senha_hash        varchar(255) NOT NULL,  -- argon2id/bcrypt; nunca MD5/SHA1/texto
    status            text         NOT NULL DEFAULT 'ativo'
                                   CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
    deve_trocar_senha boolean      NOT NULL DEFAULT false,
    tentativas_falhas smallint     NOT NULL DEFAULT 0 CHECK (tentativas_falhas >= 0),
    bloqueado_ate     timestamptz,             -- bloqueio temporário por tentativas inválidas
    ultimo_acesso     timestamptz,
    senha_alterada_em timestamptz,
    criado_em         timestamptz  NOT NULL DEFAULT now(),
    atualizado_em     timestamptz,
    criado_por        integer REFERENCES usuarios (id) ON DELETE SET NULL,
    atualizado_por    integer REFERENCES usuarios (id) ON DELETE SET NULL,
    excluido_em       timestamptz,
    excluido_por      integer REFERENCES usuarios (id) ON DELETE SET NULL
);
-- Únicos sem diferenciar maiúsculas; um usuário excluído libera e-mail e login.
CREATE UNIQUE INDEX uq_usuarios_email ON usuarios (lower(email)) WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX uq_usuarios_login ON usuarios (lower(login)) WHERE excluido_em IS NULL;
CREATE INDEX idx_usuarios_status ON usuarios (status);
CREATE TRIGGER trg_usuarios_atualizado BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_atualizado_em();

-- escopo 'global': vale em todas as salas (atribuído em usuario_perfis).
-- escopo 'sala'  : vale só na sala onde foi atribuído (usuario_salas).
CREATE TABLE perfis (
    id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug      varchar(40)  NOT NULL UNIQUE,
    nome      varchar(80)  NOT NULL,
    descricao varchar(255),
    escopo    text         NOT NULL DEFAULT 'sala' CHECK (escopo IN ('global', 'sala')),
    sistema   boolean      NOT NULL DEFAULT false,  -- perfil de fábrica, não pode ser excluído
    criado_em timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (id, escopo)  -- alvo das FKs compostas que garantem o escopo certo
);

CREATE TABLE permissoes (
    id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug      varchar(60)  NOT NULL UNIQUE,
    modulo    varchar(40)  NOT NULL,  -- agrupamento na tela de permissões
    descricao varchar(255),
    ordem     smallint     NOT NULL DEFAULT 0
);

CREATE TABLE perfil_permissoes (
    perfil_id    integer NOT NULL REFERENCES perfis (id)     ON DELETE CASCADE,
    permissao_id integer NOT NULL REFERENCES permissoes (id) ON DELETE CASCADE,
    PRIMARY KEY (perfil_id, permissao_id)
);
CREATE INDEX idx_pp_permissao ON perfil_permissoes (permissao_id);

-- Perfis globais do usuário: a FK composta só aceita perfis com escopo 'global'.
CREATE TABLE usuario_perfis (
    usuario_id    integer     NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    perfil_id     integer     NOT NULL,
    perfil_escopo text        NOT NULL DEFAULT 'global' CHECK (perfil_escopo = 'global'),
    criado_em     timestamptz NOT NULL DEFAULT now(),
    criado_por    integer     REFERENCES usuarios (id) ON DELETE SET NULL,
    PRIMARY KEY (usuario_id, perfil_id),
    FOREIGN KEY (perfil_id, perfil_escopo) REFERENCES perfis (id, escopo) ON DELETE RESTRICT
);
CREATE INDEX idx_up_perfil ON usuario_perfis (perfil_id);

-- Acesso a cada sala com o perfil que o usuário tem NAQUELA sala.
-- Sem linha aqui (e sem perfil global) = sem acesso.
CREATE TABLE usuario_salas (
    usuario_id    integer     NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    sala_id       integer     NOT NULL REFERENCES salas (id)    ON DELETE CASCADE,
    perfil_id     integer     NOT NULL,
    perfil_escopo text        NOT NULL DEFAULT 'sala' CHECK (perfil_escopo = 'sala'),
    criado_em     timestamptz NOT NULL DEFAULT now(),
    criado_por    integer     REFERENCES usuarios (id) ON DELETE SET NULL,
    PRIMARY KEY (usuario_id, sala_id),
    FOREIGN KEY (perfil_id, perfil_escopo) REFERENCES perfis (id, escopo) ON DELETE RESTRICT
);
CREATE INDEX idx_us_sala   ON usuario_salas (sala_id);
CREATE INDEX idx_us_perfil ON usuario_salas (perfil_id);

-- Sessões de login. O cookie leva um token aleatório; aqui fica só o SHA-256.
-- Trocar a senha, desativar ou excluir o usuário revoga as sessões dele.
CREATE TABLE sessoes (
    token_hash    char(64)    PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    usuario_id    integer     NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    criado_em     timestamptz NOT NULL DEFAULT now(),
    ultimo_uso_em timestamptz NOT NULL DEFAULT now(),
    expira_em     timestamptz NOT NULL,
    ip            inet,
    user_agent    varchar(255),
    revogada_em   timestamptz,
    motivo        varchar(40),  -- logout, senha_alterada, usuario_desativado, expirada...
    CHECK (expira_em > criado_em)
);
CREATE INDEX idx_sessoes_usuario ON sessoes (usuario_id) WHERE revogada_em IS NULL;
CREATE INDEX idx_sessoes_expira  ON sessoes (expira_em);

-- Tentativas de login (sucesso e falha): bloqueio por IP.
-- O bloqueio por conta fica em usuarios.bloqueado_ate.
CREATE TABLE login_tentativas (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    login     varchar(190) NOT NULL,
    ip        inet         NOT NULL,
    sucesso   boolean      NOT NULL DEFAULT false,
    criado_em timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_lt_login ON login_tentativas (lower(login), criado_em);
CREATE INDEX idx_lt_ip    ON login_tentativas (ip, criado_em);

-- Redefinição de senha: link de uso único; guarda só o SHA-256 do token.
CREATE TABLE senha_tokens (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id integer     NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    token_hash char(64)    NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    expira_em  timestamptz NOT NULL,
    usado_em   timestamptz,
    criado_por integer     REFERENCES usuarios (id) ON DELETE SET NULL,
    criado_em  timestamptz NOT NULL DEFAULT now(),
    CHECK (expira_em > criado_em)
);
CREATE INDEX idx_st_usuario ON senha_tokens (usuario_id) WHERE usado_em IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Arquivos (uploads, PDFs gerados, imagens) — metadados; conteúdo no storage
-- -----------------------------------------------------------------------------

CREATE TABLE arquivos (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sala_id       integer      REFERENCES salas (id) ON DELETE SET NULL,
    origem        text         NOT NULL DEFAULT 'upload'
                               CHECK (origem IN ('upload', 'pdf_gerado', 'imagem')),
    armazenamento text         NOT NULL DEFAULT 'local' CHECK (armazenamento IN ('local', 'blob')),
    nome_original varchar(255) NOT NULL,
    nome_interno  varchar(100) NOT NULL UNIQUE,  -- nome aleatório gerado pelo sistema
    caminho       varchar(255) NOT NULL,         -- relativo à raiz do storage, nunca absoluto
    mime          varchar(100) NOT NULL,         -- detectado pelo conteúdo, não pelo navegador
    tamanho       bigint       NOT NULL CHECK (tamanho >= 0),
    sha256        char(64)     NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    enviado_por   integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    criado_em     timestamptz  NOT NULL DEFAULT now(),
    excluido_em   timestamptz,
    excluido_por  integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    CHECK (caminho !~ '(^/|^[A-Za-z]:|\.\.)')  -- sem caminho absoluto nem ".."
);
CREATE INDEX idx_arquivos_sala ON arquivos (sala_id);
CREATE INDEX idx_arquivos_sha  ON arquivos (sha256);

-- -----------------------------------------------------------------------------
-- 4. Boletins — estrutura única para todas as salas e tipos
--    (diário, mensal, SPI, integrado, sumários de cheias...)
-- -----------------------------------------------------------------------------

CREATE TABLE tipos_boletim (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sala_id       integer      NOT NULL REFERENCES salas (id) ON DELETE RESTRICT,
    slug          varchar(60)  NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    nome          varchar(150) NOT NULL,
    descricao     varchar(500),
    periodicidade text         NOT NULL DEFAULT 'eventual'
                               CHECK (periodicidade IN ('diario', 'semanal', 'mensal', 'eventual')),
    exige_revisao boolean      NOT NULL DEFAULT true,   -- false = rascunho pode ir direto a publicado
    publico       boolean      NOT NULL DEFAULT true,   -- false = boletim interno, nunca vai ao site
    ativo         boolean      NOT NULL DEFAULT true,
    ordem         smallint     NOT NULL DEFAULT 0,
    criado_em     timestamptz  NOT NULL DEFAULT now(),
    atualizado_em timestamptz,
    UNIQUE (sala_id, slug),
    UNIQUE (id, sala_id)  -- alvo da FK composta em boletins
);
CREATE TRIGGER trg_tipos_boletim_atualizado BEFORE UPDATE ON tipos_boletim
    FOR EACH ROW EXECUTE FUNCTION fn_atualizado_em();

CREATE TABLE boletins (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sala_id         integer      NOT NULL REFERENCES salas (id) ON DELETE RESTRICT,
    tipo_id         integer      NOT NULL,
    titulo          varchar(255) NOT NULL,
    data_referencia date         NOT NULL,
    competencia     char(7)      CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- AAAA-MM (mensais)
    status          text         NOT NULL DEFAULT 'rascunho'
                                 CHECK (status IN ('rascunho', 'em_revisao', 'aprovado', 'publicado', 'arquivado')),
    versao_atual    integer      NOT NULL DEFAULT 0 CHECK (versao_atual >= 0),
    pdf_arquivo_id  bigint       REFERENCES arquivos (id) ON DELETE SET NULL,
    criado_por      integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    atualizado_por  integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    publicado_por   integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    criado_em       timestamptz  NOT NULL DEFAULT now(),
    atualizado_em   timestamptz,
    publicado_em    timestamptz,
    excluido_em     timestamptz,
    excluido_por    integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    -- o tipo precisa ser da mesma sala do boletim
    FOREIGN KEY (tipo_id, sala_id) REFERENCES tipos_boletim (id, sala_id) ON DELETE RESTRICT,
    -- publicado exige PDF e data de publicação
    CHECK (status <> 'publicado' OR (publicado_em IS NOT NULL AND pdf_arquivo_id IS NOT NULL))
);
CREATE INDEX idx_bol_sala_status ON boletins (sala_id, status, data_referencia DESC) WHERE excluido_em IS NULL;
CREATE INDEX idx_bol_tipo_data   ON boletins (tipo_id, data_referencia DESC)         WHERE excluido_em IS NULL;
CREATE INDEX idx_bol_publicado   ON boletins (publicado_em DESC) WHERE status = 'publicado' AND excluido_em IS NULL;
CREATE TRIGGER trg_boletins_atualizado BEFORE UPDATE ON boletins
    FOR EACH ROW EXECUTE FUNCTION fn_atualizado_em();

-- Fotografia do boletim a cada salvamento importante (troca de PDF, publicação).
CREATE TABLE boletim_versoes (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    boletim_id     bigint       NOT NULL REFERENCES boletins (id) ON DELETE CASCADE,
    versao         integer      NOT NULL CHECK (versao > 0),
    status         text         NOT NULL,
    dados          jsonb,        -- metadados do boletim no momento da versão
    pdf_arquivo_id bigint       REFERENCES arquivos (id) ON DELETE SET NULL,
    comentario     varchar(500),
    criado_por     integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    criado_em      timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (boletim_id, versao)
);

-- Cada mudança de status (rascunho → em_revisao → aprovado → publicado...).
CREATE TABLE boletim_status_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    boletim_id  bigint       NOT NULL REFERENCES boletins (id) ON DELETE CASCADE,
    status_de   text,
    status_para text         NOT NULL,
    usuario_id  integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    comentario  varchar(500),
    criado_em   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_bsl_boletim ON boletim_status_log (boletim_id, criado_em);

-- -----------------------------------------------------------------------------
-- 5. Documentos e gráficos
-- -----------------------------------------------------------------------------

CREATE TABLE documento_categorias (
    id      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sala_id integer      REFERENCES salas (id) ON DELETE CASCADE,  -- NULL = comum a todas as salas
    slug    varchar(60)  NOT NULL,
    nome    varchar(120) NOT NULL,
    ordem   smallint     NOT NULL DEFAULT 0,
    UNIQUE NULLS NOT DISTINCT (sala_id, slug)
);

CREATE TABLE documentos (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sala_id        integer      NOT NULL REFERENCES salas (id) ON DELETE RESTRICT,
    categoria_id   integer      REFERENCES documento_categorias (id) ON DELETE SET NULL,
    titulo         varchar(255) NOT NULL,
    descricao      text,
    arquivo_id     bigint       NOT NULL REFERENCES arquivos (id) ON DELETE RESTRICT,
    data_documento date,
    publico        boolean      NOT NULL DEFAULT false,
    status         text         NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'arquivado')),
    criado_por     integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    atualizado_por integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    criado_em      timestamptz  NOT NULL DEFAULT now(),
    atualizado_em  timestamptz,
    excluido_em    timestamptz,
    excluido_por   integer      REFERENCES usuarios (id) ON DELETE SET NULL
);
CREATE INDEX idx_doc_sala ON documentos (sala_id, criado_em DESC) WHERE excluido_em IS NULL;
CREATE TRIGGER trg_documentos_atualizado BEFORE UPDATE ON documentos
    FOR EACH ROW EXECUTE FUNCTION fn_atualizado_em();

CREATE TABLE graficos (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sala_id        integer      NOT NULL REFERENCES salas (id) ON DELETE RESTRICT,
    titulo         varchar(255) NOT NULL,
    slug           varchar(120) NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    tipo           text         NOT NULL DEFAULT 'linha'
                                CHECK (tipo IN ('linha', 'barra', 'area', 'pizza', 'dispersao', 'mapa', 'tabela')),
    fonte          varchar(60),
    config         jsonb,        -- séries, eixos, período, estações
    status         text         NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado')),
    publicado_em   timestamptz,
    criado_por     integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    atualizado_por integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    criado_em      timestamptz  NOT NULL DEFAULT now(),
    atualizado_em  timestamptz,
    excluido_em    timestamptz,
    excluido_por   integer      REFERENCES usuarios (id) ON DELETE SET NULL,
    UNIQUE (sala_id, slug)
);
CREATE TRIGGER trg_graficos_atualizado BEFORE UPDATE ON graficos
    FOR EACH ROW EXECUTE FUNCTION fn_atualizado_em();

-- -----------------------------------------------------------------------------
-- 6. Auditoria — somente INSERT (trigger bloqueia UPDATE/DELETE/TRUNCATE)
--    Sem FKs de propósito: o registro sobrevive à exclusão do usuário/sala.
-- -----------------------------------------------------------------------------

CREATE TABLE auditoria (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id   integer,
    usuario_nome varchar(150),  -- cópia do nome no momento da ação
    sala_id      integer,
    modulo       varchar(40)  NOT NULL,
    acao         varchar(40)  NOT NULL,
    entidade     varchar(60),
    entidade_id  bigint,
    descricao    varchar(500),
    dados_antes  jsonb,
    dados_depois jsonb,
    ip           inet,
    user_agent   varchar(255),
    criado_em    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_aud_entidade ON auditoria (entidade, entidade_id);
CREATE INDEX idx_aud_usuario  ON auditoria (usuario_id, criado_em DESC);
CREATE INDEX idx_aud_sala     ON auditoria (sala_id, criado_em DESC);
CREATE INDEX idx_aud_acao     ON auditoria (modulo, acao, criado_em DESC);

CREATE OR REPLACE FUNCTION fn_auditoria_somente_insercao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'auditoria é somente-inserção (% bloqueado)', TG_OP;
END;
$$;
CREATE TRIGGER trg_auditoria_imutavel BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION fn_auditoria_somente_insercao();
CREATE TRIGGER trg_auditoria_sem_truncate BEFORE TRUNCATE ON auditoria
    FOR EACH STATEMENT EXECUTE FUNCTION fn_auditoria_somente_insercao();

-- -----------------------------------------------------------------------------
-- 7. Camada de publicação — única coisa que o site público lê
-- -----------------------------------------------------------------------------

CREATE VIEW vw_boletins_publicados AS
SELECT
    b.id,
    s.slug        AS sala_slug,
    s.nome        AS sala_nome,
    t.slug        AS tipo_slug,
    t.nome        AS tipo_nome,
    t.periodicidade,
    b.titulo,
    b.data_referencia,
    b.competencia,
    b.publicado_em,
    b.pdf_arquivo_id,
    a.tamanho     AS pdf_tamanho,
    a.sha256      AS pdf_sha256
FROM boletins b
JOIN salas s         ON s.id = b.sala_id
JOIN tipos_boletim t ON t.id = b.tipo_id
JOIN arquivos a      ON a.id = b.pdf_arquivo_id AND a.excluido_em IS NULL
WHERE b.status = 'publicado'
  AND b.excluido_em IS NULL
  AND t.publico
  AND s.status = 'ativa'
  AND s.excluido_em IS NULL;

CREATE VIEW vw_graficos_publicados AS
SELECT
    g.id,
    s.slug    AS sala_slug,
    s.nome    AS sala_nome,
    g.slug,
    g.titulo,
    g.tipo,
    g.fonte,
    g.config,
    g.publicado_em,
    g.atualizado_em
FROM graficos g
JOIN salas s ON s.id = g.sala_id
WHERE g.status = 'publicado'
  AND g.excluido_em IS NULL
  AND s.status = 'ativa'
  AND s.excluido_em IS NULL;

CREATE VIEW vw_documentos_publicos AS
SELECT
    d.id,
    s.slug    AS sala_slug,
    s.nome    AS sala_nome,
    c.slug    AS categoria_slug,
    c.nome    AS categoria_nome,
    d.titulo,
    d.descricao,
    d.data_documento,
    d.criado_em,
    d.arquivo_id,
    a.mime,
    a.tamanho,
    a.sha256
FROM documentos d
JOIN salas s    ON s.id = d.sala_id
JOIN arquivos a ON a.id = d.arquivo_id AND a.excluido_em IS NULL
LEFT JOIN documento_categorias c ON c.id = d.categoria_id
WHERE d.publico
  AND d.status = 'ativo'
  AND d.excluido_em IS NULL
  AND s.status = 'ativa'
  AND s.excluido_em IS NULL;

INSERT INTO schema_migrations (versao) VALUES ('0001_schema');

COMMIT;
