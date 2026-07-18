import { parseTelegramUser } from "./init-data.js";

// Dev-режим авторизации (см. STACK.md#авторизация, «Dev-режим»). Вне
// Telegram настоящего initData нет — dev-сборка фронта шлёт mock-initData
// без валидной HMAC-подписи (токен бота на фронт не попадает, подделать
// подпись нечем). Этот модуль — единственное место в бэке, где подпись
// initData НЕ проверяется, поэтому он изолирован и обвешан предохранителями,
// а не подмешан опцией в security-критичный verifyInitData.

// Включается только явным флагом и только вне production. В проде mock без
// подписи = кто угодно представляется любым Telegram ID, поэтому здесь
// прод исключён жёстко, а не полагается на «забудут выставить флаг».
export function isAuthDevModeEnabled(): boolean {
  return (
    process.env.AUTH_DEV_MODE === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

// Fail-fast на старте (см. buildApp): флаг, выставленный в проде, — это не
// «тихо проигнорированная опция», а сигнал о неверной конфигурации деплоя.
// Падаем громко, а не поднимаемся с потенциальной дырой. Без override
// (в отличие от seed-guard'а): dev-байпас проверки подписи в проде не
// бывает осознанно легитимным.
export function assertAuthDevModeSafe(): void {
  if (
    process.env.AUTH_DEV_MODE === "true" &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "AUTH_DEV_MODE=true при NODE_ENV=production — dev-байпас проверки " +
        "подписи initData в проде запрещён (см. STACK.md#авторизация)",
    );
  }
}

// Разбор mock-initData БЕЗ проверки подписи и без проверки возраста
// auth_date — возвращает только telegram_id. Вызывать исключительно за
// isAuthDevModeEnabled(). Формат поля user — тот же, что в реальном
// initData, поэтому переиспользуем parseTelegramUser.
export function parseDevInitData(initData: string): number {
  const params = new URLSearchParams(initData);
  const user = parseTelegramUser(params);
  return user.id;
}
