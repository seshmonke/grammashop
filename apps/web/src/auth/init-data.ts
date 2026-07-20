import { getWebApp } from "../lib/telegram";

// Резолвинг initData для обмена на сессию (POST /auth). Внутри Telegram —
// реальная подписанная строка из WebApp SDK. В браузере вне Telegram (dev)
// её нет: синтезируем mock, который бэк принимает при AUTH_DEV_MODE=true
// (см. STACK.md#авторизация, «Dev-режим»). Это тот самый потребитель
// dev-режима, ради которого он делался раньше фронта.

// telegram_id dev-пользователя для браузерной отладки. По умолчанию — тот
// же плейсхолдер, что у seed-скрипта (apps/api/src/db/seed.ts), чтобы в
// браузере залогиниться seed-продавцом. Переопределяется VITE_DEV_TELEGRAM_ID.
const DEV_TELEGRAM_ID = Number(
  import.meta.env["VITE_DEV_TELEGRAM_ID"] ?? 999000001,
);

export function buildMockInitData(user: {
  id: number;
  first_name?: string;
  username?: string;
}): string {
  const params = new URLSearchParams({
    user: JSON.stringify({ first_name: "Dev", ...user }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });
  return params.toString();
}

// Отдельный класс ошибки (не голый Error) — AuthProvider перехватывает
// именно этот случай и уводит на публичный лендинг вместо экрана
// "не удалось войти" (см. TASKS.md, Спринт 15).
export class InitDataUnavailableError extends Error {
  constructor() {
    super("initData недоступен — приложение открыто вне Telegram");
    this.name = "InitDataUnavailableError";
  }
}

// username dev-пользователя — нужен для отладки регистрации магазина
// (Спринт 21: username обязателен из initData). Не задан по умолчанию —
// как и раньше, чтобы не менять поведение существующих сценариев.
const DEV_TELEGRAM_USERNAME = import.meta.env["VITE_DEV_TELEGRAM_USERNAME"] as
  | string
  | undefined;

export function resolveInitData(): string {
  const real = getWebApp()?.initData;
  if (real) return real;
  if (import.meta.env.DEV) {
    return buildMockInitData({
      id: DEV_TELEGRAM_ID,
      first_name: "Dev",
      ...(DEV_TELEGRAM_USERNAME ? { username: DEV_TELEGRAM_USERNAME } : {}),
    });
  }
  // Прод вне Telegram: настоящего initData нет и mock запрещён — честно
  // падаем, а не притворяемся авторизованными.
  throw new InitDataUnavailableError();
}
