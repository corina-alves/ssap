# syntax=docker/dockerfile:1
# Sala de Situação — imagens da aplicação (Next.js standalone).
#
#   docker compose up -d --build        (veja compose.yaml e DOCKER.md)
#
# Etapas:
#   deps        dependências completas (npm ci)
#   ferramentas código + dependências completas: migrações e scripts (tsx)
#   dev         desenvolvimento (next dev), usada só pelo compose.dev.yaml
#   build       next build → .next/standalone
#   app         imagem final: só o necessário para rodar, usuário sem privilégios

# Versão fixa: atualize de propósito (e teste) em vez de receber uma nova a cada build.
ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    TZ=America/Sao_Paulo
WORKDIR /app
# Monta DATABASE_URL a partir do segredo (arquivo) antes de iniciar o processo.
COPY docker/entrada.sh /usr/local/bin/entrada
# /dados existe em todas as imagens com o dono certo: o volume nasce gravável pelo usuário "node".
RUN sed -i 's/\r$//' /usr/local/bin/entrada && chmod 755 /usr/local/bin/entrada \
 && mkdir -p /dados/storage /dados/cache && chown -R node:node /dados
ENTRYPOINT ["entrada"]

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS ferramentas
COPY . .
ENV NODE_ENV=production \
    STORAGE_DIR=/dados/storage \
    CACHE_DIR=/dados/cache
USER node
# Sem CMD: o compose define o comando (npm run db:migrar, npm run admin:criar).

FROM deps AS dev
ENV NODE_ENV=development \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# .next fica num volume próprio (compose.dev.yaml), gravável pelo usuário "node".
RUN mkdir -p /app/.next && chown node:node /app/.next
USER node
EXPOSE 3000
# O código vem por volume (compose.dev.yaml).
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY . .
# O build não conecta no banco; a variável só precisa ter formato válido.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build npm run build

FROM base AS app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    STORAGE_DIR=/dados/storage \
    CACHE_DIR=/dados/cache

RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000
VOLUME ["/dados/storage", "/dados/cache"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
