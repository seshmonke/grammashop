import axios from "axios";

// baseURL: явный VITE_API_URL (в проде CI собирает бандл с `/api` — Caddy
// маршрутизирует его на api:3000, см. Caddyfile) имеет приоритет. Иначе:
// в dev (`vite dev`) — same-origin `/api` через прокси dev-server (см.
// vite.config.ts), чтобы фронт работал и локально, и через HTTPS-туннель
// на телефоне без CORS и второго туннеля; вне dev без явного значения —
// прямой запрос к опубликованному порту api (локальный docker-nginx).
// `||`, а не `??`: пустой VITE_API_URL (build-arg без значения) тоже
// должен падать в дефолт, а не давать пустой baseURL.
export const apiClient = axios.create({
  baseURL:
    import.meta.env["VITE_API_URL"] ||
    (import.meta.env.DEV ? "/api" : "http://localhost:3000"),
});
