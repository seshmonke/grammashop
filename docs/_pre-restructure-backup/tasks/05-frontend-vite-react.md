### Спринт 5: UX/UI-скелет React + Vite (веха 5 дорожной карты)

Задачи идут в порядке зависимости. Первый компонент — по TDD (см.
`STACK.md#методология---tdd`): сначала падающий тест через
`@testing-library/react`, потом код.

- [x] ~~Vite + React + TypeScript в `apps/web`: зависимости, `vite.config.ts`,
  реальные `dev`/`build`-скрипты вместо TODO-заглушек, `src/main.tsx`
  монтирует React-дерево, `index.html` — Vite-шаблон вместо
  `public/index.html`-заглушки~~ — сделано.
- [x] ~~React Router: три группы маршрутов (витрина / продавцовская админка /
  платформенная админка) — плейсхолдер-страница на каждую, см.
  `STACK.md#роутинг`~~ — сделано (`src/router.tsx`, `src/routes/*`);
  ограничение доступа по роли из сессии — отдельная задача авторизации на
  фронте, не в скоупе этого скелета.
- [x] ~~`shadcn/ui` подключён (Tailwind + Radix), базовая конфигурация, один
  компонент кита используется на плейсхолдер-странице, см.
  `STACK.md#ui-кит`~~ — сделано (Tailwind v4 через `@tailwindcss/vite`,
  `components.json`, `Button` на витрине).
- [x] ~~axios-клиент в `apps/web`, настроен на обращение к `apps/api`
  (`baseURL` из env), см. `STACK.md#http-клиент`~~ — сделано
  (`src/lib/api-client.ts`, `VITE_API_URL` в `.env.example`).
- [x] ~~RED: падающий тест компонента через `@testing-library/react` +
  Vitest — компонент отображает статус `/health`, полученный через
  axios-клиент~~ — сделано (`HealthStatus.test.tsx`, упал на отсутствующем
  `HealthStatus.tsx`).
- [x] ~~GREEN: компонент реализован, тест зелёный~~ — сделано
  (`src/components/HealthStatus.tsx`).
- [x] ~~Проверка в докере с нуля: `apps/web/Dockerfile` собирает реальный
  Vite-билд (не статический `public/index.html`), `docker compose up` —
  `web` отдаёт React-приложение~~ — проверено руками через `docker compose
  down -v` → `up --build` → Playwright-браузер против `localhost:5173`:
  `/` показывает "Витрина" + shadcn-кнопку + статус `/health` = "ok" (живой
  запрос к `apps/api` через axios, без моков), `/seller` и `/platform`
  отдают свои плейсхолдеры. Побочная находка: у nginx не было SPA-fallback
  (`try_files` на `index.html`) — прямые заходы на `/seller`/`/platform`
  падали 404, пофикшено `apps/web/nginx.conf` + прописано в Dockerfile.
  Заодно пришлось добавить `@fastify/cors` в `apps/api`
  (`app.ts`) — без него браузер с `:5173` не мог достучаться до `:3000`.

Веха 5 дорожной карты закрыта — все задачи Спринта 5 выполнены.
