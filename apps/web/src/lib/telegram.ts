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

export interface TelegramContactResponse {
  responseUnsafe?: {
    contact?: {
      phone_number: string;
      first_name?: string;
      last_name?: string;
      user_id?: number;
    };
  };
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
  // Bot API 7.0+: открывает ссылку во внешнем браузере, не закрывая Mini
  // App (в отличие от обычного <a target="_blank"> внутри Telegram-клиента
  // на некоторых платформах). См. экран-развилку регистрации, Спринт 21.
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  // Bot API 6.9+: нативный попап запроса номера телефона из аккаунта —
  // предзаполняет форму регистрации магазина, не обязателен (отказ — просто
  // пустое поле).
  requestContact?: (
    callback: (sent: boolean, response?: TelegramContactResponse) => void,
  ) => void;
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

// Открывает ссылку во внешнем браузере, не закрывая Mini App (экран-развилка
// «О платформе», Спринт 21). Вне Telegram (dev-браузер) — обычный переход.
export function openExternalLink(url: string): void {
  const webApp = getWebApp();
  if (webApp?.openLink) {
    webApp.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

// Промисифицированный WebApp.requestContact — телефон из аккаунта Telegram
// для предзаполнения формы регистрации магазина (Спринт 21). null — попап
// недоступен (вне Telegram) или пользователь отказался: поле остаётся
// пустым и редактируемым, это не ошибка.
export function requestContactPhone(): Promise<string | null> {
  const webApp = getWebApp();
  if (!webApp?.requestContact) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      webApp.requestContact!((sent, response) => {
        if (!sent) {
          resolve(null);
          return;
        }
        resolve(response?.responseUnsafe?.contact?.phone_number ?? null);
      });
    } catch {
      // Клиент Telegram может не поддерживать метод (старая версия) —
      // синхронный throw вместо отказа через callback, тот же исход:
      // поле остаётся пустым и редактируемым.
      resolve(null);
    }
  });
}
