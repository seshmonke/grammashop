import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { getToken, reauthenticate, setToken } from "../auth/token-store";

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

// Подстановка сессионного JWT в каждый запрос (см. STACK.md#авторизация).
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Разовая пере-авторизация на 401: протухший JWT молча меняется на новый
// через повторный /auth (свежий initData), исходный запрос повторяется.
// Не трогаем сам /auth (его 401 — настоящий провал, а не протухшая сессия)
// и повторяем не больше одного раза (_retry) — иначе цикл.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const isAuthCall = original?.url?.endsWith("/auth") ?? false;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthCall
    ) {
      original._retry = true;
      try {
        setToken(await reauthenticate());
        return apiClient(original);
      } catch {
        // Обновить сессию не удалось — отдаём исходную 401.
      }
    }
    return Promise.reject(error);
  },
);
