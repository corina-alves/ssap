#!/bin/sh
# Backup do banco e dos arquivos enviados (serviço "backup" do compose.yaml).
#   docker compose run --rm backup
# Cria /backups/ssap_AAAAMMDD-HHMMSS/ com:
#   banco.dump        pg_dump em formato próprio (restaura com pg_restore)
#   arquivos.tar.gz   PDFs e documentos (volume "arquivos")
#   SHA256SUMS        conferência de integridade
# Não apaga backups antigos, a menos que BACKUP_MANTER_DIAS esteja definido.
set -eu

PGPASSWORD="$(tr -d '\r\n' < "${DB_SENHA_ARQUIVO:?defina DB_SENHA_ARQUIVO}")"
export PGPASSWORD
export PGHOST="${DB_HOST:-db}" PGPORT="${DB_PORTA:-5432}" PGUSER="${DB_USUARIO:-ssap_app}" PGDATABASE="${DB_NOME:-ssap}"

destino="/backups/ssap_$(date +%Y%m%d-%H%M%S)"
mkdir -p "$destino"
# se algo falhar, não deixa um backup pela metade com cara de bom
trap 'echo "backup: FALHOU — removendo $destino" >&2; rm -rf "$destino"' EXIT

echo "backup: banco $PGDATABASE em $PGHOST..."
pg_dump --format=custom --no-owner --no-acl --file="$destino/banco.dump"
pg_restore --list "$destino/banco.dump" > /dev/null # confere se o arquivo é legível

echo "backup: arquivos enviados..."
tar -czf "$destino/arquivos.tar.gz" -C /dados/storage .

(cd "$destino" && sha256sum banco.dump arquivos.tar.gz > SHA256SUMS)
trap - EXIT

if [ -n "${BACKUP_MANTER_DIAS:-}" ]; then
  echo "backup: removendo backups com mais de $BACKUP_MANTER_DIAS dias..."
  find /backups -maxdepth 1 -type d -name 'ssap_*' -mtime "+$BACKUP_MANTER_DIAS" -exec rm -rf {} +
fi

echo "backup: pronto em $(basename "$destino")"
ls -lh "$destino"
