import { createHmac, timingSafeEqual } from "node:crypto";

// Проверка подписи Telegram WebApp initData (см. STACK.md#авторизация).
// Гарантирует, что данные пришли из Telegram-клиента и не подделаны:
//   secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
//   hash       = HMAC_SHA256(key=secret_key,   data=data_check_string)
// где data_check_string — все поля кроме hash, отсортированные по ключу
// и склеенные как `key=value` через '\n'. ПДн из initData (имя/username)
// не логируются — при ошибке наружу уходит только факт провала.

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface VerifiedInitData {
  user: TelegramUser;
  authDate: Date;
}

export interface VerifyInitDataOptions {
  // Если задано — initData старше этого возраста (по auth_date) отвергается
  // как протухший/переигранный. Не задано — проверка возраста не делается.
  maxAgeSeconds?: number;
}

export class InitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitDataError";
  }
}

// Разбор поля `user` из initData в типизированного пользователя. Вынесено,
// чтобы dev-режим (auth/dev-mode.ts, без проверки подписи) извлекал id тем
// же кодом, а не своей копией. ПДн из user наружу не логируются.
export function parseTelegramUser(params: URLSearchParams): TelegramUser {
  const userRaw = params.get("user");
  if (!userRaw) {
    throw new InitDataError("initData без поля user");
  }
  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    throw new InitDataError("initData: поле user — не валидный JSON");
  }
  if (typeof user.id !== "number") {
    throw new InitDataError("initData: user.id отсутствует или не число");
  }
  return user;
}

export function verifyInitData(
  initData: string,
  botToken: string,
  options: VerifyInitDataOptions = {},
): VerifiedInitData {
  const params = new URLSearchParams(initData);

  const hash = params.get("hash");
  if (!hash) {
    throw new InitDataError("initData без поля hash");
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // Сравнение постоянного времени — не даём подбирать hash по таймингу.
  const provided = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new InitDataError("подпись initData не сошлась");
  }

  const authDateRaw = params.get("auth_date");
  const authDateSeconds = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDateSeconds)) {
    throw new InitDataError("initData без корректного auth_date");
  }
  if (options.maxAgeSeconds !== undefined) {
    const ageSeconds = Math.floor(Date.now() / 1000) - authDateSeconds;
    if (ageSeconds > options.maxAgeSeconds) {
      throw new InitDataError("initData протух (auth_date слишком старый)");
    }
  }

  const user = parseTelegramUser(params);

  return { user, authDate: new Date(authDateSeconds * 1000) };
}
