### Спринт 3: база данных — Drizzle + Postgres (веха 3 дорожной карты)

Задачи идут в порядке зависимости.

- [x] ~~Drizzle ORM + drizzle-kit в `apps/api`: зависимости,
  `drizzle.config.ts`, клиент подключения к Postgres через `DATABASE_URL`
  (уже в `.env.example`)~~ — сделано (`apps/api/src/db/client.ts`).
- [x] ~~Базовая схема-заглушка (одна таблица-плейсхолдер)~~ — сделано
  (`apps/api/src/db/schema.ts`, таблица `health_check`); настоящая
  доменная схема — веха 4 вместе со скелетом Fastify по TDD.
- [x] ~~Первая миграция (`drizzle-kit generate` + применение)~~ — сделано,
  `apps/api/drizzle/0000_majestic_captain_britain.sql`, прогнана руками
  и на `grammashop`, и на `grammashop_test`.
- [x] ~~Проверка миграций в докере~~ — сделано: `apps/api/src/db/migrate.ts`
  запускается в `CMD` контейнера `api` перед стартом сервера (см.
  `apps/api/Dockerfile`), `DATABASE_URL` прокинут в `docker-compose.yml`.
  Проверено руками с нуля: `docker compose down -v` → `docker compose up`
  → лог `migrations applied` → `\dt` в `grammashop` показывает
  `health_check` → `curl localhost:3000` отдаёт hello world.

Веха 3 дорожной карты закрыта — все задачи Спринта 3 выполнены.
