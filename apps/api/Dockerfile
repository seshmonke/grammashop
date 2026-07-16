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

FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node apps/api/dist/db/migrate.js && node apps/api/dist/index.js"]
