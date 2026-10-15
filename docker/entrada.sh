#!/bin/sh
# Ponto de entrada dos contêineres da aplicação.
# A senha do banco chega como segredo (arquivo), não como variável de ambiente:
# aqui ela vira DATABASE_URL só dentro do processo. Se DATABASE_URL já estiver
# definida, nada é alterado.
set -eu

if [ -z "${DATABASE_URL:-}" ] && [ -n "${DB_SENHA_ARQUIVO:-}" ]; then
  if [ ! -r "$DB_SENHA_ARQUIVO" ]; then
    echo "entrada: segredo da senha do banco não encontrado em $DB_SENHA_ARQUIVO" >&2
    exit 1
  fi
  # node monta o endereço para a senha poder ter qualquer caractere
  DATABASE_URL="$(node -e '
    const fs = require("node:fs");
    const senha = fs.readFileSync(process.env.DB_SENHA_ARQUIVO, "utf8").replace(/[\r\n]+$/, "");
    if (!senha) { console.error("entrada: o segredo da senha do banco está vazio"); process.exit(1); }
    const e = encodeURIComponent;
    process.stdout.write(`postgres://${e(process.env.DB_USUARIO || "ssap_app")}:${e(senha)}@${process.env.DB_HOST || "db"}:${process.env.DB_PORTA || "5432"}/${e(process.env.DB_NOME || "ssap")}`);
  ')"
  export DATABASE_URL
fi

exec "$@"
