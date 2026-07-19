// Тонкая типизированная обёртка над Telegram WebApp SDK (window.Telegram.
// WebApp, скрипт telegram-web-app.js подключён в index.html). Полноценный
// SDK (@telegram-apps/sdk) не тянем: авторизации нужны только сырой initData
// и start_param, а прямой доступ к window тривиально мокается в dev и тестах.
// themeParams/viewport/safe-areas — забота вёрстки витрины, добавим тогда.

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramWebApp {
  // Сырая подписанная строка initData (пустая — если открыто вне Telegram).
  initData: string;
  initDataUnsafe?: {
    start_param?: string;
    user?: TelegramUser;
  };
  ready?: () => void;
  expand?: () => void;
}

export function getWebApp(): TelegramWebApp | undefined {
  return (globalThis as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram
    ?.WebApp;
}

// seller_id витрины приходит в start_param (ТМА-ссылка t.me/<bot>/app?startapp=<seller_id>).
export function getStartParam(): string | undefined {
  return getWebApp()?.initDataUnsafe?.start_param;
}

// Сообщаем Telegram, что приложение готово, и разворачиваем на весь экран.
// No-op вне Telegram (dev-браузер). Полная работа с viewport/safe-areas —
// в вёрстке витрины.
export function initTelegram(): void {
  const webApp = getWebApp();
  webApp?.ready?.();
  webApp?.expand?.();
}
