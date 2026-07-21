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
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm --filter @grammashop/shared build
RUN pnpm --filter @grammashop/api build
# --legacy: pnpm-workspace.yaml не включает injectWorkspacePackages (не
# трогаем эту настройку — она меняет линковку воркспейсов в обычной
# разработке, а не только сборку образа, см.
# docs/tasks/23-pdn-and-cheap-debt.md). Раскладывает только @grammashop/api
# с прод-зависимостями в изолированный node_modules — без apps/web и
# без devDependencies (tsx и т.п.), которые тащил COPY --from=build /repo.
RUN pnpm --filter @grammashop/api --prod deploy --legacy /prod/api

FROM node:22-alpine AS runtime
RUN corepack enable
# pg_dump/psql для nightly-бэкапа и weekly restore-check (см.
# src/db/backup.ts, src/db/restore-check.ts) — версия клиента должна
# совпадать с postgres:16-alpine из docker-compose.yml. gnupg —
# шифрование/расшифровка дампов (см. STACK.md#бэкапы).
RUN apk add --no-cache postgresql16-client gnupg
WORKDIR /app
COPY --from=build /prod/api ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
