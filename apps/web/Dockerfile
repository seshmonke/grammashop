# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/web apps/web
COPY packages/shared packages/shared
# Vite подставляет VITE_API_URL в бандл на этапе сборки (не рантайм-конфиг).
# Не задан — используется дефолт из кода (http://localhost:3000, для
# локальной сборки без докера). Прод-образ в CI собирается с /api (см.
# .github/workflows/ci.yml, docker/Caddyfile — единый origin через Caddy).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @grammashop/shared build
RUN pnpm --filter @grammashop/web build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
