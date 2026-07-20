// Платформенные константы — не env (см. TASKS.md, Спринт 21: «username
// бота — платформенная константа, не env»): это не секрет и не отличается
// между окружениями, зашивать в конфиг незачем.

export const PLATFORM_BOT_USERNAME = "grammashopbot";
// Личка владельца платформы — единственный канал связи для выдачи льготы
// до готовности ЮKassa (см. CONCEPT.md#оплата-подписки-продавцом).
export const PLATFORM_ADMIN_USERNAME = "syzrp";

export function shopLink(sellerId: number): string {
  return `https://t.me/${PLATFORM_BOT_USERNAME}/shop?startapp=${sellerId}`;
}

export function platformAdminChatUrl(): string {
  return `https://t.me/${PLATFORM_ADMIN_USERNAME}`;
}
