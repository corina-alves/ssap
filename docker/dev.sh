#!/bin/sh
# Desenvolvimento (compose.dev.yaml): mantém o volume de node_modules em dia com o
# package-lock.json da pasta e então sobe o "next dev".
#
# O volume só é preenchido pela imagem na primeira subida; depois disso um
# package.json novo não chegava até ele ("Cannot find module ..."). Aqui o lock
# instalado fica marcado em node_modules/.ssap-lock; se o da pasta mudou, as
# dependências são reinstaladas exatamente como no lock (npm ci) e trocadas no
# volume, sem tocar no package-lock.json da pasta.
# A instalação é feita dentro do próprio volume: o /tmp do contêiner é tmpfs sem
# permissão de execução, e os pacotes com instalador (esbuild) falham lá.
set -u

MARCA=node_modules/.ssap-lock
TEMP=node_modules/.ssap-instalacao
atual=$(sha256sum package-lock.json | cut -d' ' -f1)

if [ "$(cat "$MARCA" 2>/dev/null || true)" != "$atual" ]; then
  echo "[dev] package-lock.json mudou: instalando as dependências (npm ci)…"
  rm -rf "$TEMP" && mkdir -p "$TEMP" && cp package.json package-lock.json "$TEMP/"
  if (cd "$TEMP" && npm ci --no-audit --no-fund); then
    find node_modules -mindepth 1 -maxdepth 1 ! -name .ssap-instalacao -exec rm -rf {} +
    find "$TEMP/node_modules" -mindepth 1 -maxdepth 1 -exec mv -t node_modules {} +
    rm -rf "$TEMP"
    echo "$atual" > "$MARCA"
    echo "[dev] dependências atualizadas."
  else
    # Sem rede, por exemplo: sobe com as dependências que já havia e tenta de novo na próxima subida.
    rm -rf "$TEMP"
    echo "[dev] AVISO: a instalação falhou; subindo com as dependências anteriores." >&2
  fi
fi

exec npm run dev
