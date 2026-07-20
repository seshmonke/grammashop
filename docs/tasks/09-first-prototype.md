### Спринт 9: первый видимый прототип

Цель: витрина seed-продавца открывается в ТМА (и в браузере в
dev-режиме) и показывает его товары — рабочая база, на которой дальше
идёт вся отладка.

Скоуп сознательно read-only со стороны покупателя, товары приходят из
seed-скрипта, не из UI. Изначальный план спринта включал и
продавцовскую админку (CRUD карточек) — при утверждении 18.07.2026
вырезана в отдельный спринт (кандидат в Спринт 10, см. «Очередь»): это
самостоятельный блок размером с авторизацию, витрине всё равно, откуда
в БД товары, а спринт из 10 задач противоречит правилу «один присест».
Также в следующих спринтах, не здесь: корзина/чекаут; регистрация с
оплатой подписки (блокируется онбордингом мерчанта ЮKassa — он идёт
параллельно, см. «Очередь»); фото товаров (пайплайн изображений —
отдельная неспроектированная задача очереди); платформенная админка.

Задачи в порядке зависимости:

- [x] ~~Платформенный Telegram-бот: создать через BotFather, включить
  Mini App (direct link на прод-домен), `BOT_TOKEN` в `.env` локально и
  на VM — без него не проверить подпись `initData`~~ — сделано
  18.07.2026: бот `@grammashopbot`, direct-link Mini App
  `t.me/grammashopbot/shop` (поддерживает `startapp` — заход на витрину
  по `seller_id`), Web App URL `https://grammashop.online`, Same-Origin
  Restriction оставлен включённым (прод-приложение того же origin).
  `TELEGRAM_BOT_TOKEN` вписан в `.env` локально и на VM (по одному
  заполненному значению с каждой стороны — проверено).
- [x] ~~Доменная схема в коде: таблицы Drizzle по
  [STACK.md#доменная-схема-v1](STACK.md#доменная-схема-v1), миграция
  взамен `health_check`, Zod-схемы и enum'ы статусов/тарифов в
  `packages/shared`~~ — сделано 18.07.2026: 8 таблиц + 6 enum'ов
  (`apps/api/src/db/schema.ts`), значения статусов/тарифов — единый
  источник в `packages/shared/src/domain/enums.ts` (Zod-схемы + массивы
  для `pgEnum`). Миграция-baseline пересобрана с нуля
  (`drizzle/0000_domain_schema_v1.sql`, старая заглушечная 0000 удалена —
  реальных данных нигде не было), в неё добавлен `DROP TABLE IF EXISTS
  health_check` для чистки уже развёрнутого прода (на свежих БД no-op).
  `health.service` переведён с вставки в `health_check` на пробу
  `select 1`. Проверено: `docker compose down -v` → миграция создаёт 8
  таблиц/6 enum'ов с FK-каскадами (`order_items.order_id` CASCADE,
  `variant_id` SET NULL), `pnpm -r typecheck` и `pnpm -r test` зелёные.
- [x] ~~Seed-скрипт продавца-разработчика: продавец + активная подписка
  Тарифа 1 + несколько товаров с вариантами (цена / старая цена /
  остаток) — временный мост, пока нет регистрации с оплатой (пункт 3
  продуктовой карты) и продавцовской админки (кандидат в Спринт 10)~~ —
  сделано 18.07.2026: `apps/api/src/db/seed.ts` (`pnpm --filter
  @grammashop/api db:seed`), параметризован по env
  (`DEV_SELLER_TELEGRAM_ID` числом у @userinfobot — с заглушкой
  `999000001`, если не задан; `DEV_SELLER_TELEGRAM_USERNAME`).
  Идемпотентен (перезапуск сносит прежнего dev-продавца по telegram_id и
  создаёт заново, чужих не трогает), guard против NODE_ENV=production.
  Каталог покрывает все состояния витрины: 3 товара / 6 вариантов —
  скидка (old_price), «нет в наличии» (stock 0), учёт остатка выключен
  (null), товар с единственным вариантом. Проверено на локальной БД.
