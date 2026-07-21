### Спринт 2: докер и локальное окружение (веха 2 дорожной карты)

Задачи идут в порядке зависимости.

- [x] ~~`docker-compose.yml`: сервис `postgres` + тестовая БД/схема (см.
  `STACK.md#тестирование`)~~ — сделано, `postgres:16-alpine` +
  init-скрипт `docker/postgres-init/001-create-test-db.sql` создаёт
  `grammashop_test` рядом с `grammashop`.
- [x] ~~Multi-stage `Dockerfile` для `apps/api`~~ — сделано
  (`apps/api/Dockerfile`: deps → build (`tsc`) → runtime). Плейсхолдер
  `src/index.ts` — голый `node:http`-сервер, не Fastify: настоящий
  бэкенд-скелет и его TDD — веха 4, здесь только докер-обвязка.
- [x] ~~Multi-stage `Dockerfile` для `apps/web`~~ — сделано
  (`apps/web/Dockerfile`: build → nginx runtime). Плейсхолдер —
  статический `apps/web/public/index.html`, не Vite/React: веха 5.
- [x] ~~Сервисы `api`/`web` в `docker-compose.yml`, подключены к
  `postgres`~~ — сделано, `api` ждёт `postgres` healthy.
- [x] ~~`docker compose up` поднимает всё локально, `api` и `web` отдают
  "hello world"~~ — проверено руками: `api` → `{"message":"hello
  world"}` на :3000, `web` → HTML "hello world" на :5173 (nginx).

Веха 2 дорожной карты закрыта — все задачи Спринта 2 выполнены.
