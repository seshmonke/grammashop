### Спринт 4: бэкенд-скелет Fastify (веха 4 дорожной карты)

Задачи идут в порядке зависимости. TDD (см. `STACK.md#методология---tdd`):
сначала падающий тест через `fastify.inject()`, потом код.

- [x] ~~Зависимости в `apps/api`: `fastify` (runtime), `vitest` + `tsx`
  (dev); `dev`/`test`-скрипты вместо TODO-заглушек~~ — сделано
  (`apps/api/package.json`); `dev` — `tsx watch`, `test` — `vitest run`.
- [x] ~~Zod-схема ответа health-check в `packages/shared`, шарится между
  route и (в будущем) фронтендом~~ — сделано
  (`packages/shared/src/schemas/health.ts`, `healthResponseSchema`).
  Попутно вскрылось: `packages/shared` был без реальной сборки (`main`
  смотрел на `src/*.ts` напрямую — рантайм-`node` не умеет исполнять
  TypeScript). Добавлена `tsc`-сборка (`dist`), `pnpm -r` собирает
  воркспейсы в топологическом порядке сам — см.
  [STACK.md#монорепо](../STACK.md#монорепо).
- [x] ~~RED: падающий интеграционный тест `GET /health` через
  `fastify.inject()` — против реальной тестовой БД (`grammashop_test`),
  без мока Drizzle~~ — сделано (`apps/api/src/routes/health.route.test.ts`),
  тест сначала упал на отсутствующем `app.ts`, затем (после реализации) —
  на некорректной загрузке `.env` (см. ниже).
- [x] ~~GREEN: `routes → services → db` для `/health` (сервис пишет в
  плейсхолдер-таблицу `health_check`), `app.ts` (`buildApp()`), `index.ts`
  переключён на Fastify вместо заглушки на `node:http`~~ — сделано
  (`apps/api/src/app.ts`, `routes/health.route.ts`,
  `services/health.service.ts`). Попутно исправлена скрытая проблема:
  `dotenv/config` (и в новом `index.ts`, и в уже существовавшем
  `db/migrate.ts`) искал `.env` от `cwd`, а не от корня репо — молча не
  находил файл при запуске через `pnpm --filter`. Вынесено в общий
  `apps/api/src/env.ts` (резолвится от расположения файла, как уже было
  сделано для `migrationsFolder`).
- [x] ~~Проверка в докере с нуля: `docker compose up`, `curl /health`
  отдаёт `{"status":"ok"}`~~ — сделано, дважды: `docker compose down -v` →
  `up --build` → `curl localhost:3000/health` → `{"status":"ok"}`,
  `health_check` пишется. Заодно всплыло, что `grammashop_test` мигрировалась
  только вручную (эта ручная привычка тянулась из Спринта 3) — теперь
  `pnpm test` мигрирует её сам через vitest `globalSetup`
  (`apps/api/src/test/global-setup.ts`), иначе тесты ломались после
  каждого `down -v`. См. [STACK.md#тестирование](../STACK.md#тестирование).

Веха 4 дорожной карты закрыта — все задачи Спринта 4 выполнены.