- [x] ~~Авторизация, бэк (TDD): проверка HMAC `initData`, выдача JWT,
  резолвинг роли по Telegram ID (env-список админов);
  `@fastify/rate-limit` на auth сразу (пункт из ревью в «Очереди»)~~ —
  сделано 18.07.2026, дизайн зафиксирован в
  [STACK.md#авторизация](STACK.md#авторизация). Код: верификатор подписи
  `auth/init-data.ts` (timing-safe, окно 24ч), `services/auth.service.ts`
  (резолв `sellerId`+`isAdmin`, blocked не получает продавца),
  `routes/auth.route.ts` (`POST /auth` → JWT на 1ч через `@fastify/jwt`,
  rate-limit 20/мин), контракт в `packages/shared` (`authRequest/
  ResponseSchema`). TDD: 5 юнит-тестов верификатора + 8 интеграционных
  роута (покупатель/продавец/blocked/админ/подделка/протухший/400/429) —
  RED до кода, GREEN после; всего в api 18 зелёных. Env:
  `JWT_SECRET`+`ADMIN_TELEGRAM_IDS` заведены локально и на VM,
  проброшены в контейнер `api` через `docker-compose.yml` (вместе с
  `TELEGRAM_BOT_TOKEN`), фолбэки для CI — в `test/setup.ts`.
- [x] ~~Dev-режим авторизации: mock `initData` для браузера вне Telegram —
  иначе прототип отлаживается только внутри Telegram-клиента~~ — сделано
  18.07.2026, дизайн в [STACK.md#авторизация](STACK.md#авторизация)
  («Dev-режим»). Флаг `AUTH_DEV_MODE=true` (только вне production): `/auth`
  принимает mock-`initData` без валидной HMAC-подписи, доверяя `user.id`
  (токен бота вне Telegram недоступен — подписать нечем). Байпас изолирован
  в `auth/dev-mode.ts` (единственное место в бэке без проверки подписи), два
  предохранителя от прода: флаг мёртв при `NODE_ENV=production` + fail-fast
  в `buildApp()`. TDD: 11 юнит-тестов `dev-mode.test.ts` (флаг/предохранитель/
  разбор) + 3 интеграционных в `auth.route.test.ts` (dev-приём, резолв
  продавца, падение старта в проде), плюс `parseTelegramUser` вынесен из
  `verifyInitData` для переиспользования без дублирования. Проверено живьём
  curl'ом: mock без токена бота → JWT, мусор → 401, prod+флаг → старт падает.
  Мок `window.Telegram.WebApp` на фронте — вместе с чтением `initData` в
  задаче «Авторизация, фронт» ниже (там появится его потребитель).
- [x] ~~Dev-бот + туннель для дизайн-цикла: отдельный бот через BotFather
  (не платформенный), `cloudflared tunnel` с локального dev-server,
  HTTPS-урл туннеля в Mini App dev-бота — проверка Telegram-специфики
  (safe areas, `viewport`, клавиатура, `themeParams`) с телефона без
  деплоя на прод~~ — сделано, см.
  [STACK.md#локальный-дизайн-цикл-и-dev-бот](STACK.md#локальный-дизайн-цикл-и-dev-бот).
  Тулинг (18.07.2026): `cloudflared` установлен (`~/.local/bin`), Vite
  dev-server готов к туннелю — `server.host`, `strictPort` на 5173,
  `allowedHosts` для `*.trycloudflare.com`/`*.ngrok*`, прокси `/api` →
  `api` same-origin как прод-Caddy (`vite.config.ts`); api-client в dev по
  умолчанию бьёт same-origin `/api` (`lib/api-client.ts`); `AUTH_DEV_MODE`+
  `NODE_ENV=development` прокинуты в контейнер `api` через
  `docker-compose.override.yml` (прод-профилю недоступны); весь цикл — одним
  скриптом `scripts/dev-tunnel.sh`. Dev-бот `@grammashopdevbot` заведён.
  Проверено с телефона 19.07.2026: Mini App открылся внутри Telegram,
  витрина-скелет отрисовалась, `/health` подтянулся сквозь туннель
  (`ok`) — цепочка «локалка → cloudflared → host-Vite → приложение +
  прокси `/api` → docker-api» рабочая.
- [x] ~~Авторизация, фронт: чтение `initData` из Telegram SDK,
  axios-интерцептор JWT, гварды трёх групп маршрутов по роли,
  подключение TanStack Query~~ — сделано 19.07.2026 по TDD (5 шагов,
  21 тест), реализация в [STACK.md#авторизация](STACK.md#авторизация),
  «Фронт». Тонкая обёртка над `window.Telegram.WebApp` (`lib/telegram.ts`)
  вместо тяжёлого SDK; `resolveInitData()` (`auth/init-data.ts`) в браузере
  вне Telegram отдаёт mock — потребитель `AUTH_DEV_MODE`, ради которого тот
  делался. Токен — в памяти (`auth/token-store.ts`), не localStorage; axios
  на 401 разово молча пере-авторизуется и повторяет запрос (`lib/api-client.ts`).
  `AuthProvider` бутстрапит сессию до рендера маршрутов (loading/error),
  `useSession`+`SessionContext` (`auth/session-context.ts`); гварды
  `RequireSeller`/`RequireAdmin` и лендинг по `start_param`/роли
  (`auth/guards.tsx`, `auth/Landing.tsx`). `QueryClient` подключён
  (`lib/query-client.ts`, `main.tsx`). `telegram-web-app.js` в index.html.
  Попутно: RTL не делал авто-cleanup (в vitest нет `globals`) — DOM тёк
  между тестами, добавлен явный `cleanup` в `test/setup.ts`. Проверено с
  телефона: дев-бот лендит seed-продавца в «Админку продавца» (реальный
  `initData` → сессия → роль → лендинг).
- [x] ~~Витрина read-only: каталог по `seller_id` из `start_param` +
  карточка товара — первая вёрстка по
  [STACK.md#дизайн-направление](STACK.md#дизайн-направление)~~ — сделано
  19.07.2026. Бэк (TDD, 6 тестов): `GET /shop/:sellerId` — декоратор
  `fastify.authenticate` (JWT-гейт для доменных роутов, `app.ts`),
  контракт `packages/shared/src/schemas/shop.ts`, сервис
  `services/shop.service.ts` (active-продавец + active-товары с вариантами,
  **без ПДн продавца** — только shopName/описание/username, деньги в
  копейках). Фронт (скилл `frontend-design`): тема из Telegram `themeParams`
  через CSS-переменные `--tg-*` (`index.css`), стекло только на шапке
  (`.tg-glass`); `useShopCatalog` (TanStack Query), `shop/seller-id.ts`
  (start_param + dev-фолбэк `VITE_DEV_SELLER_ID`), витрина
  (`routes/storefront/StorefrontHome.tsx`) и карточка товара
  (`ProductDetail.tsx`) с состояниями (скидка зачёркнутой ценой, «нет в
  наличии», «от N ₽» при разбросе цен); утиль `lib/money.ts` и
  `shop/pricing.ts` — по TDD. Проверено headless-браузером (Playwright из
  кеша): витрина и карточка рендерятся сквозь весь стек (auth → каталог),
  скидка/распродано отрабатывают, тема применяется и в light, и в dark,
  горизонтального переполнения нет. Всего 70 тестов (api 39 + web 31).
- [x] ~~Сквозная проверка на бою: `t.me/<бот>/app?startapp=<seller_id>` с
  телефона открывает витрину с seed-товарами~~ — сделано 19.07.2026.
  Задеплоено в прод пушем `main` (коммит `c1942db`, CI test→build→deploy
  зелёный) — доменная миграция `0000_domain_schema_v1` впервые прогнана на
  проде (8 таблиц, `health_check` удалена), риск того, что drizzle сочтёт
  старую заглушечную 0000 уже применённой и пропустит новую схему, не
  реализовался, проверено по SSH (`\dt`, лог `migrations applied`).
  Демо-продавец засеян на проде вручную (`SEED_ALLOW_PROD=1`,
  `DEV_SELLER_TELEGRAM_ID=278003862` — владелец платформы, см.
  [project_owner_telegram_id]): продавец #1 (@syzrp), 3 товара/6 вариантов.
  Проверено с телефона через **платформенного** бота `@grammashopbot`
  (не dev-бот) — `t.me/grammashopbot/shop?startapp=1`: витрина «Демо-магазин»
  открылась, тёмная тема клиента подхватилась, стеклянная шапка на месте.
  Боевой путь целиком: реальный `initData` → прод `/auth` (проверка HMAC
  настоящим токеном бота, без `AUTH_DEV_MODE`) → `GET /api/shop/1` → каталог.
  `/api/health` и auth-гейт (`/api/shop/1` без токена → 401) отдельно
  подтверждены curl'ом с локалки. **Демо-продавец #1 на проде — временные
  данные**, снести перед реальным первым продавцом (см. запись в «Очереди»).

**Спринт 9 закрыт** — все задачи выполнены, вехи 1-7 инженерного трека и
первые 5 задач продуктовой карты (доменная схема → авторизация →
read-only витрина) сквозно проверены на бою.
