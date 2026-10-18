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

# Proxy de saída para as APIs externas — mesmas variáveis do site PHP publicado
# (includes/proxy.php): SSSP_PROXY=host:porta, SSSP_PROXY_AUTH=usuario:senha,
# SSSP_PROXY_TYPE=http e SSSP_NO_PROXY=hosts sem proxy. Viram as variáveis que o
# fetch do Node entende (NODE_USE_ENV_PROXY + HTTPS_PROXY/HTTP_PROXY/NO_PROXY).
# Banco (db) e a própria máquina nunca passam pelo proxy. Se HTTPS_PROXY já
# estiver definida, nada é alterado.
if [ -n "${SSSP_PROXY:-}" ] && [ -z "${HTTPS_PROXY:-}" ]; then
  case "$(printf '%s' "${SSSP_PROXY_TYPE:-http}" | tr 'A-Z' 'a-z')" in
    http | https) ;;
    *)
      echo "entrada: SSSP_PROXY_TYPE=${SSSP_PROXY_TYPE} não é suportado; use um proxy http (o fetch do Node não fala socks5)" >&2
      exit 1
      ;;
  esac
  # node monta o endereço para usuário e senha poderem ter qualquer caractere
  PROXY_URL="$(node -e '
    let p = process.env.SSSP_PROXY.trim();
    if (!/^https?:\/\//i.test(p)) p = `http://${p}`;
    const u = new URL(p);
    const auth = (process.env.SSSP_PROXY_AUTH || "").trim();
    if (auth) {
      const i = auth.indexOf(":");
      u.username = encodeURIComponent(i < 0 ? auth : auth.slice(0, i));
      u.password = i < 0 ? "" : encodeURIComponent(auth.slice(i + 1));
    }
    process.stdout.write(u.href.replace(/\/$/, ""));
  ')"
  SEM_PROXY="localhost,127.0.0.1,::1,db"
  [ -n "${DB_HOST:-}" ] && [ "$DB_HOST" != db ] && SEM_PROXY="$SEM_PROXY,$DB_HOST"
  [ -n "${SSSP_NO_PROXY:-}" ] && SEM_PROXY="$SEM_PROXY,$SSSP_NO_PROXY"
  HTTPS_PROXY="$PROXY_URL" HTTP_PROXY="$PROXY_URL" https_proxy="$PROXY_URL" http_proxy="$PROXY_URL"
  NO_PROXY="$SEM_PROXY" no_proxy="$SEM_PROXY" NODE_USE_ENV_PROXY=1
  export HTTPS_PROXY HTTP_PROXY https_proxy http_proxy NO_PROXY no_proxy NODE_USE_ENV_PROXY
  # endereço sem a senha, só para o log
  echo "entrada: APIs externas via proxy $(printf '%s' "$PROXY_URL" | sed -E 's#//[^@/]*@#//***@#') (sem proxy: $SEM_PROXY)"
fi

exec "$@"
