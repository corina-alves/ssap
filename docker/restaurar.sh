#!/bin/sh
# Restaura um backup feito por backup.sh (serviço "restaurar" do compose.yaml).
#   docker compose stop app
#   docker compose run --rm -e CONFIRMAR=SIM restaurar ssap_AAAAMMDD-HHMMSS
#   docker compose up -d
#
# ATENÇÃO: o banco volta a ser exatamente o do backup — o que foi gravado depois
# dele é perdido. Por isso exige CONFIRMAR=SIM. Os arquivos enviados são
# copiados de volta sem apagar nenhum arquivo que já esteja no volume.
set -eu

nome="${1:-}"
origem="/backups/$nome"
if [ -z "$nome" ] || [ ! -f "$origem/banco.dump" ]; then
  echo "Uso: restaurar <pasta do backup>. Backups disponíveis:" >&2
  ls -1 /backups 2>/dev/null | grep '^ssap_' >&2 || echo "  (nenhum)" >&2
  exit 2
fi
if [ "${CONFIRMAR:-}" != "SIM" ]; then
  echo "restaurar: o banco atual será SUBSTITUÍDO pelo do backup $nome." >&2
  echo "Para confirmar, rode de novo com:  -e CONFIRMAR=SIM" >&2
  exit 3
fi

if [ -f "$origem/SHA256SUMS" ]; then
  echo "restaurar: conferindo a integridade..."
  (cd "$origem" && sha256sum -c SHA256SUMS)
fi

PGPASSWORD="$(tr -d '\r\n' < "${DB_SENHA_ARQUIVO:?defina DB_SENHA_ARQUIVO}")"
export PGPASSWORD
export PGHOST="${DB_HOST:-db}" PGPORT="${DB_PORTA:-5432}" PGUSER="${DB_USUARIO:-ssap_app}" PGDATABASE="${DB_NOME:-ssap}"

echo "restaurar: banco $PGDATABASE..."
# uma transação só: ou restaura tudo, ou o banco fica como estava
pg_restore --clean --if-exists --no-owner --no-acl --single-transaction --exit-on-error --dbname="$PGDATABASE" "$origem/banco.dump"

if [ -f "$origem/arquivos.tar.gz" ]; then
  echo "restaurar: arquivos enviados..."
  tar -xzf "$origem/arquivos.tar.gz" -C /dados/storage
fi

echo "restaurar: pronto. Suba a aplicação: docker compose up -d"
