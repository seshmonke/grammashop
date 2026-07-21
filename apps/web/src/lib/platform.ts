// Платформенные константы — не env (см. TASKS.md, Спринт 21: «username
// бота — платформенная константа, не env»): это не секрет и не отличается
// между окружениями, зашивать в конфиг незачем.

export const PLATFORM_BOT_USERNAME = "grammashopbot";

export function shopLink(sellerId: number): string {
  return `https://t.me/${PLATFORM_BOT_USERNAME}/shop?startapp=${sellerId}`;
}
