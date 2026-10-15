#!/bin/sh
# Roda só na PRIMEIRA subida do contêiner do PostgreSQL (volume vazio).
# Cria o usuário da aplicação, sem superusuário, dono apenas do banco da Sala.
# A senha vem do segredo APP_DB_PASSWORD_FILE (ou, por compatibilidade, de APP_DB_PASSWORD).
set -eu
: "${APP_DB_USER:?defina APP_DB_USER}"

if [ -n "${APP_DB_PASSWORD_FILE:-}" ]; then
  APP_DB_PASSWORD="$(tr -d '\r\n' < "$APP_DB_PASSWORD_FILE")"
fi
: "${APP_DB_PASSWORD:?defina o segredo APP_DB_PASSWORD_FILE (ou APP_DB_PASSWORD)}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v usuario="$APP_DB_USER" -v senha="$APP_DB_PASSWORD" -v banco="$POSTGRES_DB" <<'SQL'
CREATE ROLE :"usuario" LOGIN PASSWORD :'senha' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE :"banco" OWNER TO :"usuario";
REVOKE ALL ON DATABASE :"banco" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"banco" TO :"usuario";
-- o esquema public passa a ser do usuário da aplicação (migrações e restauração de backup)
ALTER SCHEMA public OWNER TO :"usuario";
SQL
